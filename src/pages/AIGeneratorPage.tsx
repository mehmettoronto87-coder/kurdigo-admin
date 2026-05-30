import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { generateLesson, validateLesson, completeMissingSection, toCanonicalId } from '../lib/lessonAI';
import { saveLesson, getLessonsForUnit, getPublicLessonsForUnit, getAllLessons, invalidateAllLessonsCache } from '../lib/firestore';
import { UNITS, LEVELS } from '../lib/curriculumData';
import { useAuth } from '../hooks/useAuth';
import { getImageProviderLabel, getTextProviderLabel, hasTextProviderConfig } from '../lib/aiProviders';
import type { AIGenerationRequest, AdminLesson, PreviousLessonContext, ReviewItemContext } from '../types/admin';
import type { CurriculumLessonStep, CurriculumMediaItem } from '../types/curriculum';

const STEP_COLORS: Record<string, string> = {
  learn_card: '#1cb0f6', image_to_word: '#58cc02',
  word_to_image: '#58cc02', listen_to_word: '#ff9600', listen_to_image: '#ff9600',
  match_pairs: '#e74c3c', fill_blank: '#f39c12', word_order: '#e67e22',
  scene_question: '#16a085', mini_dialogue_choice: '#2980b9', typing: '#8e44ad',
  dictation: '#c0392b', culture_spotlight: '#27ae60', pronunciation_drill: '#2c3e50',
  character_dialogue: '#3498db', grammar_card: '#1abc9c',
};

const STEP_ICONS: Record<string, string> = {
  learn_card: '📖', image_to_word: '🖼️→📝',
  word_to_image: '📝→🖼️', listen_to_word: '🎧', listen_to_image: '🎧🖼️',
  match_pairs: '🔗', fill_blank: '___', word_order: '🔀',
  scene_question: '❓', mini_dialogue_choice: '💬', typing: '⌨️',
  dictation: '✍️', culture_spotlight: '🌍', pronunciation_drill: '🔊',
  character_dialogue: '🗣️', grammar_card: '📋',
};

const UNIT1_LESSON1_REVIEW_ITEMS: CurriculumMediaItem[] = [
  {
    id: 'silav_greeting_expr',
    ku: 'Silav',
    tr: 'Merhaba',
    en: 'Hello',
    emoji: '👋',
    partOfSpeech: 'expression',
    meaningGroup: 'greeting',
    tags: ['word:silav', 'meaning:greeting', 'pos:expression'],
    visualAffordanceTags: ['action:greeting'],
  },
  {
    id: 'spas_thanks_expr',
    ku: 'Spas',
    tr: 'Teşekkürler',
    en: 'Thanks',
    emoji: '🙏',
    partOfSpeech: 'expression',
    meaningGroup: 'thanks',
    tags: ['word:spas', 'meaning:thanks', 'pos:expression'],
    visualAffordanceTags: ['action:thanks'],
  },
  {
    id: 'bele_yes_adv',
    ku: 'Belê',
    tr: 'Evet',
    en: 'Yes',
    emoji: '✔️',
    partOfSpeech: 'adverb',
    meaningGroup: 'yes_no',
    tags: ['word:bele', 'meaning:yes', 'pos:adverb'],
    visualAffordanceTags: ['symbol:yes'],
  },
  {
    id: 'na_no_adv',
    ku: 'Na',
    tr: 'Hayır',
    en: 'No',
    emoji: '❌',
    partOfSpeech: 'adverb',
    meaningGroup: 'yes_no',
    tags: ['word:na', 'meaning:no', 'pos:adverb'],
    visualAffordanceTags: ['symbol:no'],
  },
  {
    id: 'rojbas_morning_greeting_expr',
    ku: 'Rojbaş',
    tr: 'Günaydın',
    en: 'Good morning',
    emoji: '🌞',
    partOfSpeech: 'expression',
    meaningGroup: 'greeting_time',
    tags: ['word:rojbas', 'meaning:greeting', 'pos:expression'],
    visualAffordanceTags: ['time:morning', 'object:sun'],
  },
  {
    id: 'sevbas_night_greeting_expr',
    ku: 'Şevbaş',
    tr: 'İyi geceler',
    en: 'Good night',
    emoji: '🌜',
    partOfSpeech: 'expression',
    meaningGroup: 'greeting_time',
    tags: ['word:sevbas', 'meaning:greeting', 'pos:expression'],
    visualAffordanceTags: ['time:night', 'object:moon'],
  },
  {
    id: 'roj_day_n',
    ku: 'Roj',
    tr: 'Gün',
    en: 'Day',
    emoji: '🌅',
    partOfSpeech: 'noun',
    meaningGroup: 'time',
    tags: ['word:roj', 'meaning:time', 'pos:noun'],
    visualAffordanceTags: ['time:day', 'object:sunrise'],
  },
  {
    id: 'sev_night_n',
    ku: 'Şev',
    tr: 'Gece',
    en: 'Night',
    emoji: '🌌',
    partOfSpeech: 'noun',
    meaningGroup: 'time',
    tags: ['word:sev', 'meaning:time', 'pos:noun'],
    visualAffordanceTags: ['time:night', 'setting:night_sky'],
  },
];

const UNIT2_LESSON1_REVIEW_ITEMS: CurriculumMediaItem[] = [
  {
    id: 'yek_one_num',
    ku: 'Yek',
    tr: 'Bir',
    en: 'One',
    emoji: '1️⃣',
    partOfSpeech: 'noun',
    meaningGroup: 'number',
    tags: ['word:yek', 'meaning:one', 'pos:noun'],
    visualAffordanceTags: ['concept:number', 'quantity:one'],
  },
  {
    id: 'du_two_num',
    ku: 'Du',
    tr: 'İki',
    en: 'Two',
    emoji: '2️⃣',
    partOfSpeech: 'noun',
    meaningGroup: 'number',
    tags: ['word:du', 'meaning:two', 'pos:noun'],
    visualAffordanceTags: ['concept:number', 'quantity:two'],
  },
  {
    id: 'se_three_num',
    ku: 'Sê',
    tr: 'Üç',
    en: 'Three',
    emoji: '3️⃣',
    partOfSpeech: 'noun',
    meaningGroup: 'number',
    tags: ['word:se', 'meaning:three', 'pos:noun'],
    visualAffordanceTags: ['concept:number', 'quantity:three'],
  },
  {
    id: 'car_four_num',
    ku: 'Çar',
    tr: 'Dört',
    en: 'Four',
    emoji: '4️⃣',
    partOfSpeech: 'noun',
    meaningGroup: 'number',
    tags: ['word:car', 'meaning:four', 'pos:noun'],
    visualAffordanceTags: ['concept:number', 'quantity:four'],
  },
  {
    id: 'penc_five_num',
    ku: 'Pênc',
    tr: 'Beş',
    en: 'Five',
    emoji: '5️⃣',
    partOfSpeech: 'noun',
    meaningGroup: 'number',
    tags: ['word:penc', 'meaning:five', 'pos:noun'],
    visualAffordanceTags: ['concept:number', 'quantity:five'],
  },
  {
    id: 'jimar_number_noun',
    ku: 'Jimar',
    tr: 'Sayı',
    en: 'Number',
    emoji: '🔢',
    partOfSpeech: 'noun',
    meaningGroup: 'number_concept',
    tags: ['word:jimar', 'meaning:number', 'pos:noun'],
    visualAffordanceTags: ['concept:number'],
  },
  {
    id: 'tist_thing_noun',
    ku: 'Tişt',
    tr: 'Şey',
    en: 'Thing',
    emoji: '📦',
    partOfSpeech: 'noun',
    meaningGroup: 'object',
    tags: ['word:tist', 'meaning:thing', 'pos:noun'],
    visualAffordanceTags: ['concept:object'],
  },
  {
    id: 'yek_bi_yek_expr',
    ku: 'Yek bi yek',
    tr: 'Teker teker',
    en: 'One by one',
    emoji: '👆',
    partOfSpeech: 'expression',
    meaningGroup: 'sequence',
    tags: ['word:yek_bi_yek', 'meaning:one_by_one', 'pos:expression'],
    visualAffordanceTags: ['concept:sequence'],
  },
];

function unitOrderOf(unitId: string): number {
  return UNITS.find(u => u.id === unitId)?.order ?? 0;
}

function globalLessonOrder(unitId: string, lessonOrder: number): number {
  return unitOrderOf(unitId) * 100 + lessonOrder;
}

function lessonStatusRank(status: AdminLesson['status'] | undefined): number {
  const rank: Record<AdminLesson['status'], number> = {
    live: 4,
    production: 3,
    approved: 2,
    draft: 1,
  };
  return status ? rank[status] : 0;
}

