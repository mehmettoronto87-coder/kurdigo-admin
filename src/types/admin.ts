import type { CurriculumMediaItem, CurriculumLessonStep, CurriculumLessonType } from './curriculum';

export type LessonStatus = 'draft' | 'approved' | 'production' | 'live';

export interface AdminLesson {
  id: string;
  unitId: string;
  lessonOrder: number;
  title: string;
  titleTr?: string;
  titleEn?: string;
  lessonType: CurriculumLessonType;
  status: LessonStatus;
  items: CurriculumMediaItem[];
  steps: CurriculumLessonStep[];
  lockedStepIds: string[];
  reviewItemIds: string[];
  externalDistractorItemIds?: string[];
  culturalFocusTags: string[];
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  aiGeneratedAt?: string;
  changeHistory: ChangeRecord[];
  mediaStatus?: Record<string, ItemMediaStatus>;
  stepMedia?: Record<string, StepMediaItem>;
}

export interface ChangeRecord {
  timestamp: string;
  userId: string;
  userEmail: string;
  action: 'created' | 'edited' | 'approved' | 'sent_to_production' | 'published' | 'step_added' | 'step_deleted' | 'step_edited' | 'step_locked' | 'step_unlocked';
  description: string;
}

export type AssetStatus = 'placeholder' | 'generating' | 'generated' | 'uploaded' | 'active';

export interface AffordanceAnswer {
  tagId: string;
  category: string;
  ku: string;
  tr: string;
  en?: string;
}

export interface SceneAsset {
  id: string;
  mediaId: string;
  unitId: string;
  lessonId: string;
  primaryItemId: string;
  primaryKu: string;
  primaryTr: string;
  primaryEn?: string;
  emoji: string;
  storageUrl?: string;
  storagePath?: string;
  audioUrl?: string;
  audioStoragePath?: string;
  audioStatus: AudioStatus;
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

export interface StepMediaItem {
  imageUrl?: string;
  imageStoragePath?: string;
  prompt?: string;
  generatedAt?: string;
}

export interface StepMediaItem {
  imageUrl?: string;
  imageStoragePath?: string;
  prompt?: string;
  generatedAt?: string;
}

// ─── Rol sistemi ────────────────────────────────────────────────────────────

export type AdminRole =
  | 'owner'           // Tam yetki (sen)
  | 'content_editor'  // AI üretim, müfredat
  | 'social_media'    // Sosyal medya paneli
  | 'advertising'     // Reklam paneli
  | 'accounting'      // Muhasebe paneli
  | 'support_agent';  // Destek talepleri

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner:          '👑 Sahip',
  content_editor: '✏️ İçerik Editörü',
  social_media:   '📱 Sosyal Medya',
  advertising:    '📣 Reklam',
  accounting:     '💰 Muhasebe',
  support_agent:  '🎧 Destek',
};

export const ROLE_PANELS: Record<AdminRole, string[]> = {
  owner:          ['dashboard', 'curriculum', 'ai-generator', 'scene-library', 'social-media', 'advertising', 'accounting', 'support', 'team', 'settings'],
  content_editor: ['dashboard', 'curriculum', 'ai-generator', 'scene-library', 'team'],
  social_media:   ['social-media', 'team'],
  advertising:    ['advertising', 'team'],
  accounting:     ['accounting', 'team'],
  support_agent:  ['support', 'team'],
};

export interface AdminUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

// ─── Destek Talepleri ────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';

export interface TicketReply {
  uid: string;
  displayName: string;
  text: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo?: string;
  assignedName?: string;
  replies: TicketReply[];
  createdAt: string;
  updatedAt: string;
}

// ─── İç Mesajlaşma ──────────────────────────────────────────────────────────

export interface AdminMessage {
  id: string;
  authorUid: string;
  authorName: string;
  authorRole: AdminRole;
  text: string;
  mentions: string[];
  createdAt: string;
}

// ─── Görev ──────────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'doing' | 'done';

export interface AdminTask {
  id: string;
  title: string;
  description?: string;
  assignedTo: string;
  assignedName: string;
  createdBy: string;
  createdByName: string;
  status: TaskStatus;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Mevcut tipler ──────────────────────────────────────────────────────────

export interface AIGenerationRequest {
  unitId: string;
  lessonOrder: number;
  lessonTitle?: string;
  focusVocabulary?: string[];
  reviewItems?: ReviewItemContext[];
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

export type EditorTab = 'items' | 'steps' | 'preview';
export type SidebarSection = 'curriculum' | 'scene-library' | 'dashboard' | 'settings';

export interface ConflictWarning {
  type: 'duplicate_image' | 'overused_word' | 'missing_review' | 'invalid_distractor';
  stepId: string;
  message: string;
  messageTr: string;
  severity: 'error' | 'warning' | 'info';
}

export interface VocabFrequencyEntry {
  itemId: string;
  ku: string;
  tr: string;
  count: number;
  appearsInStepIds: string[];
  appearsInLessons: number[];
}
