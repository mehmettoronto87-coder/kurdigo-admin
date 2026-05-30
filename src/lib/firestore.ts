import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, arrayUnion, Timestamp,
  onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import type { AdminLesson, SceneAsset, AdminUser, LessonStatus, ChangeRecord, ItemMediaStatus, StepMediaItem } from '../types/admin';
import type { CurriculumMediaItem } from '../types/curriculum';
import { normalizeLessonIds } from './lessonAI';

// ========== LESSONS ==========

export async function getLesson(lessonId: string): Promise<AdminLesson | null> {
  const snap = await getDoc(doc(db, 'adminLessons', lessonId));
  if (!snap.exists()) return null;
  return snap.data() as AdminLesson;
}

export async function getLessonsForUnit(unitId: string): Promise<AdminLesson[]> {
  const q = query(collection(db, 'adminLessons'), where('unitId', '==', unitId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as AdminLesson).sort((a, b) => a.lessonOrder - b.lessonOrder);
}

export async function getPublicLessonsForUnit(unitId: string): Promise<AdminLesson[]> {
  const q = query(collection(db, 'publicLessons'), where('unitId', '==', unitId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as AdminLesson).sort((a, b) => a.lessonOrder - b.lessonOrder);
}

export async function getAllLessons(): Promise<AdminLesson[]> {
  const snap = await getDocs(collection(db, 'adminLessons'));
  return snap.docs.map(d => d.data() as AdminLesson);
}

export async function saveLesson(lesson: AdminLesson): Promise<void> {
  const normalized = normalizeLessonIds(lesson);
  await syncLessonItemsToSceneLibrary(normalized).catch(err => {
    console.warn('[sceneLibrary sync]', err);
  });
  await setDoc(doc(db, 'adminLessons', normalized.id), stripUndefined({
    ...normalized,
    updatedAt: new Date().toISOString(),
  }) as AdminLesson);
}

async function resolveReviewMedia(lessonData: AdminLesson): Promise<Record<string, ItemMediaStatus>> {
  const reviewIds = lessonData.reviewItemIds ?? [];
  const sceneMedia = await resolveSceneLibraryMedia(lessonData);
  if (reviewIds.length === 0) return { ...(lessonData.mediaStatus ?? {}), ...sceneMedia };

  // Review items never own their media locally. sceneLibrary is the source of
  // truth; older lesson media is only a fallback for legacy data.
  const lessons = (await getAllLessons()).sort((a, b) => (a.lessonOrder ?? 0) - (b.lessonOrder ?? 0));
  const merged: Record<string, ItemMediaStatus> = { ...(lessonData.mediaStatus ?? {}), ...sceneMedia };
  const resolved = new Set<string>();

  for (const lesson of lessons) {
    if (lesson.id === lessonData.id) continue;
    const lessonMedia = (lesson as any).mediaStatus as Record<string, ItemMediaStatus> | undefined ?? {};
    for (const id of reviewIds) {
      if (resolved.has(id) || (merged[id]?.imageUrl && merged[id]?.audioUrl)) continue;
      const sourceMedia = lessonMedia[id];
      if (sourceMedia?.imageUrl || sourceMedia?.audioUrl) {
        merged[id] = { ...(merged[id] ?? defaultMediaStatus()), ...sourceMedia };
        resolved.add(id);
      }
    }
  }
  return merged;
}

export async function updateLessonStatus(
  lessonId: string,
  status: LessonStatus,
  userId: string,
  userEmail: string
): Promise<void> {
  const now = new Date().toISOString();
  const record: ChangeRecord = {
    timestamp: now,
    userId,
    userEmail,
    action: statusToAction(status),
    description: `Durum değiştirildi: ${statusLabel(status)}`,
  };
  await updateDoc(doc(db, 'adminLessons', lessonId), {
    status,
    updatedAt: now,
    ...(status === 'approved' ? { approvedBy: userId, approvedAt: now } : {}),
    changeHistory: arrayUnion(record),
  });

  // Sync to public collection for mobile app
  if (status === 'live') {
    const snap = await getDoc(doc(db, 'adminLessons', lessonId));
    if (snap.exists()) {
      const lessonData = snap.data() as AdminLesson;
      const resolvedMedia = await resolveReviewMedia(lessonData);
      await setDoc(doc(db, 'publicLessons', lessonId), {
        ...lessonData,
        mediaStatus: resolvedMedia,
        status: 'live',
        publishedAt: now,
      });
    }
  } else {
    await deleteDoc(doc(db, 'publicLessons', lessonId));
  }
}

export async function syncLessonToPublic(lessonId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'adminLessons', lessonId));
  if (!snap.exists()) throw new Error('Lesson not found');
  const data = snap.data() as AdminLesson;
  if (data.status !== 'live') throw new Error('Lesson is not live');
  const resolvedMedia = await resolveReviewMedia(data);
  await setDoc(doc(db, 'publicLessons', lessonId), {
    ...data,
    mediaStatus: resolvedMedia,
    publishedAt: new Date().toISOString(),
  });
}

