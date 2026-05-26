import type { AdminLesson } from '../types/admin';
import type { CurriculumMediaItem } from '../types/curriculum';

export type VocabImageCategory =
  | 'concrete_object'
  | 'action'
  | 'emotion'
  | 'abstract_concept'
  | 'cultural_concept'
  | 'ambiguous_hard';

export interface VocabImageJob {
  itemId: string;
  uniqueKey: string;
  unitId: string;
  lessonId: string;
  lessonTitle: string;
  ku: string;
  tr: string;
  en?: string;
  emoji?: string;
  partOfSpeech?: string;
  meaningGroup?: string;
  visualAffordanceTags: string[];
  category: VocabImageCategory;
  duplicateItemIds: string[];
  prompt: string;
}

export interface VocabImageQc {
  conceptCorrect: boolean;
  styleConsistent: boolean;
  noTextOrLogo: boolean;
  mobileReadable: boolean;
  characterOrPropOk: boolean;
  notes: string;
}

export const DEFAULT_QC: VocabImageQc = {
  conceptCorrect: false,
  styleConsistent: false,
  noTextOrLogo: false,
  mobileReadable: false,
  characterOrPropOk: false,
  notes: '',
};

export const STYLE_GUIDE = [
  'Warm, child-friendly educational illustration for a Kurdish language learning app.',
  'Square 1024x1024 composition, readable as a small mobile card.',
  'Clean vector-like digital illustration with simple rounded shapes.',
  'Soft natural palette: sky blue, leaf green, warm yellow, coral accent, gentle off-white background.',
  'Calm daylight, soft shadows, clean edges, medium line weight.',
  'One central concept only; no crowded scene and no decorative clutter.',
  'Kurdish/Turkish regional everyday atmosphere when relevant: modest homes, hills, village roads, bazaar details, respectful everyday clothing.',
  'Characters, when needed, are simple friendly learners with natural expression; no photorealistic faces.',
  'Straight-on or gentle 3/4 camera view, not dramatic, not cinematic.',
  'No text, no letters, no captions, no labels, no speech bubbles, no logos, no watermark.',
  'No UI elements, no brand marks, no flags unless the lesson explicitly needs them.',
].join('\n- ');

const CATEGORY_RULES: Record<VocabImageCategory, string> = {
  concrete_object: 'Show the target as a clear tangible object or place in a simple everyday scene. Make it instantly recognizable without writing its name.',
  action: 'Show one friendly character clearly performing the action. The pose must communicate the verb without text.',
  emotion: 'Show one friendly character expressing the feeling in a gentle, child-safe way. Keep the emotion readable but not exaggerated.',
  abstract_concept: 'Use a simple everyday metaphor. Make the concept understandable for a beginner without text or symbols.',
  cultural_concept: 'Show the concept respectfully through everyday Kurdish/Turkish regional context. Avoid stereotypes, politics, and religious messaging.',
  ambiguous_hard: 'Pick the most common beginner-friendly meaning. Show only that meaning with strong visual clarity and no competing interpretation.',
};

function normalize(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ]+/gi, '_')
    .replace(/^_+|_+$/g, '');
}

function textOf(item: CurriculumMediaItem): string {
  return [
    item.ku,
    item.tr,
    item.en ?? '',
    item.meaningGroup ?? '',
    item.partOfSpeech ?? '',
    ...(item.tags ?? []),
    ...(item.visualAffordanceTags ?? []),
  ].join(' ').toLocaleLowerCase('tr-TR');
}

export function classifyVocabItem(item: CurriculumMediaItem): VocabImageCategory {
  const text = textOf(item);
  const value = `${item.ku} ${item.tr} ${item.en ?? ''}`.toLocaleLowerCase('tr-TR');

  if (item.partOfSpeech === 'verb' || text.includes('pos:verb')) return 'action';
  if (/mutlu|üzgün|kork|sinir|happy|sad|angry|afraid|xemgîn|bextewar/.test(value)) return 'emotion';
  if (/newroz|dengbêj|dengbej|kilam|govend|cejn|mizgeft|mosque|cami/.test(value) || text.includes('culture')) return 'cultural_concept';
  if (item.meaningGroup === 'time' || text.includes('meaning:time')) {
    if (/breakfast|dinner|kahvalt|yemek|taştê|şîv/.test(value)) return 'concrete_object';
    return 'abstract_concept';
  }
  if (item.meaningGroup === 'place' || text.includes('meaning:place')) return 'concrete_object';
  if ((item.tr ?? '').includes('/') || item.ku.includes('?') || (item.avoidWithItemIds ?? []).length > 0) return 'ambiguous_hard';
  return 'concrete_object';
}

