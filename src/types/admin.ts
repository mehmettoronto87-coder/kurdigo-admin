import type { CurriculumMediaItem, CurriculumLessonStep, CurriculumLessonType } from './curriculum';

export type LessonStatus = 'draft' | 'approved' | 'production' | 'live';

export interface AdminLesson {
  id: string;           // Firestore doc ID
  unitId: string;
  lessonOrder: number;  // 1-5
  title: string;        // Kürtçe başlık
  titleTr?: string;
  titleEn?: string;
  lessonType: CurriculumLessonType;
  status: LessonStatus;
  items: CurriculumMediaItem[];
  steps: CurriculumLessonStep[];
  lockedStepIds: string[];
  reviewItemIds: string[];
  externalDistractorItemIds?: string[]; // önceki derslerden sadece yanlış şık havuzu; yeni kart/medya üretme
  culturalFocusTags: string[];
  reviewNotes?: string;
  createdAt: string;   // ISO string (Firestore Timestamp serileştirme)
  updatedAt: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  aiGeneratedAt?: string;
  changeHistory: ChangeRecord[];
  mediaStatus?: Record<string, ItemMediaStatus>;
}

export interface ChangeRecord {
  timestamp: string;
  userId: string;
  userEmail: string;
  action: 'created' | 'edited' | 'approved' | 'sent_to_production' | 'published' | 'step_added' | 'step_deleted' | 'step_edited' | 'step_locked' | 'step_unlocked';
  description: string;
}

// Ortam Kütüphanesi — Görsel varlıklar
export type AssetStatus = 'placeholder' | 'generating' | 'generated' | 'uploaded' | 'active';

export interface AffordanceAnswer {
  tagId: string;       // action:greeting
  category: string;    // action
  ku: string;          // silav dike
  tr: string;          // selamlıyor
  en?: string;         // greets
}

export interface SceneAsset {
  id: string;          // Firestore doc ID (= mediaId)
  mediaId: string;
  unitId: string;
  lessonId: string;
  primaryItemId: string;
  primaryKu: string;
  primaryTr: string;
  primaryEn?: string;
  emoji: string;
  storageUrl?: string;       // Firebase Storage — görsel URL
  storagePath?: string;
  audioUrl?: string;         // Firebase Storage — ses URL (kullanıcı kaydı)
  audioStoragePath?: string;
  audioStatus: AudioStatus;  // Ses dosyası durumu
  tags: string[];
  visualAffordanceTags: string[];
  affordanceAnswers: AffordanceAnswer[];
  questionFamilies: string[];
  reusableExerciseTypes: string[];
  usedInLessons: string[];
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
}

export type AudioStatus = 'missing' | 'recording_needed' | 'uploaded' | 'verified';

// Ders medya üretim durumu (görsel + ses, kelime bazında)
export type ImageGenStatus = 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
export type AudioItemStatus = 'missing' | 'uploading' | 'uploaded' | 'verified';

export interface ItemMediaStatus {
  imageUrl?: string;
  imageStoragePath?: string;
  imageStatus: ImageGenStatus;
  audioUrl?: string;
  audioStoragePath?: string;
  audioStatus: AudioItemStatus;
}

// Admin kullanıcı rolleri
export type AdminRole = 'owner' | 'editor';

export interface AdminUser {
  uid: string;
  email: string;
  displayName?: string;
  role: AdminRole;
  createdAt: string;
  lastLoginAt?: string;
}

// AI üretim isteği
export interface AIGenerationRequest {
  unitId: string;
  lessonOrder: number;
  lessonTitle?: string; // opsiyonel geçersiz kılma
  focusVocabulary?: string[]; // bu derste yeni öğretilecek kelimeler
  reviewItems?: ReviewItemContext[]; // önceki derslerden seçilen tekrar item'ları
  previousLessonsContext?: PreviousLessonContext[];
  additionalInstructions?: string;
}

export interface PreviousLessonContext {
  lessonId?: string;
  unitId?: string;
  unitOrder?: number;
  lessonOrder: number;
  globalLessonOrder?: number;
  title: string;
  itemIds: string[];
  itemsKu: string[];
  items?: CurriculumMediaItem[];
  mediaStatus?: Record<string, ItemMediaStatus>;
}

export interface ReviewItemContext {
  sourceLessonId: string;
  sourceUnitId?: string;
  sourceUnitOrder?: number;
  sourceLessonOrder: number;
  sourceGlobalLessonOrder?: number;
  item: CurriculumMediaItem;
  media?: ItemMediaStatus;
}

// UI durum tipleri
export type EditorTab = 'items' | 'steps' | 'preview';
export type SidebarSection = 'curriculum' | 'scene-library' | 'dashboard' | 'settings';

// Çakışma uyarısı
export interface ConflictWarning {
  type: 'duplicate_image' | 'overused_word' | 'missing_review' | 'invalid_distractor';
  stepId: string;
  message: string;
  messageTr: string;
  severity: 'error' | 'warning' | 'info';
}

// Frekans takip
export interface VocabFrequencyEntry {
  itemId: string;
  ku: string;
  tr: string;
  count: number;
  appearsInStepIds: string[];
  appearsInLessons: number[];
}