export async function updateLessonItemMedia(
  lessonId: string,
  itemId: string,
  media: ItemMediaStatus,
): Promise<void> {
  const patch = {
    [`mediaStatus.${itemId}`]: stripUndefined(media),
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(doc(db, 'adminLessons', lessonId), patch);
  // publicLessons'ı da güncelle (lesson live ise orada da mediaStatus olmalı)
  await updateDoc(doc(db, 'publicLessons', lessonId), patch).catch(() => {});
}

export async function updateLessonStepMedia(
  lessonId: string,
  stepId: string,
  media: StepMediaItem,
): Promise<void> {
  const patch = {
    [`stepMedia.${stepId}`]: stripUndefined(media),
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(doc(db, 'adminLessons', lessonId), patch);
  await updateDoc(doc(db, 'publicLessons', lessonId), patch).catch(() => {});
}

export async function deleteLesson(lessonId: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'adminLessons', lessonId)),
    deleteDoc(doc(db, 'publicLessons', lessonId)).catch(() => {}),
  ]);
}

export async function deleteLessonStorageFiles(lessonId: string): Promise<void> {
  const paths = [
    `images/lessons/${lessonId}`,
    `audio/lessons/${lessonId}`,
  ];
  await Promise.all(paths.map(async path => {
    const folderRef = ref(storage, path);
    try {
      const result = await listAll(folderRef);
      await Promise.all(result.items.map(item => deleteObject(item)));
    } catch {
      // folder may not exist — ignore
    }
  }));
}

export function subscribeLessons(unitId: string, cb: (lessons: AdminLesson[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'adminLessons'),
    where('unitId', '==', unitId),
  );
  return onSnapshot(
    q,
    snap => {
      const lessons = snap.docs
        .map(d => d.data() as AdminLesson)
        .sort((a, b) => a.lessonOrder - b.lessonOrder);
      cb(lessons);
    },
    err => {
      console.error('[subscribeLessons] Firestore error:', err);
      cb([]);
    },
  );
}

// ========== SCENE LIBRARY ==========

export async function getSceneAsset(mediaId: string): Promise<SceneAsset | null> {
  const snap = await getDoc(doc(db, 'sceneLibrary', mediaId));
  if (!snap.exists()) return null;
  return snap.data() as SceneAsset;
}

export async function getSceneAssetsForUnit(unitId: string): Promise<SceneAsset[]> {
  const q = query(collection(db, 'sceneLibrary'), where('unitId', '==', unitId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as SceneAsset);
}

export async function getAllSceneAssets(): Promise<SceneAsset[]> {
  const snap = await getDocs(collection(db, 'sceneLibrary'));
  return snap.docs.map(d => d.data() as SceneAsset);
}

export async function saveSceneAsset(asset: SceneAsset): Promise<void> {
  const updatedAsset = {
    ...asset,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'sceneLibrary', asset.id), updatedAsset);
  await propagateSceneAssetMedia(updatedAsset).catch(err => {
    console.warn('[sceneLibrary propagate]', err);
  });
}