function conceptInstruction(job: Pick<VocabImageJob, 'ku' | 'tr' | 'en' | 'category' | 'partOfSpeech' | 'visualAffordanceTags'>): string {
  const meaning = `${job.en || job.tr} (${job.tr})`;
  const hints = job.visualAffordanceTags.length ? job.visualAffordanceTags.join(', ') : 'none';

  if (job.category === 'action') return `Show a friendly learner clearly doing "${meaning}". The action must be readable from the pose.`;
  if (job.category === 'emotion') return `Show a friendly learner feeling "${meaning}" in a gentle, child-safe way.`;
  if (job.category === 'abstract_concept') return `Show "${meaning}" through a simple everyday metaphor. Use visual hints if useful: ${hints}.`;
  if (job.category === 'cultural_concept') return `Show "${meaning}" with respectful everyday Kurdish/Turkish regional context, without stereotypes.`;
  if (job.category === 'ambiguous_hard') return `Show the beginner-friendly meaning of "${meaning}" only. Avoid alternate meanings or visual confusion.`;
  return `Show "${meaning}" as the main visible subject. Use visual hints if useful: ${hints}.`;
}

export function buildVocabImagePrompt(job: Pick<VocabImageJob, 'ku' | 'tr' | 'en' | 'category' | 'partOfSpeech' | 'visualAffordanceTags'>): string {
  return [
    'Create one vocabulary illustration for Kurdigo.',
    '',
    `Target Kurdish word: "${job.ku}"`,
    `Turkish meaning: "${job.tr}"`,
    `English meaning: "${job.en || job.tr}"`,
    `Part of speech: ${job.partOfSpeech || 'unknown'}`,
    `Concept class: ${job.category}`,
    conceptInstruction(job),
    '',
    `Category-specific rule: ${CATEGORY_RULES[job.category]}`,
    '',
    'Global style guide:',
    `- ${STYLE_GUIDE}`,
    '',
    'Strict negatives: text, letters, captions, watermark, logo, UI, photorealism, busy background, multiple unrelated concepts, distorted hands, uncanny face, brand names.',
    'The final image must contain no written text of any kind.',
  ].join('\n');
}

export function buildVocabImageJobs(lessons: AdminLesson[]): VocabImageJob[] {
  const seen = new Map<string, VocabImageJob>();

  lessons
    .slice()
    .sort((a, b) => a.lessonOrder - b.lessonOrder)
    .forEach(lesson => {
      const externalDistractors = new Set(lesson.externalDistractorItemIds ?? []);
      (lesson.items ?? [])
        .filter(item => !externalDistractors.has(item.id))
        .forEach(item => {
          const uniqueKey = normalize(item.ku || item.id);
          const existing = seen.get(uniqueKey);
          if (existing) {
            existing.duplicateItemIds.push(item.id);
            return;
          }

          const category = classifyVocabItem(item);
          const base = {
            itemId: item.id,
            uniqueKey,
            unitId: lesson.unitId,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            ku: item.ku,
            tr: item.tr,
            en: item.en,
            emoji: item.emoji,
            partOfSpeech: item.partOfSpeech,
            meaningGroup: item.meaningGroup,
            visualAffordanceTags: item.visualAffordanceTags ?? [],
            category,
            duplicateItemIds: [],
          };
          seen.set(uniqueKey, {
            ...base,
            prompt: buildVocabImagePrompt(base),
          });
        });
    });

  return Array.from(seen.values());
}

export function qcPassed(qc: VocabImageQc): boolean {
  return qc.conceptCorrect && qc.styleConsistent && qc.noTextOrLogo && qc.mobileReadable && qc.characterOrPropOk;
}