function selectCanonicalLessons(lessons: AdminLesson[]): AdminLesson[] {
  const bySlot = new Map<string, AdminLesson>();
  for (const lesson of lessons) {
    const key = `${lesson.unitId}:${lesson.lessonOrder}`;
    const current = bySlot.get(key);
    if (!current) {
      bySlot.set(key, lesson);
      continue;
    }
    const statusDiff = lessonStatusRank(lesson.status) - lessonStatusRank(current.status);
    if (statusDiff > 0) {
      bySlot.set(key, lesson);
      continue;
    }
    if (statusDiff === 0 && (lesson.updatedAt ?? lesson.createdAt ?? '') > (current.updatedAt ?? current.createdAt ?? '')) {
      bySlot.set(key, lesson);
    }
  }
  return [...bySlot.values()].sort((a, b) =>
    globalLessonOrder(a.unitId, a.lessonOrder) - globalLessonOrder(b.unitId, b.lessonOrder),
  );
}

function normalizeKu(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function adjacentUnitDistractorItems(lesson: AdminLesson): CurriculumMediaItem[] {
  const currentOrder = unitOrderOf(lesson.unitId);
  const existingByKu = new Map(lesson.items.map(item => [item.ku.trim().toLocaleLowerCase('tr-TR'), item]));
  const seen = new Set<string>();

  return UNITS
    .filter(unit => Math.abs((unit.order ?? 0) - currentOrder) <= 1)
    .flatMap(unit => unit.lessons.flatMap((lessonHint, lessonIndex) =>
      lessonHint.words.map((word): CurriculumMediaItem => {
        const ku = word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
        const existing = existingByKu.get(ku.trim().toLocaleLowerCase('tr-TR'));
        if (existing) return existing;
        return {
          id: toCanonicalId(ku),
          ku,
          tr: word,
          en: word,
          emoji: '🔀',
          partOfSpeech: 'noun',
          meaningGroup: `adjacent_unit_${unit.id}`,
          tags: ['distractor_only', `source:${unit.id}`],
          visualAffordanceTags: ['source:adjacent_unit_distractor'],
        };
      }),
    ))
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function fallbackPreviousLessons(unitId: string, lessonOrder: number): PreviousLessonContext[] {
  const currentGlobalOrder = globalLessonOrder(unitId, lessonOrder);

  if (unitId === 'unit1' && lessonOrder === 2) {
    return [{
      lessonId: 'unit1_lesson1_existing',
      unitId: 'unit1',
      unitOrder: unitOrderOf('unit1'),
      lessonOrder: 1,
      globalLessonOrder: globalLessonOrder('unit1', 1),
      title: 'Silavên Bingehîn',
      itemIds: UNIT1_LESSON1_REVIEW_ITEMS.map(item => item.id),
      itemsKu: UNIT1_LESSON1_REVIEW_ITEMS.map(item => item.ku),
      items: UNIT1_LESSON1_REVIEW_ITEMS,
    }];
  }

  if (unitId === 'unit2' && lessonOrder === 2) {
    return [{
      lessonId: 'unit2_lesson1_existing',
      unitId: 'unit2',
      unitOrder: unitOrderOf('unit2'),
      lessonOrder: 1,
      globalLessonOrder: globalLessonOrder('unit2', 1),
      title: 'Jimarên 1-5',
      itemIds: UNIT2_LESSON1_REVIEW_ITEMS.map(item => item.id),
      itemsKu: UNIT2_LESSON1_REVIEW_ITEMS.map(item => item.ku),
      items: UNIT2_LESSON1_REVIEW_ITEMS,
    }];
  }

  const unit = UNITS.find(u => u.id === unitId);
  if (!unit) return [];

  return UNITS
    .flatMap(u => u.lessons.map((lessonHint, index) => ({ unit: u, lessonHint, lessonOrder: index + 1 })))
    .filter(entry => globalLessonOrder(entry.unit.id, entry.lessonOrder) < currentGlobalOrder)
    .sort((a, b) => globalLessonOrder(a.unit.id, a.lessonOrder) - globalLessonOrder(b.unit.id, b.lessonOrder))
    .slice(-5)
    .map(({ unit: sourceUnit, lessonHint, lessonOrder: sourceLessonOrder }) => {
      const items = lessonHint.words.map((word): CurriculumMediaItem => {
        const ku = word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
        return {
          id: toCanonicalId(ku),
          ku,
          tr: word,
          en: word,
          emoji: '📖',
          partOfSpeech: 'expression',
          meaningGroup: 'fallback_previous',
          tags: [`word:${word}`],
          visualAffordanceTags: ['source:fallback_previous_lesson'],
        };
      });
      return {
        lessonId: `${sourceUnit.id}_lesson${sourceLessonOrder}_fallback`,
        unitId: sourceUnit.id,
        unitOrder: sourceUnit.order,
        lessonOrder: sourceLessonOrder,
        globalLessonOrder: globalLessonOrder(sourceUnit.id, sourceLessonOrder),
        title: lessonHint.title,
        itemIds: items.map(item => item.id),
        itemsKu: items.map(item => item.ku),
        items,
      };
    });
}

// ─── ANA SAYFA ───
export default function AIGeneratorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [unitId, setUnitId] = useState(searchParams.get('unitId') ?? 'unit1');
  const [lessonOrder, setLessonOrder] = useState(parseInt(searchParams.get('lessonOrder') ?? '1'));
  const [focusVocab, setFocusVocab] = useState('');
  const [charFocus, setCharFocus] = useState('auto');
  const [lessonStyle, setLessonStyle] = useState('auto');
  const [extraNote, setExtraNote] = useState('');
  const [prevContext, setPrevContext] = useState<PreviousLessonContext[]>([]);
  const [prevContextLoaded, setPrevContextLoaded] = useState(false);
  const [prevContextRefreshKey, setPrevContextRefreshKey] = useState(0);
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>(['', '', '']);
  const [reviewSearch, setReviewSearch] = useState('');

  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [lesson, setLesson] = useState<AdminLesson | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [existingLesson, setExistingLesson] = useState<AdminLesson | null>(null);
  const [completingSection, setCompletingSection] = useState<2 | 3 | null>(null);
  const [completingProgress, setCompletingProgress] = useState('');

  const unit = UNITS.find(u => u.id === unitId);
  const level = LEVELS.find(l => l.id === unit?.levelId);

  const aiProviderLabel = getTextProviderLabel();
  const imageProviderLabel = getImageProviderLabel();
  const aiProviderReady = hasTextProviderConfig();

  // Excel kelimelerini ders seçilince otomatik doldur
  useEffect(() => {
    const words = unit?.lessons[lessonOrder - 1]?.words ?? [];
    const isVeryFirstLesson = lessonOrder === 1 && (unit?.order ?? 1) === 1;
    setFocusVocab((isVeryFirstLesson ? words : words.slice(0, 5)).join(', '));
    setSelectedReviewIds(['', '', '']);
  }, [unitId, lessonOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Yükleme başlarken loaded'ı false yap — sadece Firestore'dan gerçek veri gelince true olacak.
    // Başlangıçta fallback göstermiyoruz; Firestore sonucu gelene kadar bekliyoruz.
    const isRefresh = prevContextRefreshKey > 0;
    if (isRefresh) invalidateAllLessonsCache();
    setPrevContextLoaded(false);
    setPrevContext([]);
    Promise.all([
      getLessonsForUnit(unitId).catch(e => { console.error('[getLessonsForUnit]', e); return [] as AdminLesson[]; }),
      getPublicLessonsForUnit(unitId).catch(e => { console.error('[getPublicLessons]', e); return [] as AdminLesson[]; }),
      getAllLessons().catch(e => { console.error('[getAllLessons]', e); return [] as AdminLesson[]; }),
    ]).then(([lessons, publicLessons, allLessons]) => {
      const mergedCurrentLessons = selectCanonicalLessons([...lessons, ...publicLessons]);
      const mergedAllLessons = selectCanonicalLessons([...allLessons, ...publicLessons]);
      const currentGlobalOrder = globalLessonOrder(unitId, lessonOrder);
      const previousLessons = mergedAllLessons
        .filter(l => {
          return globalLessonOrder(l.unitId, l.lessonOrder) < currentGlobalOrder;
        })
        .sort((a, b) => globalLessonOrder(a.unitId, a.lessonOrder) - globalLessonOrder(b.unitId, b.lessonOrder));
      const ctx: PreviousLessonContext[] = previousLessons
        .map(l => {
          // Only include focus vocabulary — exclude external distractors (wrong-answer words)
          // and review items (words taught in older lessons, already in their own context).
          const excludeIds = new Set([
            ...(l.externalDistractorItemIds ?? []),
            ...(l.reviewItemIds ?? []),
          ]);
          const focusItems = l.items.filter(item => !excludeIds.has(item.id));
          return {
            lessonId: l.id,
            unitId: l.unitId,
            unitOrder: unitOrderOf(l.unitId),
            lessonOrder: l.lessonOrder,
            globalLessonOrder: globalLessonOrder(l.unitId, l.lessonOrder),
            title: l.title,
            itemIds: focusItems.map(i => i.id),
            itemsKu: focusItems.map(i => i.ku),
            items: focusItems,
            mediaStatus: l.mediaStatus,
          };
        });
      // Firestore'dan gerçek ders geldiyse onu kullan, yoksa fallback'e dön.
      setPrevContext(ctx.length ? ctx : fallbackPreviousLessons(unitId, lessonOrder));
      setPrevContextLoaded(true);
      const found = mergedCurrentLessons.find(l => l.lessonOrder === lessonOrder) ?? null;
      setExistingLesson(found);
      // Mevcut ders varsa review paneline otomatik yükle (sayfa yenilenince kaybolmaz)
      if (found) {
        setLesson(found);
        setStatus('done');
      }
    }).catch(err => {
      console.error('[getLessonsForUnit]', err);
      setPrevContext(fallbackPreviousLessons(unitId, lessonOrder));
      setPrevContextLoaded(true);
    });
  }, [unitId, lessonOrder, prevContextRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildAdditionalInstructions = (): string | undefined => {
    const parts: string[] = [];
    const charMap: Record<string, string> = {
      baran:  "Ders Baran'ın perspektifinden gitsin.",
      berfin: 'Berfin öğretici olarak ön planda olsun.',
      kurdo:  'Kurdo maskot sahnelerde çok görünsün.',
      both:   "Baran ve Berfin birlikte — diyalog ağırlıklı.",
      none:   'Sahnelerde karakter yok — sadece nesneler ve ortamlar.',
    };
    const styleMap: Record<string, string> = {
      dialogue: 'Diyalog alıştırmaları ağırlıklı olsun.',
      story:    'Hikaye tarzında anlat — olaylar üzerinden ders yürüsün.',
      culture:  'Kültürel bağlamı öne çıkar — şehir, mekan, gelenek.',
      review:   'Tekrar sorularına daha fazla ağırlık ver.',
    };
    if (charMap[charFocus]) parts.push(charMap[charFocus]);
    if (styleMap[lessonStyle]) parts.push(styleMap[lessonStyle]);
    if (extraNote.trim()) parts.push(extraNote.trim());
    return parts.length ? parts.join(' ') : undefined;
  };

  // Önceki ders olup olmadığının tek doğru kontrolü: global sırada bu dersten önce ders var mı?
  const needsReview = lessonOrder > 1 || (unit?.order ?? 1) > 1;

  const effectivePrevContext = prevContext.length ? prevContext : fallbackPreviousLessons(unitId, lessonOrder);

  // Önceki 5 dersin tüm kelimeleri — en yeni ders önce, ku bazında tekrarsız
  const reviewCandidates: ReviewItemContext[] = (() => {
    const chronological = [...effectivePrevContext]
      .sort((a, b) => (a.globalLessonOrder ?? globalLessonOrder(a.unitId ?? unitId, a.lessonOrder)) -
        (b.globalLessonOrder ?? globalLessonOrder(b.unitId ?? unitId, b.lessonOrder)));

    // İlk geçen dersteki ID = kanonik ID (AI üretimiyle tutarlı)
    const canonicalByKu = new Map<string, ReviewItemContext>();
    // En zengin görüntü verisi: emoji/exampleKu olan versiyonu önceliklendir
    const displayByKu   = new Map<string, CurriculumMediaItem>();

    for (const ctx of chronological) {
      for (const item of ctx.items ?? []) {
        const key = normalizeKu(item.ku);
        if (!key) continue;
        if (!canonicalByKu.has(key)) {
          canonicalByKu.set(key, {
            sourceLessonId: ctx.lessonId ?? '',
            sourceUnitId: ctx.unitId,
            sourceUnitOrder: ctx.unitOrder,
            sourceLessonOrder: ctx.lessonOrder,
            sourceGlobalLessonOrder: ctx.globalLessonOrder,
            item,
            media: ctx.mediaStatus?.[item.id],
          });
          displayByKu.set(key, item);
        } else {
          // Daha zengin görüntü verisi varsa güncelle
          const prev = displayByKu.get(key)!;
          if ((item.emoji && !prev.emoji) || (item.exampleKu && !prev.exampleKu)) {
            displayByKu.set(key, item);
          }
        }
      }
    }

    // Yeniden eskiye doğru listele, en fazla 5 ders
    const seenKu     = new Set<string>();
    const candidates: ReviewItemContext[] = [];
    const seenOrders = new Set<number>();

    for (const ctx of [...chronological].reverse()) {
      const order = ctx.globalLessonOrder ?? globalLessonOrder(ctx.unitId ?? unitId, ctx.lessonOrder);
      seenOrders.add(order);
      if (seenOrders.size > 5) break;

      for (const item of ctx.items ?? []) {
        const key = normalizeKu(item.ku);
        const canonical = canonicalByKu.get(key);
        if (!key || !canonical || seenKu.has(key)) continue;
        seenKu.add(key);
        // Kanonik ID + en zengin görüntü verisi
        const displayItem = displayByKu.get(key) ?? canonical.item;
        candidates.push({
          ...canonical,
          item: { ...displayItem, id: canonical.item.id },
        });
      }
    }
    return candidates;
  })();

  // Tüm önceki derslerden dedup'lı tam liste — arama için limit yok
  const allPreviousReviewItems: ReviewItemContext[] = (() => {
    const chronological = [...effectivePrevContext]
      .sort((a, b) => (a.globalLessonOrder ?? globalLessonOrder(a.unitId ?? unitId, a.lessonOrder)) -
        (b.globalLessonOrder ?? globalLessonOrder(b.unitId ?? unitId, b.lessonOrder)));
    const canonicalByKu = new Map<string, ReviewItemContext>();
    const displayByKu = new Map<string, CurriculumMediaItem>();
    for (const ctx of chronological) {
      for (const item of ctx.items ?? []) {
        const key = normalizeKu(item.ku);
        if (!key) continue;
        if (!canonicalByKu.has(key)) {
          canonicalByKu.set(key, {
            sourceLessonId: ctx.lessonId ?? '',
            sourceUnitId: ctx.unitId,
            sourceUnitOrder: ctx.unitOrder,
            sourceLessonOrder: ctx.lessonOrder,
            sourceGlobalLessonOrder: ctx.globalLessonOrder,
            item,
            media: ctx.mediaStatus?.[item.id],
          });
          displayByKu.set(key, item);
        } else {
          const prev = displayByKu.get(key)!;
          if ((item.emoji && !prev.emoji) || (item.exampleKu && !prev.exampleKu)) displayByKu.set(key, item);
        }
      }
    }
    const seenKu = new Set<string>();
    const all: ReviewItemContext[] = [];
    for (const ctx of [...chronological].reverse()) {
      for (const item of ctx.items ?? []) {
        const key = normalizeKu(item.ku);
        const canonical = canonicalByKu.get(key);
        if (!key || !canonical || seenKu.has(key)) continue;
        seenKu.add(key);
        const displayItem = displayByKu.get(key) ?? canonical.item;
        all.push({ ...canonical, item: { ...displayItem, id: canonical.item.id } });
      }
    }
    return all;
  })();

  const searchResults: ReviewItemContext[] = reviewSearch.trim().length > 0
    ? allPreviousReviewItems.filter(c => {
        const q = reviewSearch.trim().toLocaleLowerCase('tr-TR');
        return normalizeKu(c.item.ku).includes(q) ||
               (c.item.tr ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
               (c.item.en ?? '').toLocaleLowerCase().includes(q);
      }).slice(0, 40)
    : [];

  const selectedReviewItems = selectedReviewIds
    .map(id =>
      reviewCandidates.find(c => c.item.id === id) ??
      allPreviousReviewItems.find(c => c.item.id === id),
    )
    .filter((c): c is ReviewItemContext => Boolean(c));

  const newWordList = focusVocab ? focusVocab.split(',').map(s => s.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (!needsReview || !prevContextLoaded || reviewCandidates.length === 0) return;
    setSelectedReviewIds(prev => {
      const valid = prev.filter(id => reviewCandidates.some(candidate => candidate.item.id === id));
      const fill = reviewCandidates
        .map(candidate => candidate.item.id)
        .filter(id => !valid.includes(id))
        .slice(0, 3 - valid.length);
      const next = [...valid, ...fill].slice(0, 3);
      while (next.length < 3) next.push('');
      return next.join('|') === prev.join('|') ? prev : next;
    });
  }, [unitId, lessonOrder, prevContextLoaded, reviewCandidates.map(candidate => candidate.item.id).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (!aiProviderReady) {
      setError(`OpenAI API anahtarı tanımlı değil. admin/.env içine VITE_OPENAI_API_KEY ekle.`);
      setStatus('error');
      return;
    }
    // Auth kontrolü — adminUser yüklenmemiş olsa da user yeterli
    if (!user) {
      setError('Giriş yapılmamış. Sayfayı yenile ve tekrar dene.');
      setStatus('error');
      return;
    }
    if (!needsReview && newWordList.length !== 8) {
      setError('İlk ders için tam 8 yeni kelime girmelisin.');
      setStatus('error');
      return;
    }
    if (needsReview && newWordList.length !== 5) {
      setError('Bu ders için tam 5 yeni kelime girmelisin.');
      setStatus('error');
      return;
    }
    if (needsReview && selectedReviewItems.length !== 3) {
      setError('Bu ders için önceki derslerden tekrar edilecek 3 kelime seçmelisin.');
      setStatus('error');
      return;
    }

    // Fallback ID'li tekrar kelimesi seçilmişse üretimi engelle.
    // Fallback item'lar sahte ID'lere sahiptir (meaningGroup:'fallback_previous').
    // Bunlarla üretilen derslerde tekrar item'larının görseli/sesi orijinal kaynaktan çekilemez.
    const fallbackReviewItems = selectedReviewItems.filter(
      r => r.item.meaningGroup === 'fallback_previous' ||
           r.item.visualAffordanceTags?.includes('source:fallback_previous_lesson'),
    );
    if (fallbackReviewItems.length > 0) {
      setError(
        `⚠️ Seçilen tekrar kelimeleri sahte ID taşıyor — önceki dersler Firestore'a kaydedilmemiş olabilir.\n\n` +
        `Önce ${lessonOrder - 1}. dersi AI Üretici'den kaydet (Taslak kaydet veya Onayla + Görsellere Başla), ` +
        `ardından bu sayfayı yenile. Tekrar kelimeleri gerçek ID'leriyle yüklenecek.\n\n` +
        `Sahte ID'ler: ${fallbackReviewItems.map(r => r.item.id).join(', ')}`,
      );
      setStatus('error');
      return;
    }

    setStatus('generating');
    setError('');
    setLesson(null);
    setSelectedIdx(null);

    const req: AIGenerationRequest = {
      unitId,
      lessonOrder,
      focusVocabulary: newWordList.length ? newWordList : undefined,
      reviewItems: needsReview ? selectedReviewItems : undefined,
      previousLessonsContext: effectivePrevContext.length ? effectivePrevContext : undefined,
      additionalInstructions: buildAdditionalInstructions(),
    };

    try {
      const generated = await generateLesson(req, user.uid, user.email ?? '', setProgress);
      setLesson(generated);
      setStatus('done');
      // Otomatik taslak kaydet — ayrı try-catch, üretimi bozmaz
      try {
        setProgress('💾 Taslak otomatik kaydediliyor...');
        await saveLesson(generated);
        setExistingLesson(generated);
        setProgress('✅ Taslak kaydedildi');
      } catch (saveErr) {
        const msg = saveErr instanceof Error ? saveErr.message : String(saveErr);
        console.error('[auto-save]', msg);
        setProgress('⚠️ Otomatik kayıt başarısız — Firestore izni eksik olabilir');
        setError('⚠️ Kayıt başarısız: ' + msg + '\n\nFirebase Console → Firestore → Rules → "allow read, write: if request.auth != null" ekle ve Publish yap.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
    }
  };

  const handleSave = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      await saveLesson(lesson);
      navigate(`/curriculum/${unitId}?lessonOrder=${lessonOrder}`);
    } catch (e) {
      setError('Kaydetme hatası: ' + (e instanceof Error ? e.message : String(e)));
      setSaving(false);
    }
  };

  const handleSaveToDalle = async () => {
    if (!lesson) { console.warn('[DALLE] lesson null'); return; }
    setSaving(true);
    setError('');
    try {
      const approvedLesson = { ...lesson, status: 'approved' as AdminLesson['status'] };
      await saveLesson(approvedLesson);
      navigate(
        `/curriculum/${lesson.unitId}?lessonOrder=${lesson.lessonOrder}&tab=production`,
        { state: { preloadedLesson: approvedLesson } },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[DALLE] save error:', msg);
      setError('Kaydetme hatası: ' + msg);
      setStatus('error');
      setSaving(false);
    }
  };

  const handleCompleteSection = async (sectionIndex: 2 | 3) => {
    if (!lesson || !user) return;
    setCompletingSection(sectionIndex);
    setError('');
    const req: AIGenerationRequest = {
      unitId,
      lessonOrder,
      focusVocabulary: newWordList.length ? newWordList : undefined,
      reviewItems: needsReview ? selectedReviewItems : undefined,
      previousLessonsContext: effectivePrevContext.length ? effectivePrevContext : undefined,
      additionalInstructions: buildAdditionalInstructions(),
    };
    try {
      const updated = await completeMissingSection(lesson, req, sectionIndex, setCompletingProgress);
      setLesson(updated);
      setCompletingProgress('💾 Kaydediliyor...');
      await saveLesson(updated);
      setExistingLesson(updated);
      setCompletingProgress('✅ Tamamlandı');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError('Tamamlama hatası: ' + msg);
    } finally {
      setCompletingSection(null);
      setTimeout(() => setCompletingProgress(''), 3000);
    }
  };

  const handleStepEdit = (stepIdx: number, updated: CurriculumLessonStep, extraItems: CurriculumMediaItem[] = []) => {
    if (!lesson) return;
    const newSteps = lesson.steps.map((s, i) => i === stepIdx ? updated : s);
    const existingIds = new Set(lesson.items.map(item => item.id));
    const itemsToAdd = extraItems.filter(item => !existingIds.has(item.id));
    const upd = {
      ...lesson,
      steps: newSteps,
      items: itemsToAdd.length ? [...lesson.items, ...itemsToAdd] : lesson.items,
      externalDistractorItemIds: itemsToAdd.length
        ? [...new Set([...(lesson.externalDistractorItemIds ?? []), ...itemsToAdd.map(item => item.id)])]
        : lesson.externalDistractorItemIds,
    };
    setLesson(upd);
    saveLesson(upd).catch(e => console.error('[step-save]', e));
  };

  const handleItemEdit = (itemIdx: number, field: string, value: string) => {
    if (!lesson) return;
    const newItems = lesson.items.map((it, i) =>
      i === itemIdx ? { ...it, [field]: value } : it
    );
    const upd = { ...lesson, items: newItems };
    setLesson(upd);
    saveLesson(upd).catch(e => console.error('[item-save]', e));
  };

  const validation = lesson ? validateLesson(lesson) : null;
  const lessonCoreItemCount = lesson
    ? lesson.items.filter(item => !(lesson.externalDistractorItemIds ?? []).includes(item.id)).length
    : 0;
  const lessonExternalDistractorCount = lesson?.externalDistractorItemIds?.length ?? 0;

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="page-header">
        <h1 className="page-title">🤖 AI ders üretici</h1>
        <p className="page-subtitle">
          {aiProviderLabel} ile tam 60 kart üret. Tüm soru metinleri, şıklar ve mantıkla birlikte. Onayla → kaydet → medyaya geç.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── SOL PANEL: Form ── */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Ders seç</h3>

            <div className="form-group">
              <label className="form-label">Ünite</label>
              <select value={unitId} onChange={e => setUnitId(e.target.value)} disabled={status === 'generating'}>
                {LEVELS.map(l => (
                  <optgroup key={l.id} label={l.title}>
                    {UNITS.filter(u => u.levelId === l.id).map(u => (
                      <option key={u.id} value={u.id}>{u.icon} {u.title}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Ders</label>
              <select value={lessonOrder} onChange={e => setLessonOrder(Number(e.target.value))} disabled={status === 'generating'}>
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>
                    Ders {n}{unit?.lessons[n - 1] ? ` — ${unit.lessons[n - 1]!.title}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {unit && (
              <div style={{
                background: 'var(--bg4)', borderRadius: 8, padding: '10px 12px',
                marginBottom: 12, fontSize: 11,
              }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                  {unit.icon} {unit.title} · {level?.title}
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 10, marginBottom: 4 }}>{unit.city}</div>
                <div style={{ color: 'var(--text2)' }}>{unit.culturalHint}</div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                {!needsReview ? 'Bu dersin kelimeleri' : 'Yeni öğretilecek 5 kelime'}
                <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 4 }}>
                  ({!needsReview ? 'ilk ders 8 kelime' : "Excel'den ilk 5 - düzenleyebilirsin"})
                </span>
              </label>
              <textarea
                value={focusVocab}
                onChange={e => setFocusVocab(e.target.value)}
                placeholder="silav, spas, baş, na, heval..."
                disabled={status === 'generating'}
                style={{ minHeight: 52, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            {needsReview && (
              <div className="form-group">
                <label className="form-label">
                  Tekrar edilecek 3 kelime
                  <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 4 }}>
                    (son 5 ders · arama ile tüm geçmişe eriş)
                  </span>
                </label>

                <>
                    {!prevContextLoaded && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                        ⏳ Gerçek ID'ler yükleniyor...
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[0, 1, 2].map(slot => {
                        const selectedId = selectedReviewIds[slot] ?? '';
                        const inRecent = reviewCandidates.some(c => c.item.id === selectedId);
                        const searchSelected = selectedId && !inRecent
                          ? allPreviousReviewItems.find(c => c.item.id === selectedId)
                          : undefined;
                        return (
                          <select
                            key={slot}
                            value={selectedId}
                            onChange={e => {
                              const next = [...selectedReviewIds];
                              next[slot] = e.target.value;
                              setSelectedReviewIds(next);
                            }}
                            disabled={status === 'generating'}
                          >
                            <option value="">Tekrar {slot + 1} seç</option>
                            {/* Arama ile seçilmiş eski kelime — son 5 derste değil ama slotta görünür */}
                            {searchSelected && (
                              <option value={searchSelected.item.id}>
                                🔍 U{searchSelected.sourceUnitOrder}·D{searchSelected.sourceLessonOrder} · {searchSelected.item.emoji ?? ''} {searchSelected.item.ku} — {searchSelected.item.tr}
                              </option>
                            )}
                            {reviewCandidates
                              .filter(c => c.item.id === selectedId || !selectedReviewIds.includes(c.item.id))
                              .map(c => {
                                const isFallback = c.item.meaningGroup === 'fallback_previous' ||
                                  c.item.visualAffordanceTags?.includes('source:fallback_previous_lesson');
                                return (
                                  <option key={c.item.id} value={c.item.id} disabled={isFallback}>
                                    {isFallback ? '⚠️ SAHTE ID · ' : ''}U{c.sourceUnitOrder ?? '?'} D{c.sourceLessonOrder} · {c.item.emoji ?? ''} {c.item.ku} — {c.item.tr}
                                  </option>
                                );
                              })}
                          </select>
                        );
                      })}
                    </div>

                    {/* Kelime Arama — tüm geçmiş dersler */}
                    {prevContextLoaded && allPreviousReviewItems.filter(c => c.item.meaningGroup !== 'fallback_previous').length > 0 && (
                      <div style={{ position: 'relative', marginTop: 8 }}>
                        <input
                          type="text"
                          value={reviewSearch}
                          onChange={e => setReviewSearch(e.target.value)}
                          placeholder="🔍 Tüm derslerden kelime ara (Kürtçe veya Türkçe)..."
                          disabled={status === 'generating'}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '6px 10px', borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg2)', color: 'var(--text)',
                            fontSize: 12,
                          }}
                        />
                        {searchResults.length > 0 && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                            background: 'var(--bg)', border: '1px solid var(--border)',
                            borderRadius: 8, maxHeight: 260, overflowY: 'auto',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.25)', marginTop: 3,
                          }}>
                            {searchResults.map(c => {
                              const already = selectedReviewIds.includes(c.item.id);
                              const isFallback = c.item.meaningGroup === 'fallback_previous';
                              return (
                                <div
                                  key={c.item.id}
                                  onClick={() => {
                                    if (already || isFallback) return;
                                    setSelectedReviewIds(prev => {
                                      if (prev.includes(c.item.id)) return prev;
                                      const next = [...prev];
                                      const free = next.findIndex(id => !id);
                                      if (free >= 0) next[free] = c.item.id;
                                      else next[2] = c.item.id;
                                      return next;
                                    });
                                    setReviewSearch('');
                                  }}
                                  style={{
                                    padding: '6px 10px', cursor: already || isFallback ? 'default' : 'pointer',
                                    opacity: isFallback ? 0.4 : 1,
                                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                                    borderBottom: '1px solid var(--border)',
                                    background: already ? 'var(--bg3)' : undefined,
                                  }}
                                  onMouseEnter={e => { if (!already && !isFallback) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg2)'; }}
                                  onMouseLeave={e => { if (!already) (e.currentTarget as HTMLDivElement).style.background = already ? 'var(--bg3)' : ''; }}
                                >
                                  <span style={{ color: 'var(--text3)', fontSize: 10, minWidth: 44 }}>U{c.sourceUnitOrder}·D{c.sourceLessonOrder}</span>
                                  <span>{c.item.emoji ?? '📖'}</span>
                                  <span style={{ fontWeight: 600 }}>{c.item.ku}</span>
                                  <span style={{ color: 'var(--text3)' }}>—</span>
                                  <span style={{ color: 'var(--text2)', flex: 1 }}>{c.item.tr}</span>
                                  {already && <span style={{ color: 'var(--green)', fontSize: 10 }}>✓</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {reviewCandidates.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 6 }}>
                        Önceki ders bulunamadı; müfredat fallback'i de boş. Ders sırasını kontrol et.
                      </div>
                    ) : reviewCandidates.some(c =>
                        c.item.meaningGroup === 'fallback_previous' ||
                        c.item.visualAffordanceTags?.includes('source:fallback_previous_lesson'),
                      ) ? (
                      <div style={{
                        marginTop: 6, borderRadius: 8, overflow: 'hidden',
                        border: '1px solid var(--red)',
                      }}>
                        <div style={{
                          background: 'var(--red)', color: '#fff',
                          fontSize: 11, fontWeight: 700, padding: '5px 10px',
                        }}>
                          ❌ Ders {lessonOrder - 1} Firestore'da yok
                        </div>
                        <div style={{
                          background: 'var(--bg3)', padding: '8px 10px',
                          fontSize: 11, color: 'var(--text2)',
                          display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                          <div>
                            Tekrar kelimeleri için <strong>Ders {lessonOrder - 1}'in gerçek ID'leri</strong> gerekiyor.
                            Şu adımları izle:
                          </div>
                          <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <li>Aşağıdaki butona tıkla → <strong>Ders {lessonOrder - 1}</strong>'e geçersin</li>
                            <li>Ders zaten üretildiyse <strong>"💾 Taslak kaydet"</strong> butonuna bas</li>
                            <li>Üretilmediyse önce <strong>"🤖 60 kart üret"</strong> → sonra kaydet</li>
                            <li>Kaydettikten sonra yukarıdan <strong>Ders {lessonOrder}</strong>'i seç, tekrar kelimeleri gelecek</li>
                          </ol>
                          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                            <button
                              className="btn btn-red btn-sm"
                              style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}
                              onClick={() => {
                                const prev = lessonOrder - 1;
                                setLessonOrder(prev);
                                setLesson(null);
                                setStatus('idle');
                                setExistingLesson(null);
                                setSelectedReviewIds(['', '', '']);
                              }}
                            >
                              → Ders {lessonOrder - 1}'e Git ve Kaydet
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 11, flexShrink: 0 }}
                              onClick={() => setPrevContextRefreshKey(k => k + 1)}
                            >
                              🔄 Yenile
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>
                        ✓ Gerçek ID'ler yüklendi — tekrar kartları orijinal görsel ve sesleriyle eşleşecek.
                      </div>
                    )}
                </>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Karakter odağı</label>
              <select value={charFocus} onChange={e => setCharFocus(e.target.value)} disabled={status === 'generating'}>
                <option value="auto">🎲 AI seçsin</option>
                <option value="baran">👤 Baran ağırlıklı</option>
                <option value="berfin">👩 Berfin ağırlıklı</option>
                <option value="kurdo">🐦 Kurdo maskot</option>
                <option value="both">👫 Baran + Berfin birlikte</option>
                <option value="none">🚫 Karakter yok (sadece nesneler)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Ders tarzı</label>
              <select value={lessonStyle} onChange={e => setLessonStyle(e.target.value)} disabled={status === 'generating'}>
                <option value="auto">🎲 AI seçsin</option>
                <option value="dialogue">💬 Diyalog ağırlıklı</option>
                <option value="story">📖 Hikaye tarzında</option>
                <option value="culture">🏛️ Kültür odaklı</option>
                <option value="review">🔄 Tekrar ağırlıklı</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                Ek not
                <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 4 }}>(opsiyonel)</span>
              </label>
              <textarea
                value={extraNote}
                onChange={e => setExtraNote(e.target.value)}
                placeholder="Örn: 'Newroz bağlamı ekle', 'Mutfak sahnesinde geçsin'..."
                disabled={status === 'generating'}
                style={{ minHeight: 40 }}
              />
            </div>

            {effectivePrevContext.length > 0 && (
              <div style={{ background: 'var(--bg4)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: 'var(--blue)', marginBottom: 4 }}>📚 Tekrar için önceki dersler:</div>
                {effectivePrevContext.map(ctx => (
                  <div key={`${ctx.unitId ?? 'unit'}_${ctx.lessonOrder}`} style={{ color: 'var(--text2)', marginBottom: 2 }}>
                    U{ctx.unitOrder ?? '?'} D{ctx.lessonOrder}: {ctx.itemsKu.slice(0, 6).join(', ')}{ctx.itemsKu.length > 6 ? '...' : ''}
                  </div>
                ))}
              </div>
            )}

            {existingLesson && (
              <div style={{
                background: 'var(--orange-dim)', borderRadius: 8, padding: '8px 12px',
                marginBottom: 12, fontSize: 11, border: '1px solid var(--orange)',
              }}>
                <div style={{ fontWeight: 600, color: 'var(--orange)', marginBottom: 4 }}>
                  📌 Bu slot için kayıtlı ders var
                </div>
                <div style={{ color: 'var(--text2)', marginBottom: 6 }}>
                  "{existingLesson.title}" — {existingLesson.status}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/curriculum/${unitId}?lessonOrder=${lessonOrder}&tab=production`)}
                  style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
                >
                  🎨 Git → Görsel Üret ({imageProviderLabel})
                </button>
              </div>
            )}

            {!aiProviderReady && (
              <div className="validation-box validation-error" style={{ marginBottom: 12 }}>
                ⚠️ {aiProviderLabel} API anahtarı eksik — admin/.env dosyasını kontrol et
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14 }}
              onClick={handleGenerate}
              disabled={status === 'generating' || (lessonOrder > 1 && !prevContextLoaded)}
            >
              {status === 'generating'
                ? `⏳ ${progress || `${aiProviderLabel} bağlanıyor...`}`
                : lessonOrder > 1 && !prevContextLoaded
                ? '⏳ Önceki dersler yükleniyor...'
                : '🤖 60 kart üret'}
            </button>
          </div>

          {/* Doğrulama & Kaydet */}
          {lesson && validation && (
            <div className="card">
              <div className={`validation-box ${validation.valid ? 'validation-ok' : 'validation-error'}`} style={{ marginBottom: 10 }}>
                {validation.valid
                  ? `✅ Geçerli — ${lesson.steps.length} adım, ${lessonCoreItemCount} kelime${lessonExternalDistractorCount ? ` + ${lessonExternalDistractorCount} geçmiş şık` : ''}`
                  : `❌ ${validation.errors.length} hata`}
                {validation.warnings.length > 0 && (
                  <span style={{ marginLeft: 8, color: 'var(--orange)', fontSize: 11 }}>
                    ⚠️ {validation.warnings.length} uyarı
                  </span>
                )}
              </div>
              {validation.errors.slice(0, 4).map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--red)', marginBottom: 3 }}>• {e}</div>
              ))}
              {validation.errors.length > 4 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                  +{validation.errors.length - 4} hata daha...
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveToDalle}
                  disabled={saving}
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 0', fontSize: 13 }}
                >
                  {saving ? '⏳ Kaydediliyor...' : '🎨 Onayla + Görsellere Başla →'}
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleGenerate}
                    disabled={saving}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    🔄 Yeniden üret
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {saving ? '⏳' : '💾'} Taslak
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hata */}
          {error && (
            <div className="validation-box validation-error" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>❌ Hata</div>
              <div style={{ fontSize: 12 }}>{error}</div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                onClick={() => { setStatus('idle'); setError(''); }}
              >
                Tekrar dene
              </button>
            </div>
          )}
        </div>

        {/* ── SAĞ PANEL: Kart önizleme ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {status === 'generating' && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: 400, color: 'var(--text2)',
              border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg3)',
            }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🤖</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{aiProviderLabel} 60 kart üretiyor...</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>{progress}</div>
              <div style={{ width: 240, height: 6, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: '70%', background: 'var(--blue)', borderRadius: 3,
                  animation: 'shimmer 1.4s ease-in-out infinite alternate',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 16, maxWidth: 280, textAlign: 'center' }}>
                Tüm soru metinleri, şıklar ve Kürmanci kontrolü yapılıyor. 15-30 saniye sürebilir.
              </div>
            </div>
          )}

          {status === 'idle' && !lesson && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: 400, color: 'var(--text3)',
              border: '2px dashed var(--border)', borderRadius: 12,
            }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>🗂️</div>
              <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>
                60 kartlık ders önizlemesi burada çıkacak
              </div>
              <div style={{ fontSize: 12 }}>
                Bölüm 1 (öğren, 20 kart) + Bölüm 2 (sınav, 20 soru) + Bölüm 3 (tekrar, 20 soru)
              </div>
            </div>
          )}

          {completingProgress && (
            <div style={{
              background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'var(--blue)',
            }}>
              ⏳ {completingProgress}
            </div>
          )}

          {lesson && (
            <LessonReviewPanel
              lesson={lesson}
              selectedIdx={selectedIdx}
              onSelectIdx={setSelectedIdx}
              onStepEdit={handleStepEdit}
              onItemEdit={handleItemEdit}
              onCompleteSection={handleCompleteSection}
              completingSection={completingSection}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          from { transform: translateX(-30px); }
          to   { transform: translateX(30px); }
        }
      `}</style>
    </div>
  );
}

// ─── DERS İNCELEME PANELİ ───
function LessonReviewPanel({
  lesson, selectedIdx, onSelectIdx, onStepEdit, onItemEdit, onCompleteSection, completingSection,
}: {
  lesson: AdminLesson;
  selectedIdx: number | null;
  onSelectIdx: (i: number | null) => void;
  onStepEdit: (idx: number, updated: CurriculumLessonStep, extraItems?: CurriculumMediaItem[]) => void;
  onItemEdit: (idx: number, field: string, value: string) => void;
  onCompleteSection: (section: 2 | 3) => void;
  completingSection: 2 | 3 | null;
}) {
  const externalDistractorIds = new Set(lesson.externalDistractorItemIds ?? []);
  const coreItems = lesson.items.filter(item => !externalDistractorIds.has(item.id));
  const externalItems = lesson.items.filter(item => externalDistractorIds.has(item.id));
  const PARTS = [
    { label: 'Bölüm 1 — Öğren (can yok, 20 adım)', color: 'var(--blue)', start: 0, end: 20 },
    { label: 'Bölüm 2 — Sınav (can var, 20 soru)', color: 'var(--green)', start: 20, end: 40 },
    { label: 'Bölüm 3 — Tekrar (can var, 20 soru)', color: 'var(--orange)', start: 40, end: 60 },
  ];

  return (
    <div>
      {/* Kelime tablosu */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
          📖 Kelimeler ({coreItems.length}{externalItems.length ? ` + ${externalItems.length} geçmiş şık` : ''})
          <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text2)', marginLeft: 8 }}>
            — hücrelere tıklayarak düzenleyebilirsin
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['#', '🔤', 'Kürtçe', 'Türkçe', 'İngilizce', 'Telaffuz', 'Örnek (Kürtçe)'].map(h => (
                  <th key={h} style={{
                    padding: '6px 10px', textAlign: 'left', fontSize: 11,
                    color: 'var(--text3)', borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lesson.items.map((item, idx) => (
                <tr key={item.id} style={{ background: idx % 2 === 0 ? 'var(--bg4)' : 'var(--bg3)' }}>
                  <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 10px', fontSize: 18 }}>
                    <EditableCell value={item.emoji ?? ''} onSave={v => onItemEdit(idx, 'emoji', v)} />
                  </td>
                  <td style={{ padding: '5px 10px', fontWeight: 600 }}>
                    <EditableCell value={item.ku} onSave={v => onItemEdit(idx, 'ku', v)} highlight="var(--blue)" />
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text2)' }}>
                    <EditableCell value={item.tr} onSave={v => onItemEdit(idx, 'tr', v)} />
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>
                    <EditableCell value={item.en ?? ''} onSave={v => onItemEdit(idx, 'en', v)} />
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>
                    <EditableCell value={item.pronunciation ?? ''} onSave={v => onItemEdit(idx, 'pronunciation', v)} />
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text2)' }}>
                    <EditableCell value={item.exampleKu ?? ''} onSave={v => onItemEdit(idx, 'exampleKu', v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* İnline editör (seçili kart) */}
      {selectedIdx !== null && lesson.steps[selectedIdx] && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          marginBottom: 16, borderRadius: 10,
          border: '1px solid var(--blue)', background: 'var(--bg2)',
        }}>
          <StepDetailEditor
            step={lesson.steps[selectedIdx]!}
            stepIdx={selectedIdx}
            lesson={lesson}
            onSave={(updated, extraItems) => { onStepEdit(selectedIdx, updated, extraItems); onSelectIdx(null); }}
            onClose={() => onSelectIdx(null)}
          />
        </div>
      )}

      {/* Eksik bölüm banner'ları */}
      {([2, 3] as const).map(sectionNum => {
        const part = PARTS[sectionNum - 1]!;
        const existing = lesson.steps.slice(part.start, part.end);
        const missing = 20 - existing.length;
        if (missing <= 0) return null;
        return (
          <div key={`banner-${sectionNum}`} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--orange-dim)', border: '1px solid var(--orange)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>
                Bölüm {sectionNum} eksik — {missing} adım üretilmedi
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                Sıfırdan üretmeden sadece bu bölümü tamamlayabilirsin.
              </div>
            </div>
            <button
              className="btn btn-orange btn-sm"
              style={{ flexShrink: 0, fontWeight: 700 }}
              onClick={() => onCompleteSection(sectionNum)}
              disabled={!!completingSection}
            >
              {completingSection === sectionNum ? '⏳ Üretiliyor...' : `✨ Bölüm ${sectionNum}'i Tamamla`}
            </button>
          </div>
        );
      })}

      {/* 3 bölüm kart listesi */}
      {PARTS.map((part, partIdx) => {
        const sectionNum = (partIdx + 1) as 1 | 2 | 3;
        const steps = lesson.steps.slice(part.start, part.end);
        const missing = 20 - steps.length;
        const isCompletable = missing > 0 && (sectionNum === 2 || sectionNum === 3);
        const isCompleting = completingSection === sectionNum;
        return (
          <div key={part.label} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 3, height: 18, background: part.color, borderRadius: 2 }} />
              <span style={{ fontWeight: 700, fontSize: 12, color: part.color }}>{part.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{steps.length}/20 kart</span>
              {missing > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 8px', borderRadius: 6,
                  background: 'var(--orange-dim)', color: 'var(--orange)',
                }}>
                  ⚠️ Eksik: {missing} adım
                </span>
              )}
              {isCompletable && (
                <button
                  className="btn btn-blue btn-sm"
                  style={{ fontSize: 10, padding: '2px 10px', marginLeft: 4 }}
                  onClick={() => onCompleteSection(sectionNum as 2 | 3)}
                  disabled={!!completingSection}
                >
                  {isCompleting ? '⏳ Tamamlanıyor...' : `✨ Bölüm ${sectionNum}'i Tamamla`}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {steps.map((step, si) => {
                const globalIdx = part.start + si;
                const isSelected = selectedIdx === globalIdx;
                return (
                  <StepTextCard
                    key={step.id}
                    step={step}
                    stepNumber={globalIdx + 1}
                    lesson={lesson}
                    isSelected={isSelected}
                    onClick={() => onSelectIdx(isSelected ? null : globalIdx)}
                  />
                );
              })}
              {steps.length === 0 && (
                <div style={{
                  padding: '20px', textAlign: 'center',
                  color: 'var(--text3)', fontSize: 12,
                  border: '1px dashed var(--border)', borderRadius: 8,
                }}>
                  Bu bölümde henüz adım yok
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TEK ADIM METİN KARTI ───
function StepTextCard({
  step, stepNumber, lesson, isSelected, onClick,
}: {
  step: CurriculumLessonStep;
  stepNumber: number;
  lesson: AdminLesson;
  isSelected: boolean;
  onClick: () => void;
}) {
  const color = STEP_COLORS[step.type] ?? '#666';
  const icon = STEP_ICONS[step.type] ?? '•';

  // İtem yardımcısı
  const item = (id: string): CurriculumMediaItem | undefined =>
    lesson.items.find(i => i.id === id);

  // İçerik satırları — her step tipi için tam metin
  const rows: { label: string; value: string; highlight?: string }[] = [];

  if (step.type === 'learn_card') {
    const it = item(step.itemId);
    if (it) {
      rows.push({ label: 'Kelime', value: `${it.emoji ?? ''} ${it.ku}`, highlight: 'var(--blue)' });
      rows.push({ label: 'Anlamı', value: `${it.tr}${it.en ? ' / ' + it.en : ''}` });
      if (it.pronunciation) rows.push({ label: 'Telaffuz', value: it.pronunciation });
    }
    if (step.exampleKu) rows.push({ label: 'Örnek', value: step.exampleKu, highlight: 'var(--text)' });
    if (step.exampleTr) rows.push({ label: '', value: step.exampleTr });
  }

  if (step.type === 'image_to_word' || step.type === 'word_to_image') {
    if ('prompt' in step && step.prompt) rows.push({ label: 'Soru', value: step.prompt, highlight: 'var(--text)' });
    const targetId = 'imageItemId' in step
      ? (step as { imageItemId?: string }).imageItemId
      : 'targetItemId' in step
        ? (step as { targetItemId?: string }).targetItemId
        : undefined;
    const correctId = 'correctItemId' in step ? (step as { correctItemId?: string }).correctItemId : targetId;
    if (targetId) {
      const it = item(targetId);
      if (it) rows.push({ label: 'Hedef', value: `${it.emoji ?? ''} ${it.ku} (${it.tr})`, highlight: 'var(--blue)' });
    }
    if (correctId && correctId !== targetId) {
      const it = item(correctId);
      if (it) rows.push({ label: '✓ Doğru', value: `${it.emoji ?? ''} ${it.ku} (${it.tr})`, highlight: 'var(--green)' });
    }
    const distractors = (('distractorItemIds' in step) ? (step as { distractorItemIds?: string[] }).distractorItemIds : []) ?? [];
    if (distractors.length) {
      const labels = distractors.map(id => {
        const it = item(id);
        return it ? `${it.emoji ?? ''} ${it.ku}` : id;
      });
      rows.push({ label: '✗ Yanlış şıklar', value: labels.join('  |  ') });
    }
  }

  if (step.type === 'match_pairs') {
    if ('prompt' in step && step.prompt) rows.push({ label: 'Soru', value: step.prompt });
    if ('pairs' in step) {
      (step as { pairs: { leftItemId: string; rightItemId: string }[] }).pairs?.forEach((p, pi) => {
        const left = item(p.leftItemId);
        const right = item(p.rightItemId);
        if (left && right) rows.push({ label: `Çift ${pi + 1}`, value: `${left.emoji ?? ''} ${left.ku}  ↔  ${right.ku}` });
      });
    }
  }

  if (step.type === 'fill_blank') {
    if ('prompt' in step && step.prompt) rows.push({ label: 'Soru', value: step.prompt });
    rows.push({ label: 'Cümle', value: step.sentenceKu, highlight: 'var(--text)' });
    if (step.sentenceTr) rows.push({ label: '', value: step.sentenceTr });
    const blankIt = item(step.blankItemId);
    if (blankIt) rows.push({ label: '✓ Boşluk', value: `${blankIt.emoji ?? ''} ${blankIt.ku} (${blankIt.tr})`, highlight: 'var(--green)' });
    const distractors = step.distractorItemIds ?? [];
    if (distractors.length) {
      const labels = distractors.map(id => {
        const it = item(id);
        return it ? it.ku : id;
      });
      rows.push({ label: '✗ Yanlış şıklar', value: labels.join('  |  ') });
    }
  }

  if (step.type === 'word_order') {
    if ('prompt' in step && step.prompt) rows.push({ label: 'Soru', value: step.prompt });
    rows.push({ label: '✓ Doğru sıra', value: step.correctOrderKu.join(' → '), highlight: 'var(--green)' });
    if (step.correctOrderTr) rows.push({ label: '', value: step.correctOrderTr });
    rows.push({ label: 'Karışık kelimeler', value: step.shuffledWords.map(w => `[${w}]`).join(' ') });
  }

  if (step.type === 'listen_to_word' || step.type === 'listen_to_image') {
    if ('prompt' in step && step.prompt) rows.push({ label: 'Soru', value: step.prompt });
    const targetIt = 'targetItemId' in step ? item((step as { targetItemId?: string }).targetItemId ?? '') : undefined;
    if (targetIt) rows.push({ label: '✓ Doğru', value: `${targetIt.emoji ?? ''} ${targetIt.ku} (${targetIt.tr})`, highlight: 'var(--green)' });
    if ('audioText' in step && (step as { audioText?: string }).audioText)
      rows.push({ label: '🔊 Ses', value: (step as { audioText?: string }).audioText! });
    const distractors = (('distractorItemIds' in step) ? (step as { distractorItemIds?: string[] }).distractorItemIds : []) ?? [];
    if (distractors.length) {
      const labels = distractors.map(id => { const it = item(id); return it ? it.ku : id; });
      rows.push({ label: '✗ Yanlış şıklar', value: labels.join('  |  ') });
    }
  }

  if (step.type === 'dictation') {
    if ('prompt' in step && step.prompt) rows.push({ label: 'Soru', value: step.prompt });
    rows.push({ label: '✓ Yazılacak metin', value: step.targetText, highlight: 'var(--green)' });
    if (step.hint) rows.push({ label: 'İpucu', value: step.hint });
    if ('audioText' in step && (step as { audioText?: string }).audioText)
      rows.push({ label: '🔊 Ses', value: (step as { audioText?: string }).audioText! });
  }

  if (step.type === 'typing') {
    if ('prompt' in step && step.prompt) rows.push({ label: 'Soru', value: step.prompt });
    const targetIt = item(step.targetItemId);
    if (targetIt) rows.push({ label: '✓ Yazılacak', value: `${targetIt.emoji ?? ''} ${targetIt.ku} (${targetIt.tr})`, highlight: 'var(--green)' });
    if (step.acceptedAnswers?.length)
      rows.push({ label: 'Kabul edilen', value: step.acceptedAnswers.join(', ') });
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? 'var(--blue-dim)' : 'var(--bg4)',
        border: `1px solid ${isSelected ? 'var(--blue)' : color + '33'}`,
        borderRadius: 8, cursor: 'pointer',
        transition: 'border-color 0.12s, background 0.12s',
        overflow: 'hidden',
      }}
    >
      {/* Başlık şeridi */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderBottom: rows.length > 0 ? `1px solid ${color}22` : 'none',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, minWidth: 22, textAlign: 'center',
          background: 'var(--bg)', color: 'var(--text3)', borderRadius: 4, padding: '1px 4px',
        }}>
          {stepNumber}
        </span>
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
          background: `${color}22`, color,
        }}>
          {icon} {step.type}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)', flex: 1 }}>{step.id}</span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>
          {isSelected ? '▲ Düzenlemeyi kapat' : '▼ Düzenle'}
        </span>
      </div>

      {/* İçerik satırları */}
      {rows.length > 0 && (
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
              {row.label && (
                <span style={{
                  fontSize: 10, color: 'var(--text3)', minWidth: 90, flexShrink: 0,
                  paddingTop: 1,
                }}>
                  {row.label}
                </span>
              )}
              <span style={{ color: row.highlight ?? 'var(--text2)', lineHeight: 1.5 }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ADIM DETAY EDİTÖR ───
function StepDetailEditor({
  step, stepIdx, lesson, onSave, onClose,
}: {
  step: CurriculumLessonStep;
  stepIdx: number;
  lesson: AdminLesson;
  onSave: (updated: CurriculumLessonStep, extraItems?: CurriculumMediaItem[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CurriculumLessonStep>(step);
  useEffect(() => { setDraft(step); }, [step]);

  const set = (k: string, v: unknown) => setDraft(prev => ({ ...prev, [k]: v } as CurriculumLessonStep));
  const color = STEP_COLORS[step.type] ?? '#666';
  const adjacentDistractorOptions = adjacentUnitDistractorItems(lesson);
  const optionById = new Map(adjacentDistractorOptions.map(item => [item.id, item]));

  const itemOptions = lesson.items.map(i => (
    <option key={i.id} value={i.id}>{i.emoji} {i.ku} — {i.tr}</option>
  ));

  const selectedExtraItems = () => {
    const ids = (('distractorItemIds' in draft) ? (draft as { distractorItemIds?: string[] }).distractorItemIds : []) ?? [];
    const existingIds = new Set(lesson.items.map(item => item.id));
    return ids
      .filter(id => !existingIds.has(id))
      .map(id => optionById.get(id))
      .filter((item): item is CurriculumMediaItem => Boolean(item));
  };

  const apply = () => onSave(draft, selectedExtraItems());

  const renderDistractorSelects = (ids: string[] = []) => {
    const slots = Array.from({ length: Math.max(3, ids.length || 3) }, (_, index) => ids[index] ?? '');
    const selectedLessonItems = ids
      .map(id => lesson.items.find(item => item.id === id))
      .filter((item): item is CurriculumMediaItem => Boolean(item));
    const options = [...adjacentDistractorOptions];
    for (const item of selectedLessonItems) {
      if (!options.some(option => option.id === item.id)) options.push(item);
    }
    return (
      <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
        <label className="form-label">Yanlış şıklar</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {slots.map((selectedId, slot) => (
            <select
              key={slot}
              value={selectedId}
              onChange={e => {
                const next = [...slots];
                next[slot] = e.target.value;
                set('distractorItemIds', next.filter(Boolean));
              }}
            >
              <option value="">Yanlış şık {slot + 1}</option>
              {options
                .filter(item => item.id === selectedId || !slots.includes(item.id))
                .map(item => {
                  const source = item.tags?.find(tag => tag.startsWith('source:'))?.replace('source:', '');
                  return (
                    <option key={item.id} value={item.id}>
                      {source ? `${source} · ` : ''}{item.emoji ?? ''} {item.ku} — {item.tr}
                    </option>
                  );
                })}
            </select>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5 }}>
          Havuz: bulunduğun ünite + önceki ve sonraki 1 ünite. Yeni seçilen komşu kelimeler derse external distractor olarak eklenir.
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 6,
          background: `${color}22`, color, fontWeight: 700,
        }}>
          {STEP_ICONS[step.type]} {step.type} — #{stepIdx + 1}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)', flex: 1 }}>ID: {step.id}</span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ İptal</button>
        <button className="btn btn-primary btn-sm" onClick={apply}>💾 Uygula</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {'prompt' in draft && (
          <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
            <label className="form-label">Soru metni (Kürtçe)</label>
            <input value={(draft as { prompt?: string }).prompt ?? ''} onChange={e => set('prompt', e.target.value)} />
          </div>
        )}
        {'promptTr' in draft && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Soru metni (Türkçe)</label>
            <input value={(draft as { promptTr?: string }).promptTr ?? ''} onChange={e => set('promptTr', e.target.value)} />
          </div>
        )}
        {'title' in draft && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Başlık</label>
            <input value={(draft as { title?: string }).title ?? ''} onChange={e => set('title', e.target.value)} />
          </div>
        )}
        {draft.type === 'learn_card' && (
          <>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Kelime seç</label>
              <select value={draft.itemId} onChange={e => set('itemId', e.target.value)}>{itemOptions}</select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Kürtçe örnek cümle</label>
              <input value={draft.exampleKu ?? ''} onChange={e => set('exampleKu', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Türkçe örnek</label>
              <input value={draft.exampleTr ?? ''} onChange={e => set('exampleTr', e.target.value)} />
            </div>
          </>
        )}
        {(draft.type === 'image_to_word' || draft.type === 'word_to_image') && (
          <>
            {'imageItemId' in draft && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Görsel kelimesi</label>
                <select value={(draft as { imageItemId?: string }).imageItemId ?? ''} onChange={e => set('imageItemId', e.target.value)}>{itemOptions}</select>
              </div>
            )}
            {'correctItemId' in draft && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Doğru cevap</label>
                <select value={(draft as { correctItemId?: string }).correctItemId ?? ''} onChange={e => set('correctItemId', e.target.value)}>{itemOptions}</select>
              </div>
            )}
            {'targetItemId' in draft && draft.type === 'word_to_image' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Hedef kelime</label>
                <select value={(draft as { targetItemId?: string }).targetItemId ?? ''} onChange={e => set('targetItemId', e.target.value)}>{itemOptions}</select>
              </div>
            )}
            {'distractorItemIds' in draft && (
              renderDistractorSelects((draft as { distractorItemIds?: string[] }).distractorItemIds ?? [])
            )}
          </>
        )}
        {draft.type === 'fill_blank' && (
          <>
            <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
              <label className="form-label">Kürtçe cümle (___ boşluk için)</label>
              <input value={draft.sentenceKu} onChange={e => set('sentenceKu', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
              <label className="form-label">Türkçe cümle</label>
              <input value={draft.sentenceTr ?? ''} onChange={e => set('sentenceTr', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">✓ Boşluğa giren kelime</label>
              <select value={draft.blankItemId} onChange={e => set('blankItemId', e.target.value)}>{itemOptions}</select>
            </div>
            {renderDistractorSelects(draft.distractorItemIds)}
          </>
        )}
        {draft.type === 'word_order' && (
          <>
            <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
              <label className="form-label">✓ Doğru sıra (virgülle ayır)</label>
              <input
                value={draft.correctOrderKu.join(', ')}
                onChange={e => set('correctOrderKu', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Türkçe çeviri</label>
              <input value={draft.correctOrderTr ?? ''} onChange={e => set('correctOrderTr', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Karışık kelimeler (virgülle)</label>
              <input
                value={draft.shuffledWords.join(', ')}
                onChange={e => set('shuffledWords', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              />
            </div>
          </>
        )}
        {draft.type === 'dictation' && (
          <>
            <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
              <label className="form-label">✓ Yazılacak Kürtçe metin</label>
              <input value={draft.targetText} onChange={e => set('targetText', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
              <label className="form-label">Kabul edilen yanıtlar (virgülle)</label>
              <input
                value={draft.acceptedAnswers.join(', ')}
                onChange={e => set('acceptedAnswers', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              />
            </div>
          </>
        )}
        {'audioText' in draft && (
          <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
            <label className="form-label">🔊 Ses metni (TTS)</label>
            <input value={(draft as { audioText?: string }).audioText ?? ''} onChange={e => set('audioText', e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INLINE DÜZENLENEBİLİR HÜCRE ───
function EditableCell({ value, onSave, highlight }: { value: string; onSave: (v: string) => void; highlight?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        style={{
          background: 'var(--bg)', border: '1px solid var(--blue)',
          borderRadius: 4, padding: '2px 6px', fontSize: 12,
          color: highlight ?? 'inherit', width: '100%', minWidth: 60,
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Düzenlemek için tıkla"
      style={{
        cursor: 'pointer', color: highlight ?? 'inherit',
        borderBottom: '1px dashed var(--border2)', padding: '1px 2px',
        borderRadius: 3,
      }}
    >
      {value || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>boş</span>}
    </span>
  );
}