export async function upsertSceneAssetForLessonItem(
  lesson: Pick<AdminLesson, 'id' | 'unitId' | 'lessonOrder'>,
  item: CurriculumMediaItem,
  media?: Partial<ItemMediaStatus>,
): Promise<SceneAsset> {
  const now = new Date().toISOString();
  const assetRef = doc(db, 'sceneLibrary', item.id);
  const existingSnap = await getDoc(assetRef);
  const existing = existingSnap.exists() ? existingSnap.data() as SceneAsset : null;

  const storageUrl = media?.imageUrl ?? existing?.storageUrl;
  const storagePath = media?.imageStoragePath ?? existing?.storagePath;
  const audioUrl = media?.audioUrl ?? existing?.audioUrl;
  const audioStoragePath = media?.audioStoragePath ?? existing?.audioStoragePath;

  const asset = stripUndefined({
    id: item.id,
    mediaId: existing?.mediaId ?? item.id,
    unitId: existing?.unitId ?? lesson.unitId,
    lessonId: existing?.lessonId ?? lesson.id,
    primaryItemId: existing?.primaryItemId || item.id,
    primaryKu: item.ku,
    primaryTr: item.tr,
    primaryEn: item.en,
    emoji: item.emoji ?? existing?.emoji ?? '📚',
    storageUrl,
    storagePath,
    audioUrl,
    audioStoragePath,
    audioStatus: media?.audioStatus ?? existing?.audioStatus ?? 'missing',
    tags: [...new Set([...(existing?.tags ?? []), ...(item.tags ?? [])])],
    visualAffordanceTags: [...new Set([...(existing?.visualAffordanceTags ?? []), ...(item.visualAffordanceTags ?? [])])],
    affordanceAnswers: existing?.affordanceAnswers ?? [],
    questionFamilies: existing?.questionFamilies ?? [],
    reusableExerciseTypes: existing?.reusableExerciseTypes ?? [],
    usedInLessons: [...new Set([...(existing?.usedInLessons ?? []), lesson.id])],
    status: storageUrl ? 'active' : existing?.status ?? 'placeholder',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }) as SceneAsset;

  await setDoc(assetRef, asset);
  return asset;
}

export async function syncLessonItemsToSceneLibrary(lesson: AdminLesson): Promise<void> {
  const externalDistractorIds = new Set(lesson.externalDistractorItemIds ?? []);
  const items = (lesson.items ?? []).filter(item => !externalDistractorIds.has(item.id));
  await Promise.all(items.map(item =>
    upsertSceneAssetForLessonItem(lesson, item, lesson.mediaStatus?.[item.id]),
  ));
}

export async function markAssetUsedInLesson(mediaId: string, lessonId: string): Promise<void> {
  await updateDoc(doc(db, 'sceneLibrary', mediaId), {
    usedInLessons: arrayUnion(lessonId),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateAssetAudio(
  assetId: string,
  audioUrl: string,
  audioStoragePath: string,
): Promise<void> {
  const assetRef = doc(db, 'sceneLibrary', assetId);
  await updateDoc(assetRef, {
    audioUrl,
    audioStoragePath,
    audioStatus: 'uploaded',
    updatedAt: new Date().toISOString(),
  });
  const snap = await getDoc(assetRef);
  if (snap.exists()) {
    await propagateSceneAssetMedia(snap.data() as SceneAsset).catch(err => {
      console.warn('[sceneLibrary audio propagate]', err);
    });
  }
}

async function resolveSceneLibraryMedia(lessonData: AdminLesson): Promise<Record<string, ItemMediaStatus>> {
  const result: Record<string, ItemMediaStatus> = {};
  await Promise.all((lessonData.items ?? []).map(async item => {
    const asset = await getSceneAsset(item.id).catch(() => null);
    if (!asset?.storageUrl && !asset?.audioUrl) return;
    result[item.id] = sceneAssetToMediaStatus(asset);
  }));
  return result;
}

function sceneAssetToMediaStatus(asset: SceneAsset): ItemMediaStatus {
  return {
    imageUrl: asset.storageUrl,
    imageStoragePath: asset.storagePath,
    imageStatus: asset.storageUrl ? 'approved' : 'pending',
    audioUrl: asset.audioUrl,
    audioStoragePath: asset.audioStoragePath,
    audioStatus: asset.audioUrl ? 'verified' : (asset.audioStatus === 'recording_needed' ? 'missing' : asset.audioStatus),
  };
}

function defaultMediaStatus(): ItemMediaStatus {
  return { imageStatus: 'pending', audioStatus: 'missing' };
}

async function propagateSceneAssetMedia(asset: SceneAsset): Promise<void> {
  if (!asset.storageUrl && !asset.audioUrl) return;
  const media = sceneAssetToMediaStatus(asset);
  await Promise.all((asset.usedInLessons ?? []).map(async lessonId => {
    const patch = {
      [`mediaStatus.${asset.primaryItemId || asset.id}`]: stripUndefined(media),
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(doc(db, 'adminLessons', lessonId), patch).catch(() => {});
    await updateDoc(doc(db, 'publicLessons', lessonId), patch).catch(() => {});
  }));
}

export function subscribeSceneLibrary(
  unitId: string | null,
  cb: (assets: SceneAsset[]) => void
): Unsubscribe {
  const q = unitId
    ? query(collection(db, 'sceneLibrary'), where('unitId', '==', unitId))
    : query(collection(db, 'sceneLibrary'), orderBy('unitId'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => d.data() as SceneAsset));
  });
}

// ========== ADMIN USERS ==========

export async function getAdminUsers(): Promise<AdminUser[]> {
  const snap = await getDocs(collection(db, 'adminUsers'));
  return snap.docs.map(d => d.data() as AdminUser);
}

export async function saveAdminUser(user: AdminUser): Promise<void> {
  await setDoc(doc(db, 'adminUsers', user.uid), user);
}

export async function deleteAdminUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'adminUsers', uid));
}

