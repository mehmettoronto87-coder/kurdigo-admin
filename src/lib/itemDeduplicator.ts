import { collection, deleteDoc, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { ItemMediaStatus, SceneAsset } from '../types/admin';

function unitOrderOf(unitId: string | undefined): number {
  const match = (unitId ?? '').match(/^unit(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function globalLessonOrder(lesson: any): number {
  return unitOrderOf(lesson.unitId) * 100 + (lesson.lessonOrder ?? 0);
}

function normalizeKu(ku: string): string {
  return ku.trim().toLocaleLowerCase('tr-TR');
}

function remapId(id: string | undefined, remap: Map<string, string>): string | undefined {
  if (!id) return id;
  return remap.get(id) ?? id;
}

function remapIds(ids: string[] | undefined, remap: Map<string, string>): string[] | undefined {
  if (!ids) return ids;
  return [...new Set(ids.map(id => remap.get(id) ?? id))];
}

function remapStep(step: any, remap: Map<string, string>): any {
  if (!step) return step;
  const s = { ...step };
  if (s.itemId)         s.itemId         = remapId(s.itemId,         remap);
  if (s.imageItemId)    s.imageItemId     = remapId(s.imageItemId,    remap);
  if (s.correctItemId)  s.correctItemId   = remapId(s.correctItemId,  remap);
  if (s.targetItemId)   s.targetItemId    = remapId(s.targetItemId,   remap);
  if (s.blankItemId)    s.blankItemId     = remapId(s.blankItemId,    remap);
  if (s.oddItemId)      s.oddItemId       = remapId(s.oddItemId,      remap);
  if (s.distractorItemIds) s.distractorItemIds = remapIds(s.distractorItemIds, remap);
  if (s.itemIds)        s.itemIds         = remapIds(s.itemIds,        remap);
  if (s.pairs) {
    s.pairs = s.pairs.map((p: any) => ({
      ...p,
      leftItemId:  p.leftItemId  ? (remap.get(p.leftItemId)  ?? p.leftItemId)  : p.leftItemId,
      rightItemId: p.rightItemId ? (remap.get(p.rightItemId) ?? p.rightItemId) : p.rightItemId,
    }));
  }
  return s;
}

export interface DeduplicationReport {
  totalWords: number;
  duplicateWords: number;
  remappedIds: number;
  updatedLessons: number;
  updatedSceneAssets?: number;
  deletedSceneAssets?: number;
  details: Array<{ ku: string; ids: string[]; canonical: string; hadMedia: boolean }>;
}

export async function deduplicateCurriculumItems(
  onProgress: (msg: string) => void,
): Promise<DeduplicationReport> {
  onProgress('Tüm dersler çekiliyor...');

  const snap = await getDocs(collection(db, 'adminLessons'));
  const lessons = snap.docs.map(d => ({ ...d.data(), id: d.id } as any));
  const assetSnap = await getDocs(collection(db, 'sceneLibrary')).catch(() => null);
  const sceneAssets = assetSnap?.docs.map(d => ({ ...d.data(), id: d.id } as SceneAsset)) ?? [];
  onProgress(`${lessons.length} ders bulundu. Kelimeler analiz ediliyor...`);

  // Sort by full curriculum order so the first-ever card is canonical.
  lessons.sort((a, b) => globalLessonOrder(a) - globalLessonOrder(b));

  // Build: normalizedKu → Map<id, canonical data candidate>
  type ItemEntry = {
    id: string;
    item: any;
    media?: ItemMediaStatus;
    hasImage: boolean;
    hasAudio: boolean;
    lessonOrder: number;
    lessonId: string;
  };
  const wordMap = new Map<string, Map<string, ItemEntry>>();

  for (const lesson of lessons) {
    const media = (lesson.mediaStatus ?? {}) as Record<string, ItemMediaStatus>;
    const order = globalLessonOrder(lesson);
    for (const item of lesson.items ?? []) {
      const key = normalizeKu(item.ku ?? '');
      if (!key) continue;
      if (!wordMap.has(key)) wordMap.set(key, new Map());
      const idMap = wordMap.get(key)!;
      const existing = idMap.get(item.id);
      const m = (media[item.id] ?? {}) as Partial<ItemMediaStatus>;
      if (existing) {
        if (m.imageUrl) existing.hasImage = true;
        if (m.audioUrl) existing.hasAudio = true;
        if (!existing.media?.imageUrl && !existing.media?.audioUrl && (m.imageUrl || m.audioUrl)) {
          existing.media = m as ItemMediaStatus;
        }
      } else {
        idMap.set(item.id, {
          id: item.id,
          item,
          media: (m.imageUrl || m.audioUrl) ? m as ItemMediaStatus : undefined,
          hasImage: Boolean(m.imageUrl),
          hasAudio: Boolean(m.audioUrl),
          lessonOrder: order,
          lessonId: lesson.id,
        });
      }
    }
  }

  // Build remap: nonCanonical → canonical
  const remap = new Map<string, string>();
  const canonicalById = new Map<string, ItemEntry>();
  const canonicalByKu = new Map<string, ItemEntry>();
  const details: DeduplicationReport['details'] = [];

  for (const [ku, idMap] of Array.from(wordMap.entries())) {
    if (idMap.size <= 1) continue;
    const entries = [...idMap.values()];

    // Canonical = first introduction in the curriculum. Media never makes a
    // later duplicate canonical; otherwise "Silav" could change identity later.
    const mediaScore = (e: ItemEntry) => (e.hasImage ? 2 : 0) + (e.hasAudio ? 1 : 0);
    const sorted = [...entries].sort((a, b) => {
      const orderDiff = a.lessonOrder - b.lessonOrder;
      if (orderDiff !== 0) return orderDiff;
      const scoreDiff = mediaScore(b) - mediaScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.id.localeCompare(b.id);
    });
    const canonical = sorted[0];
    canonicalById.set(canonical.id, canonical);
    canonicalByKu.set(ku, canonical);

    for (const entry of entries) {
      if (entry.id !== canonical.id) remap.set(entry.id, canonical.id);
    }

    details.push({
      ku,
      ids: entries.map(e => e.id),
      canonical: canonical.id,
      hadMedia: canonical.hasImage || canonical.hasAudio,
    });
  }

  onProgress(`${remap.size} tekrarlı ID tespit edildi. Dersler güncelleniyor...`);

  if (remap.size === 0) {
    return { totalWords: wordMap.size, duplicateWords: details.length, remappedIds: 0, updatedLessons: 0, details };
  }

  onProgress('Ortam kütüphanesi duplicate assetleri birleştiriliyor...');
  const sceneResult = await mergeSceneLibraryAssets(sceneAssets, remap, canonicalById, onProgress);

  let updatedLessons = 0;

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    let changed = false;
    const mediaStatus = { ...(lesson.mediaStatus ?? {}) } as Record<string, ItemMediaStatus>;

    for (const [oldId, canonicalId] of Array.from(remap.entries())) {
      if (!(oldId in mediaStatus)) continue;
      const oldMedia = mediaStatus[oldId];
      const canonicalMedia = mediaStatus[canonicalId];
      if ((oldMedia?.imageUrl || oldMedia?.audioUrl) && !canonicalMedia?.imageUrl && !canonicalMedia?.audioUrl) {
        mediaStatus[canonicalId] = oldMedia;
      }
      delete mediaStatus[oldId];
      changed = true;
    }

    // Remap items. For duplicates, replace the whole item with the canonical
    // item object, not only the ID. This preserves original params/tags/media identity.
    const seenKu = new Set<string>();
    const newItems: any[] = [];
    for (const item of lesson.items ?? []) {
      const key = normalizeKu(item.ku ?? '');
      if (seenKu.has(key)) { changed = true; continue; }
      seenKu.add(key);
      const canonicalId = remap.get(item.id) ?? item.id;
      const canonical = canonicalById.get(canonicalId) ?? canonicalByKu.get(key);
      if (canonicalId !== item.id || canonical?.item) { changed = true; }
      newItems.push(canonical?.item ? { ...canonical.item, id: canonicalId } : { ...item, id: canonicalId });
    }

    // Remap reviewItemIds
    const oldReviewIds = lesson.reviewItemIds ?? [];
    const newReviewIds = [...new Set(oldReviewIds.map((id: string) => remap.get(id) ?? id))];
    if (JSON.stringify(newReviewIds) !== JSON.stringify(oldReviewIds)) changed = true;

    const oldExternalIds = lesson.externalDistractorItemIds ?? [];
    const newExternalIds = [...new Set(oldExternalIds.map((id: string) => remap.get(id) ?? id))];
    if (JSON.stringify(newExternalIds) !== JSON.stringify(oldExternalIds)) changed = true;

    // Remap steps
    const newSteps = (lesson.steps ?? []).map((step: any) => {
      const remapped = remapStep(step, remap);
      if (JSON.stringify(remapped) !== JSON.stringify(step)) changed = true;
      return remapped;
    });

    if (!changed) continue;

    const updated = {
      ...lesson,
      items: newItems,
      reviewItemIds: newReviewIds,
      externalDistractorItemIds: newExternalIds,
      steps: newSteps,
      mediaStatus,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'adminLessons', lesson.id), updated);

    // Re-sync publicLessons if lesson is live
    if (lesson.status === 'live') {
      const pubSnap = await getDoc(doc(db, 'publicLessons', lesson.id));
      if (pubSnap.exists()) {
        await setDoc(doc(db, 'publicLessons', lesson.id), {
          ...updated,
          publishedAt: (pubSnap.data() as any)?.publishedAt ?? new Date().toISOString(),
        });
      }
    }

    updatedLessons++;
    onProgress(`[${i + 1}/${lessons.length}] Güncellendi: ${lesson.title ?? lesson.id}`);
  }

  return {
    totalWords: wordMap.size,
    duplicateWords: details.length,
    remappedIds: remap.size,
    updatedLessons,
    updatedSceneAssets: sceneResult.updated,
    deletedSceneAssets: sceneResult.deleted,
    details,
  };
}

async function mergeSceneLibraryAssets(
  assets: SceneAsset[],
  remap: Map<string, string>,
  canonicalById: Map<string, { id: string; item: any; media?: ItemMediaStatus; lessonId: string }>,
  onProgress: (msg: string) => void,
): Promise<{ updated: number; deleted: number }> {
  if (assets.length === 0) return { updated: 0, deleted: 0 };

  const assetsById = new Map(assets.map(asset => [asset.id, asset]));
  const grouped = new Map<string, SceneAsset[]>();
  for (const asset of assets) {
    const canonicalId = remap.get(asset.id) ?? asset.id;
    if (!grouped.has(canonicalId)) grouped.set(canonicalId, []);
    grouped.get(canonicalId)!.push(asset);
  }

  let updated = 0;
  let deleted = 0;

  for (const [canonicalId, group] of grouped.entries()) {
    if (group.length <= 1 && group[0]?.id === canonicalId) continue;

    const canonicalItem = canonicalById.get(canonicalId)?.item;
    const existingCanonical = assetsById.get(canonicalId);
    const sorted = [...group].sort((a, b) => {
      if (a.id === canonicalId) return -1;
      if (b.id === canonicalId) return 1;
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    });
    const base = existingCanonical ?? sorted[0];
    const withImage = sorted.find(a => a.storageUrl);
    const withAudio = sorted.find(a => a.audioUrl);
    const now = new Date().toISOString();

    const merged: SceneAsset = {
      ...base,
      id: canonicalId,
      mediaId: canonicalId,
      primaryItemId: canonicalId,
      primaryKu: canonicalItem?.ku ?? base.primaryKu,
      primaryTr: canonicalItem?.tr ?? base.primaryTr,
      primaryEn: canonicalItem?.en ?? base.primaryEn,
      emoji: canonicalItem?.emoji ?? base.emoji,
      storageUrl: base.storageUrl ?? withImage?.storageUrl,
      storagePath: base.storagePath ?? withImage?.storagePath,
      audioUrl: base.audioUrl ?? withAudio?.audioUrl,
      audioStoragePath: base.audioStoragePath ?? withAudio?.audioStoragePath,
      audioStatus: base.audioUrl || withAudio?.audioUrl ? 'verified' : (base.audioStatus ?? 'missing'),
      tags: [...new Set([...sorted.flatMap(a => a.tags ?? []), ...(canonicalItem?.tags ?? [])])],
      visualAffordanceTags: [...new Set([...sorted.flatMap(a => a.visualAffordanceTags ?? []), ...(canonicalItem?.visualAffordanceTags ?? [])])],
      affordanceAnswers: base.affordanceAnswers ?? [],
      questionFamilies: [...new Set(sorted.flatMap(a => a.questionFamilies ?? []))],
      reusableExerciseTypes: [...new Set(sorted.flatMap(a => a.reusableExerciseTypes ?? []))],
      usedInLessons: [...new Set(sorted.flatMap(a => a.usedInLessons ?? []))],
      status: (base.storageUrl ?? withImage?.storageUrl) ? 'active' : base.status,
      updatedAt: now,
    };

    await setDoc(doc(db, 'sceneLibrary', canonicalId), merged);
    updated++;

    for (const asset of sorted) {
      if (asset.id === canonicalId) continue;
      await deleteDoc(doc(db, 'sceneLibrary', asset.id)).catch(() => {});
      deleted++;
    }
  }

  onProgress(`Ortam kütüphanesi: ${updated} asset güncellendi, ${deleted} duplicate asset silindi.`);
  return { updated, deleted };
}
