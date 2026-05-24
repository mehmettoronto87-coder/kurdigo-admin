// Müfredatın tüm tip tanımları — ana app'teki curriculumLessonTypes.ts ile senkronize

export type CurriculumLessonType =
  | 'vocabulary_lesson'
  | 'phrase_lesson'
  | 'grammar_lesson'
  | 'culture_lesson'
  | 'review_lesson'
  | 'story_lesson';

export type CurriculumPartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'adposition'
  | 'conjunction'
  | 'interjection'
  | 'expression'
  | 'sentence'
  | 'grammar';

export interface CurriculumMediaItem {
  id: string;
  ku: string;
  tr: string;
  en?: string;
  pronunciation?: string;
  emoji?: string;
  imageUrl?: string; // Firebase Storage URL veya placeholder
  partOfSpeech?: CurriculumPartOfSpeech;
  meaningNote?: string;
  meaningGroup?: string;
  exampleKu?: string;
  exampleTr?: string;
  exampleEn?: string;
  tags?: string[];
  introducedAtGlobalOrder?: number;
  canAppearAfterGlobalOrder?: number;
  confusableWithItemIds?: string[];
  avoidWithItemIds?: string[];
  visualAffordanceTags?: string[];
}

// === ADIM TİPLERİ ===

export interface LearnCardStep {
  type: 'learn_card';
  id: string;
  itemId: string;
  exampleKu?: string;
  exampleTr?: string;
  exampleEn?: string;
  audioText?: string;
  audioUrl?: string;
}

export interface ImageToWordStep {
  type: 'image_to_word';
  id: string;
  prompt: string;
  promptTr?: string;
  imageItemId: string;
  correctItemId: string;
  distractorItemIds: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface WordToImageStep {
  type: 'word_to_image';
  id: string;
  prompt: string;
  promptTr?: string;
  targetItemId: string;
  distractorItemIds: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface ListenToWordStep {
  type: 'listen_to_word';
  id: string;
  prompt: string;
  promptTr?: string;
  targetItemId: string;
  distractorItemIds: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface ListenToImageStep {
  type: 'listen_to_image';
  id: string;
  prompt: string;
  promptTr?: string;
  targetItemId: string;
  distractorItemIds: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface MatchPairsStep {
  type: 'match_pairs';
  id: string;
  prompt: string;
  promptTr?: string;
  pairs: Array<{ leftItemId: string; rightItemId: string }>;
  audioText?: string;
  audioUrl?: string;
}

export interface FillBlankStep {
  type: 'fill_blank';
  id: string;
  prompt: string;
  promptTr?: string;
  sentenceKu: string;
  sentenceTr?: string;
  sentenceEn?: string;
  blankItemId: string;
  distractorItemIds: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface WordOrderStep {
  type: 'word_order';
  id: string;
  prompt: string;
  promptTr?: string;
  correctOrderKu: string[];
  correctOrderTr?: string;
  correctOrderEn?: string;
  shuffledWords: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface SceneQuestionStep {
  type: 'scene_question';
  id: string;
  prompt: string;
  promptTr?: string;
  imageItemId: string;
  questionFamily?: string; // ask_object_from_image, ask_color_from_image, vs.
  correctAnswer: string;
  correctAnswerTr?: string;
  distractors: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface MiniDialogueChoiceStep {
  type: 'mini_dialogue_choice';
  id: string;
  prompt: string;
  promptTr?: string;
  lines: Array<{ speaker: 'baran' | 'berfin' | 'kurdo' | 'narrator'; text: string; audioUrl?: string }>;
  question: string;
  questionTr?: string;
  correctAnswer: string;
  distractors: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface OddOneOutStep {
  type: 'odd_one_out';
  id: string;
  prompt: string;
  promptTr?: string;
  itemIds: string[];
  oddItemId: string;
  explanation?: string;
  explanationTr?: string;
}

export interface TypingStep {
  type: 'typing';
  id: string;
  prompt: string;
  promptTr?: string;
  imageItemId?: string;
  targetItemId: string;
  acceptedAnswers: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface CultureSpotlightStep {
  type: 'culture_spotlight';
  id: string;
  title: string;
  titleTr?: string;
  imageUrl?: string;
  imageItemId?: string;
  audioText?: string;
  audioUrl?: string;
}

export interface PronunciationDrillStep {
  type: 'pronunciation_drill';
  id: string;
  prompt: string;
  promptTr?: string;
  targetItemId: string;
  syllables: string[];
  audioText?: string;
  audioUrl?: string;
}

export interface CharacterDialogueStep {
  type: 'character_dialogue';
  id: string;
  prompt?: string;
  promptTr?: string;
  lines: Array<{
    speaker: 'baran' | 'berfin' | 'kurdo' | 'narrator';
    text: string;
    textTr?: string;
    textEn?: string;
    audioUrl?: string;
  }>;
  followUpQuestion?: string;
  followUpQuestionTr?: string;
  followUpAnswer?: string;
  followUpDistractors?: string[];
}

export interface GrammarCardStep {
  type: 'grammar_card';
  id: string;
  title: string;
  titleTr?: string;
  headers: string[];
  rows: string[][];
  noteKu?: string;
  noteTr?: string;
  audioText?: string;
  audioUrl?: string;
}

export interface ReadingPassageStep {
  type: 'reading_passage';
  id: string;
  prompt: string;
  promptTr?: string;
  sentences: Array<{ ku: string; tr?: string; en?: string; audioUrl?: string }>;
  comprehensionQuestion?: string;
  comprehensionQuestionTr?: string;
  correctAnswer?: string;
  distractors?: string[];
}

export interface DictationStep {
  type: 'dictation';
  id: string;
  prompt: string;
  promptTr?: string;
  targetItemId?: string;
  targetText: string;
  acceptedAnswers: string[];
  hint?: string;
  audioText?: string;
  audioUrl?: string;
}

export type CurriculumLessonStep =
  | LearnCardStep
  | ImageToWordStep
  | WordToImageStep
  | ListenToWordStep
  | ListenToImageStep
  | MatchPairsStep
  | FillBlankStep
  | WordOrderStep
  | SceneQuestionStep
  | MiniDialogueChoiceStep
  | OddOneOutStep
  | TypingStep
  | CultureSpotlightStep
  | PronunciationDrillStep
  | CharacterDialogueStep
  | GrammarCardStep
  | ReadingPassageStep
  | DictationStep;

export interface CurriculumLesson {
  id: string;
  unitId: string;
  lessonId: string;
  order: number;
  title: string;
  titleTr?: string;
  titleEn?: string;
  lessonType: CurriculumLessonType;
  levelId?: string;
  unitCode?: string;
  lessonCode?: string;
  targetStepCount?: number;
  reviewItemIds?: string[];
  culturalFocusTags?: string[];
  stepCount: number;
  items: CurriculumMediaItem[];
  steps: CurriculumLessonStep[];
}

// Müfredat yapısı
export interface CurriculumUnit {
  id: string;
  levelId: string;
  order: number;
  title: string;
  description: string;
  icon: string;
}

export interface CurriculumLevel {
  id: string;
  order: number;
  title: string;
  description: string;
}