// ========== DASHBOARD STATS ==========

export async function getDashboardStats() {
  const [usersSnap, eventsSnap, lessonsSnap, assetsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(query(collection(db, 'events'), orderBy('ts', 'desc'))),
    getDocs(collection(db, 'adminLessons')),
    getDocs(collection(db, 'sceneLibrary')),
  ]);

  const users = usersSnap.docs.map(d => d.data());
  const lessons = lessonsSnap.docs.map(d => d.data() as AdminLesson);
  const assets = assetsSnap.docs.map(d => d.data() as SceneAsset);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sevenDaysAgoISO = new Date(sevenDaysAgo).toISOString();

  const recentEvents = eventsSnap.docs.map(d => d.data()).filter(e => {
    const ts = e['ts'] as Timestamp;
    return ts?.toMillis?.() > sevenDaysAgo;
  });
  const activeUserIds = new Set(recentEvents.map(e => e['uid']));

  return {
    totalUsers: users.length,
    premiumUsers: users.filter(u => u['isPremium']).length,
    activeUsers7d: activeUserIds.size,
    totalXP: users.reduce((s, u) => s + ((u['xp'] as number) ?? 0), 0),
    lessonsByStatus: {
      draft: lessons.filter(l => l.status === 'draft').length,
      approved: lessons.filter(l => l.status === 'approved').length,
      production: lessons.filter(l => l.status === 'production').length,
      live: lessons.filter(l => l.status === 'live').length,
    },
    allLessons: lessons,
    audioMissing: assets.filter(a => !a.audioStatus || a.audioStatus === 'missing').length,
    audioTotal: assets.length,
    thisWeekLessons: lessons.filter(l =>
      (l.updatedAt ?? '') > sevenDaysAgoISO || (l.createdAt ?? '') > sevenDaysAgoISO,
    ).length,
    recentEvents: eventsSnap.docs.slice(0, 20).map(d => ({ id: d.id, ...d.data() })),
  };
}

// ========== HELPERS ==========

function statusToAction(status: LessonStatus): ChangeRecord['action'] {
  if (status === 'approved') return 'approved';
  if (status === 'production') return 'sent_to_production';
  if (status === 'live') return 'published';
  return 'edited';
}

function statusLabel(status: LessonStatus): string {
  const map: Record<LessonStatus, string> = {
    draft: 'Taslak', approved: 'Onaylandı', production: 'Üretimde', live: 'Yayında',
  };
  return map[status];
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;

  const cleaned: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) cleaned[key] = stripUndefined(child);
  }
  return cleaned;
}
