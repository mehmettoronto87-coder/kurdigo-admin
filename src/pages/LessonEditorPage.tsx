import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { subscribeLessons, saveLesson, updateLessonStatus, deleteLesson, deleteLessonStorageFiles } from '../lib/firestore';
import ProductionPanel from './ProductionPanel';
import { validateLesson } from '../lib/lessonAI';
import { UNITS } from '../lib/curriculumData';
import { useAuth } from '../hooks/useAuth';
import type { AdminLesson, LessonStatus, VocabFrequencyEntry, ConflictWarning } from '../types/admin';
import type { CurriculumLessonStep, CurriculumMediaItem } from '../types/curriculum';

// ─── ADIM TİPİ RENK VE İKON HARİTASI ───
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
  word_to_image: '📝→🖼️', listen_to_word: '🎧→📝', listen_to_image: '🎧→🖼️',
  match_pairs: '🔗', fill_blank: '___', word_order: '🔀',
  scene_question: '❓', mini_dialogue_choice: '💬❓', typing: '⌨️',
  dictation: '✍️', culture_spotlight: '🌍', pronunciation_drill: '🔊',
  character_dialogue: '🗣️', grammar_card: '📋',
};

const STATUS_CONFIG: Record<LessonStatus, { label: string; next: LessonStatus | null; btnLabel: string; btnClass: string; prev: LessonStatus | null }> = {
  draft:      { label: 'Taslak',    next: 'approved',   btnLabel: '✅ Onayla',         btnClass: 'btn-blue',    prev: null },
  approved:   { label: 'Onaylandı', next: 'production', btnLabel: '⚙️ Üretime Gönder', btnClass: 'btn-orange',  prev: 'draft' },
  production: { label: 'Üretimde',  next: 'live',       btnLabel: '🟢 Yayınla',        btnClass: 'btn-primary', prev: 'approved' },
  live:       { label: 'Yayında',   next: null,         btnLabel: '',                  btnClass: '',            prev: 'production' },
};

function unitOrderOf(unitId: string): number {
  return UNITS.find(u => u.id === unitId)?.order ?? 0;
}

function itemSlug(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c')
    .replace(/[êÊ]/g, 'e')
    .replace(/[îÎ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ûÛ]/g, 'u')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function adjacentUnitDistractorItems(lesson: AdminLesson): CurriculumMediaItem[] {
  const currentOrder = unitOrderOf(lesson.unitId);
  const existingByKu = new Map(lesson.items.map(item => [item.ku.trim().toLocaleLowerCase('tr-TR'), item]));
  const seen = new Set<string>();

  return UNITS
    .filter(unit => Math.abs((unit.order ?? 0) - currentOrder) <= 1)
    .flatMap(unit => unit.lessons.flatMap((lessonHint, lessonIndex) =>
      lessonHint.words.map((word, wordIndex): CurriculumMediaItem => {
        const ku = word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
        const existing = existingByKu.get(ku.trim().toLocaleLowerCase('tr-TR'));
        if (existing) return existing;
        return {
          id: `adj_${unit.id}_l${lessonIndex + 1}_${wordIndex + 1}_${itemSlug(word)}`,
          ku,
          tr: word,
          en: word,
          emoji: '🔀',
          partOfSpeech: 'noun',
          meaningGroup: `adjacent_unit_${unit.id}`,
          tags: [`word:${itemSlug(word)}`, 'distractor_only', `source:${unit.id}`],
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

function withStepAndExternalDistractors(
  lesson: AdminLesson,
  updatedStep: CurriculumLessonStep,
  extraItems: CurriculumMediaItem[] = [],
): AdminLesson {
  const existingIds = new Set(lesson.items.map(item => item.id));
  const itemsToAdd = extraItems.filter(item => !existingIds.has(item.id));
  return {
    ...lesson,
    steps: lesson.steps.map(s => s.id === updatedStep.id ? updatedStep : s),
    items: itemsToAdd.length ? [...lesson.items, ...itemsToAdd] : lesson.items,
    externalDistractorItemIds: itemsToAdd.length
      ? [...new Set([...(lesson.externalDistractorItemIds ?? []), ...itemsToAdd.map(item => item.id)])]
      : lesson.externalDistractorItemIds,
  };
}

// ─── SÜRÜKLENEBILIR ADIM KARTI ───
function SortableStep({
  step, lesson, isActive, isLocked, onSelect, onCopy, onDelete, onToggleLock,
}: {
  step: CurriculumLessonStep;
  lesson: AdminLesson;
  isActive: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: isLocked });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const color = STEP_COLORS[step.type] ?? '#666';
  const icon = STEP_ICONS[step.type] ?? '•';

  // Adım başlığı özeti
  function stepTitle(): string {
    if (step.type === 'learn_card') {
      const item = lesson.items.find(i => i.id === step.itemId);
      return item ? `${item.emoji ?? ''} ${item.ku} — ${item.tr}` : step.itemId;
    }
    if ('title' in step && step.title) return step.title;
    if ('prompt' in step && step.prompt) return step.prompt;
    if ('sentenceKu' in step) return step.sentenceKu;
    return step.type;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`step-card${isActive ? ' active' : ''}${isLocked ? ' locked' : ''}`}
      onClick={onSelect}
    >
      <span {...attributes} {...listeners} className="drag-handle" style={{ display: isLocked ? 'none' : undefined }}>⠿</span>
      {isLocked && <span style={{ fontSize: 14, color: 'var(--orange)' }}>🔒</span>}

      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color, flexShrink: 0, marginTop: 7,
      }} />

      <div className="step-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
            background: `${color}22`, color: color, flexShrink: 0,
          }}>
            {icon} {step.type}
          </span>
        </div>
        <div className="step-title" style={{ marginTop: 4 }}>{stepTitle()}</div>
      </div>

      <div className="step-actions">
        <button className="btn btn-icon btn-secondary btn-sm" title="Kopyala" onClick={e => { e.stopPropagation(); onCopy(); }}>📋</button>
        <button className="btn btn-icon btn-secondary btn-sm" title={isLocked ? 'Kilidi Aç' : 'Kilitle'}
          onClick={e => { e.stopPropagation(); onToggleLock(); }}>
          {isLocked ? '🔓' : '🔒'}
        </button>
        {!isLocked && (
          <button className="btn btn-icon btn-red btn-sm" title="Sil"
            onClick={e => { e.stopPropagation(); if (confirm('Bu adımı silmek istediğine emin misin?')) onDelete(); }}>
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ADIM EDİTÖRÜ PANELİ ───
function StepEditPanel({
  step, lesson, onSave, onClose,
}: {
  step: CurriculumLessonStep;
  lesson: AdminLesson;
  onSave: (updated: CurriculumLessonStep, extraItems?: CurriculumMediaItem[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CurriculumLessonStep>(step);

  useEffect(() => { setDraft(step); }, [step]);

  const setField = (key: string, val: unknown) => {
    setDraft(prev => ({ ...prev, [key]: val } as CurriculumLessonStep));
  };

  const itemOptions = lesson.items.map(i => (
    <option key={i.id} value={i.id}>{i.emoji} {i.ku} — {i.tr}</option>
  ));

  const adjacentDistractorOptions = adjacentUnitDistractorItems(lesson);
  const distractorOptionsById = new Map(adjacentDistractorOptions.map(item => [item.id, item]));

  const selectedExtraDistractorItems = (): CurriculumMediaItem[] => {
    if (!('distractorItemIds' in draft)) return [];
    const existingIds = new Set(lesson.items.map(item => item.id));
    return ((draft as { distractorItemIds?: string[] }).distractorItemIds ?? [])
      .map(id => distractorOptionsById.get(id))
      .filter((item): item is CurriculumMediaItem => item !== undefined && !existingIds.has(item.id));
  };

  const renderDistractorSelects = (ids: string[] = []) => {
    const selectedIds = ids.filter(Boolean);
    const selectedSet = new Set(selectedIds);
    const visibleOptions = [
      ...adjacentDistractorOptions,
      ...lesson.items.filter(item => selectedSet.has(item.id) && !distractorOptionsById.has(item.id)),
    ];
    const optionRows = visibleOptions.map(item => {
      const sourceTag = item.tags?.find(tag => tag.startsWith('source:'));
      const sourceUnit = sourceTag ? UNITS.find(unit => unit.id === sourceTag.replace('source:', '')) : undefined;
      const unitText = sourceUnit ? `U${sourceUnit.order}` : `U${unitOrderOf(lesson.unitId)}`;
      return (
        <option key={item.id} value={item.id}>
          {item.emoji ?? '🔀'} {item.ku} — {item.tr} ({unitText})
        </option>
      );
    });
    const updateAt = (index: number, value: string) => {
      const next = [...selectedIds];
      if (value) {
        next[index] = value;
      } else {
        next.splice(index, 1);
      }
      setField('distractorItemIds', [...new Set(next.filter(Boolean))]);
    };
    const addFirstAvailable = () => {
      const next = visibleOptions.find(item => !selectedSet.has(item.id));
      if (next) setField('distractorItemIds', [...selectedIds, next.id]);
    };

    return (
      <div className="form-group">
        <label className="form-label">Yanlış Seçenekler (önceki/mevcut/sonraki ünite)</label>
        <div style={{ display: 'grid', gap: 8 }}>
          {(selectedIds.length ? selectedIds : ['']).map((id, index) => (
            <div key={`${id || 'empty'}_${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <select value={id} onChange={e => updateAt(index, e.target.value)}>
                <option value="">Yanlış şık seç...</option>
                {optionRows}
              </select>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => updateAt(index, '')}>Sil</button>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" type="button" onClick={addFirstAvailable}>
            + Yanlış şık ekle
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          background: `${STEP_COLORS[step.type] ?? '#666'}22`,
          color: STEP_COLORS[step.type] ?? '#666',
          padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
        }}>
          {STEP_ICONS[step.type]} {step.type}
        </div>
        <div style={{ flex: 1, fontSize: 11, color: 'var(--text3)' }}>ID: {step.id}</div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Kapat</button>
      </div>

      {/* Ortak alanlar */}
      {'prompt' in draft && (
        <div className="form-group">
          <label className="form-label">Soru / Prompt (Kürtçe)</label>
          <input value={(draft as { prompt?: string }).prompt ?? ''} onChange={e => setField('prompt', e.target.value)} />
        </div>
      )}
      {'promptTr' in draft && (
        <div className="form-group">
          <label className="form-label">Soru Türkçe</label>
          <input value={(draft as { promptTr?: string }).promptTr ?? ''} onChange={e => setField('promptTr', e.target.value)} />
        </div>
      )}
      {'title' in draft && (
        <div className="form-group">
          <label className="form-label">Başlık (Kürtçe)</label>
          <input value={(draft as { title?: string }).title ?? ''} onChange={e => setField('title', e.target.value)} />
        </div>
      )}
      {'subtitle' in draft && (
        <div className="form-group">
          <label className="form-label">Alt Başlık</label>
          <input value={(draft as { subtitle?: string }).subtitle ?? ''} onChange={e => setField('subtitle', e.target.value)} />
        </div>
      )}

      {/* learn_card */}
      {draft.type === 'learn_card' && (
        <>
          <div className="form-group">
            <label className="form-label">Kelime</label>
            <select value={draft.itemId} onChange={e => setField('itemId', e.target.value)}>{itemOptions}</select>
          </div>
          <div className="form-group">
            <label className="form-label">Kürtçe Örnek Cümle</label>
            <input value={draft.exampleKu ?? ''} onChange={e => setField('exampleKu', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Türkçe Örnek</label>
            <input value={draft.exampleTr ?? ''} onChange={e => setField('exampleTr', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">İngilizce Örnek</label>
            <input value={draft.exampleEn ?? ''} onChange={e => setField('exampleEn', e.target.value)} />
          </div>
        </>
      )}

      {/* image_to_word / word_to_image */}
      {(draft.type === 'image_to_word' || draft.type === 'word_to_image') && (
        <>
          {'imageItemId' in draft && (
            <div className="form-group">
              <label className="form-label">Görselin Kelimesi</label>
              <select value={(draft as { imageItemId?: string }).imageItemId ?? ''} onChange={e => setField('imageItemId', e.target.value)}>{itemOptions}</select>
            </div>
          )}
          {'correctItemId' in draft && (
            <div className="form-group">
              <label className="form-label">Doğru Cevap</label>
              <select value={(draft as { correctItemId?: string }).correctItemId ?? ''} onChange={e => setField('correctItemId', e.target.value)}>{itemOptions}</select>
            </div>
          )}
          {'targetItemId' in draft && draft.type === 'word_to_image' && (
            <div className="form-group">
              <label className="form-label">Hedef Kelime</label>
              <select value={draft.targetItemId} onChange={e => setField('targetItemId', e.target.value)}>{itemOptions}</select>
            </div>
          )}
          {'distractorItemIds' in draft && renderDistractorSelects((draft as { distractorItemIds?: string[] }).distractorItemIds ?? [])}
        </>
      )}

      {/* fill_blank */}
      {draft.type === 'fill_blank' && (
        <>
          <div className="form-group">
            <label className="form-label">Kürtçe Cümle (boşluk için ___ kullan)</label>
            <textarea value={draft.sentenceKu} onChange={e => setField('sentenceKu', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Türkçe Cümle</label>
            <input value={draft.sentenceTr ?? ''} onChange={e => setField('sentenceTr', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Boşluğa Giren Kelime</label>
            <select value={draft.blankItemId} onChange={e => setField('blankItemId', e.target.value)}>{itemOptions}</select>
          </div>
          {renderDistractorSelects(draft.distractorItemIds)}
        </>
      )}

      {/* word_order */}
      {draft.type === 'word_order' && (
        <>
          <div className="form-group">
            <label className="form-label">Doğru Sıralama (Kürtçe kelimeler, virgülle)</label>
            <input
              value={draft.correctOrderKu.join(', ')}
              onChange={e => setField('correctOrderKu', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Türkçe Çeviri</label>
            <input value={draft.correctOrderTr ?? ''} onChange={e => setField('correctOrderTr', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Karışık Kelimeler (virgülle)</label>
            <input
              value={draft.shuffledWords.join(', ')}
              onChange={e => setField('shuffledWords', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>
        </>
      )}

      {/* dictation */}
      {draft.type === 'dictation' && (
        <>
          <div className="form-group">
            <label className="form-label">Yazılacak Kürtçe Metin</label>
            <input value={draft.targetText} onChange={e => setField('targetText', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Kabul Edilen Yanıtlar (virgülle)</label>
            <input
              value={draft.acceptedAnswers.join(', ')}
              onChange={e => setField('acceptedAnswers', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">İpucu (opsiyonel)</label>
            <input value={draft.hint ?? ''} onChange={e => setField('hint', e.target.value)} />
          </div>
        </>
      )}

      {/* typing */}
      {draft.type === 'typing' && (
        <>
          <div className="form-group">
            <label className="form-label">Hedef Kelime</label>
            <select value={draft.targetItemId} onChange={e => setField('targetItemId', e.target.value)}>{itemOptions}</select>
          </div>
          <div className="form-group">
            <label className="form-label">Kabul Edilen Yanıtlar (virgülle)</label>
            <input
              value={draft.acceptedAnswers.join(', ')}
              onChange={e => setField('acceptedAnswers', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>
        </>
      )}

      {/* character_dialogue */}
      {draft.type === 'character_dialogue' && (
        <div className="form-group">
          <label className="form-label">Diyalog Satırları (JSON)</label>
          <textarea
            style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12 }}
            value={JSON.stringify(draft.lines, null, 2)}
            onChange={e => {
              try { setField('lines', JSON.parse(e.target.value)); } catch { /* geçersiz JSON */ }
            }}
          />
        </div>
      )}

      {/* Ses metni */}
      {'audioText' in draft && (
        <div className="form-group">
          <label className="form-label">TTS Metni (Kürtçe seslendirilecek)</label>
          <input value={(draft as { audioText?: string }).audioText ?? ''} onChange={e => setField('audioText', e.target.value)} />
        </div>
      )}

      {/* Emoji */}
      {'emoji' in draft && (
        <div className="form-group">
          <label className="form-label">Emoji</label>
          <input style={{ width: 80 }} value={(draft as { emoji?: string }).emoji ?? ''} onChange={e => setField('emoji', e.target.value)} />
        </div>
      )}

      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onSave(draft, selectedExtraDistractorItems())}>
        💾 Kaydet
      </button>
    </div>
  );
}

// ─── KELİME KARTLARI EDİTÖRÜ ───
function ItemsEditor({ lesson, onUpdate }: { lesson: AdminLesson; onUpdate: (items: CurriculumMediaItem[]) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [items, setItems] = useState<CurriculumMediaItem[]>(lesson.items);

  useEffect(() => { setItems(lesson.items); }, [lesson.items]);

  const updateItem = (id: string, field: string, val: string) => {
    const updated = items.map(i => i.id === id ? { ...i, [field]: val } : i);
    setItems(updated);
    onUpdate(updated);
  };

  const addItem = () => {
    const newItem: CurriculumMediaItem = {
      id: `item_${Date.now()}`,
      ku: '',
      tr: '',
      en: '',
      emoji: '❓',
    };
    const updated = [...items, newItem];
    setItems(updated);
    onUpdate(updated);
    setEditingId(newItem.id);
  };

  const deleteItem = (id: string) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    onUpdate(updated);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Kelime Kartları ({items.length})</div>
        <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Kelime Ekle</button>
      </div>
      {items.map(item => (
        <div key={item.id} style={{
          background: 'var(--bg4)', borderRadius: 8, marginBottom: 6,
          border: '1px solid var(--border)',
        }}>
          <div
            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            onClick={() => setEditingId(editingId === item.id ? null : item.id)}
          >
            <span style={{ fontSize: 20 }}>{item.emoji ?? '❓'}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600 }}>{item.ku || '(boş)'}</span>
              <span style={{ color: 'var(--text2)', margin: '0 6px' }}>→</span>
              <span style={{ color: 'var(--text2)' }}>{item.tr}</span>
              {item.en && <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>/ {item.en}</span>}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{item.partOfSpeech ?? ''}</span>
            <button className="btn btn-icon btn-red btn-sm" onClick={e => { e.stopPropagation(); deleteItem(item.id); }}>🗑️</button>
          </div>
          {editingId === item.id && (
            <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label">ID</label>
                <input value={item.id} onChange={e => updateItem(item.id, 'id', e.target.value)} style={{ fontSize: 12 }} />
              </div>
              <div>
                <label className="form-label">Emoji</label>
                <input value={item.emoji ?? ''} onChange={e => updateItem(item.id, 'emoji', e.target.value)} style={{ width: 80 }} />
              </div>
              <div>
                <label className="form-label">Kürtçe (ku)</label>
                <input value={item.ku} onChange={e => updateItem(item.id, 'ku', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Türkçe (tr)</label>
                <input value={item.tr} onChange={e => updateItem(item.id, 'tr', e.target.value)} />
              </div>
              <div>
                <label className="form-label">İngilizce (en)</label>
                <input value={item.en ?? ''} onChange={e => updateItem(item.id, 'en', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Telaffuz</label>
                <input value={item.pronunciation ?? ''} onChange={e => updateItem(item.id, 'pronunciation', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Kürtçe Örnek</label>
                <input value={item.exampleKu ?? ''} onChange={e => updateItem(item.id, 'exampleKu', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Türkçe Örnek</label>
                <input value={item.exampleTr ?? ''} onChange={e => updateItem(item.id, 'exampleTr', e.target.value)} />
              </div>
              <div>
                <label className="form-label">İngilizce Örnek</label>
                <input value={item.exampleEn ?? ''} onChange={e => updateItem(item.id, 'exampleEn', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Kelime Türü</label>
                <select value={item.partOfSpeech ?? ''} onChange={e => updateItem(item.id, 'partOfSpeech', e.target.value)}>
                  <option value="">—</option>
                  {['noun','verb','adjective','adverb','pronoun','expression','sentence','grammar'].map(p =>
                    <option key={p} value={p}>{p}</option>
                  )}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Visual Affordance Tags (virgülle: object:ball, color:red)</label>
                <input
                  value={item.visualAffordanceTags?.join(', ') ?? ''}
                  onChange={e => updateItem(item.id, 'visualAffordanceTags', e.target.value)}
                  placeholder="object:ball, color:red, count:1"
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Karıştırılabilir Kelimeler (ID, virgülle)</label>
                <input
                  value={item.confusableWithItemIds?.join(', ') ?? ''}
                  onChange={e => updateItem(item.id, 'confusableWithItemIds', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── ANA EDITOR SAYFASI ───
export default function LessonEditorPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, adminUser } = useAuth();
  const unit = UNITS.find(u => u.id === unitId);
  // AI Generator'dan gelen ders — Firestore'u beklemeden anında kullan
  const preloadedLesson = (location.state as { preloadedLesson?: AdminLesson } | null)?.preloadedLesson;

  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  const [activeLessonOrder, setActiveLessonOrder] = useState<number>(
    parseInt(searchParams.get('lessonOrder') ?? '1'),
  );
  const [expandedLessons, setExpandedLessons] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'grid' | 'steps' | 'items' | 'history' | 'validate' | 'production'>(
    (searchParams.get('tab') as 'grid' | 'steps' | 'items' | 'history' | 'validate' | 'production') ?? 'grid'
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [_copied, setCopied] = useState<string | null>(null); void _copied;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!unitId) return;
    setLessonsLoaded(false);
    const unsub = subscribeLessons(unitId, (data) => {
      setLessons(data);
      setLessonsLoaded(true);
      // Auto-collapse locked lessons (production / live) so they can't be accidentally edited
      setExpandedLessons(prev => {
        const next = new Set(prev);
        for (const l of data) {
          if (l.status === 'production' || l.status === 'live') next.delete(l.lessonOrder);
        }
        return next;
      });
    });
    return unsub;
  }, [unitId]);

  // URL'deki tab/lessonOrder parametreleri değişince state'i güncelle
  useEffect(() => {
    const tab = searchParams.get('tab') as typeof activeTab | null;
    const order = parseInt(searchParams.get('lessonOrder') ?? '0');
    if (tab) setActiveTab(tab);
    if (order > 0) setActiveLessonOrder(order);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const activeLesson =
    lessons.find(l => l.lessonOrder === activeLessonOrder) ??
    (preloadedLesson?.lessonOrder === activeLessonOrder ? preloadedLesson : null);
  const activeStep = activeLesson?.steps.find(s => s.id === activeStepId) ?? null;

  // Kelime frekans analizi (tüm ünite)
  const freqMap = new Map<string, VocabFrequencyEntry>();
  lessons.forEach(lesson => {
    lesson.items.forEach(item => {
      const entry = freqMap.get(item.id) ?? {
        itemId: item.id, ku: item.ku, tr: item.tr, count: 0,
        appearsInStepIds: [], appearsInLessons: [],
      };
      if (!entry.appearsInLessons.includes(lesson.lessonOrder)) {
        entry.appearsInLessons.push(lesson.lessonOrder);
      }
      freqMap.set(item.id, entry);
    });
    lesson.steps.forEach(step => {
      const ids: string[] = [];
      if ('itemId' in step) ids.push(step.itemId as string);
      if ('correctItemId' in step) ids.push((step as { correctItemId: string }).correctItemId);
      if ('targetItemId' in step) ids.push((step as { targetItemId: string }).targetItemId);
      if ('blankItemId' in step) ids.push((step as { blankItemId: string }).blankItemId);
      ids.forEach(id => {
        const entry = freqMap.get(id);
        if (entry) {
          entry.count++;
          entry.appearsInStepIds.push(step.id);
        }
      });
    });
  });

  // Çakışma kontrolü
  const conflicts: ConflictWarning[] = [];
  if (activeLesson) {
    const imageUsage = new Map<string, number>();
    activeLesson.steps.forEach(step => {
      const imgId = 'imageItemId' in step ? (step as { imageItemId?: string }).imageItemId : undefined;
      if (imgId) imageUsage.set(imgId, (imageUsage.get(imgId) ?? 0) + 1);
    });
    imageUsage.forEach((count, imgId) => {
      if (count > 3) {
        conflicts.push({
          type: 'duplicate_image', stepId: imgId,
          message: `"${imgId}" görseli bu derste ${count} kez kullanılıyor.`,
          messageTr: `Görsel çok sık tekrarlanıyor (${count}×). Çeşitlilik için diğer görselleri dene.`,
          severity: 'warning',
        });
      }
    });
  }

  const handleSaveLesson = async (lesson: AdminLesson) => {
    setSaving(true);
    try {
      await saveLesson({
        ...lesson,
        changeHistory: [...(lesson.changeHistory ?? []), {
          timestamp: new Date().toISOString(),
          userId: user?.uid ?? '',
          userEmail: adminUser?.email ?? '',
          action: 'edited',
          description: 'Elle düzenlendi',
        }],
      });
      showToast('✅ Kaydedildi');
    } catch {
      showToast('❌ Kaydetme hatası', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (lesson: AdminLesson) => {
    const cfg = STATUS_CONFIG[lesson.status];
    if (!cfg.next) return;
    setSaving(true);
    try {
      await updateLessonStatus(lesson.id, cfg.next, user?.uid ?? '', adminUser?.email ?? '');
      showToast(`${cfg.btnLabel} — başarılı`);
    } catch {
      showToast('❌ Durum güncelleme hatası', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusRevert = async (lesson: AdminLesson) => {
    const cfg = STATUS_CONFIG[lesson.status];
    if (!cfg.prev) return;
    setSaving(true);
    try {
      await updateLessonStatus(lesson.id, cfg.prev, user?.uid ?? '', adminUser?.email ?? '');
      showToast(`↩️ Durum geri alındı: ${STATUS_CONFIG[cfg.prev].label}`);
    } catch {
      showToast('❌ Durum güncelleme hatası', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLesson = async (lesson: AdminLesson) => {
    const confirmed = confirm(
      `"Ders ${lesson.lessonOrder}: ${lesson.title}" dersine ait TÜM içerik silinecek:\n` +
      `• Firestore kayıtları (adminLessons + publicLessons)\n` +
      `• Firebase Storage'daki tüm görseller\n` +
      `• Firebase Storage'daki tüm ses dosyaları\n\n` +
      `Bu işlem GERİ ALINAMAZ. Devam etmek istiyor musun?`
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteLessonStorageFiles(lesson.id);
      await deleteLesson(lesson.id);
      showToast('🗑️ Ders içeriği silindi');
      setActiveLessonOrder(0);
    } catch {
      showToast('❌ Silme hatası', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent, lesson: AdminLesson) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lesson.steps.findIndex(s => s.id === active.id);
    const newIndex = lesson.steps.findIndex(s => s.id === over.id);
    const newSteps = arrayMove(lesson.steps, oldIndex, newIndex);
    const updated = { ...lesson, steps: newSteps };
    handleSaveLesson(updated);
  };

  const handleStepSave = (lesson: AdminLesson, updated: CurriculumLessonStep, extraItems: CurriculumMediaItem[] = []) => {
    handleSaveLesson(withStepAndExternalDistractors(lesson, updated, extraItems));
    setActiveStepId(null);
  };

  const handleCopyStep = (lesson: AdminLesson, step: CurriculumLessonStep) => {
    const copy = { ...step, id: `${step.id}_copy_${Date.now()}` };
    const idx = lesson.steps.findIndex(s => s.id === step.id);
    const newSteps = [...lesson.steps.slice(0, idx + 1), copy, ...lesson.steps.slice(idx + 1)];
    handleSaveLesson({ ...lesson, steps: newSteps });
    setCopied(copy.id);
    setTimeout(() => setCopied(null), 1500);
    showToast('📋 Adım kopyalandı');
  };

  const handleDeleteStep = (lesson: AdminLesson, stepId: string) => {
    handleSaveLesson({ ...lesson, steps: lesson.steps.filter(s => s.id !== stepId) });
    if (activeStepId === stepId) setActiveStepId(null);
  };

  const handleToggleLock = (lesson: AdminLesson, stepId: string) => {
    const locked = lesson.lockedStepIds.includes(stepId)
      ? lesson.lockedStepIds.filter(id => id !== stepId)
      : [...lesson.lockedStepIds, stepId];
    handleSaveLesson({ ...lesson, lockedStepIds: locked });
  };

  if (!unit) return <div className="loading">Ünite bulunamadı</div>;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* SOL PANELİ: Tüm ünite görünümü */}
      <div style={{ width: 380, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Ünite başlığı */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button style={{ color: 'var(--text2)', fontSize: 18 }} onClick={() => navigate('/curriculum')}>‹</button>
            <span style={{ fontSize: 22 }}>{unit.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{unit.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{unit.city} · 5 Ders</div>
            </div>
          </div>

          {/* Kelime frekans özeti */}
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Array.from(freqMap.values()).slice(0, 12).map(f => (
              <span key={f.itemId} style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 10,
                background: f.count > 8 ? 'var(--green-dim)' : 'var(--bg4)',
                color: f.count > 8 ? 'var(--green)' : 'var(--text3)',
                cursor: 'default',
              }} title={`${f.ku}: ${f.count} kez, ders ${f.appearsInLessons.join(', ')}`}>
                {f.ku} ×{f.count}
              </span>
            ))}
          </div>
        </div>

        {/* Ders listesi — hepsi görünür, sürüklenebilir adımlarla */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {[1, 2, 3, 4, 5].map(order => {
            const lesson = lessons.find(l => l.lessonOrder === order);
            const isExpanded = expandedLessons.has(order);
            const isActive = activeLessonOrder === order;
            const cfg = lesson ? STATUS_CONFIG[lesson.status] : null;
            const isLocked = lesson?.status === 'production' || lesson?.status === 'live';

            return (
              <div key={order} style={{
                borderBottom: '1px solid var(--border)',
                background: isActive ? 'var(--blue-dim)' : undefined,
              }}>
                {/* Ders başlığı satırı */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px', cursor: 'pointer',
                  }}
                  onClick={() => {
                    setActiveLessonOrder(order);
                    if (!isLocked) {
                      setExpandedLessons(prev => {
                        const next = new Set(prev);
                        next.has(order) ? next.delete(order) : next.add(order);
                        return next;
                      });
                    }
                    setActiveStepId(null);
                  }}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: isActive ? 'var(--blue)' : 'var(--bg4)',
                    color: isActive ? '#000' : 'var(--text2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>{order}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lesson?.title ?? `Ders ${order} — henüz yok`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {lesson ? `${lesson.steps.length} adım` : 'Boş'}
                    </div>
                  </div>
                  {lesson && (
                    <span className={`badge ${cfg?.btnClass ?? ''}`} style={{ fontSize: 9 }}>
                      {lesson.status}
                    </span>
                  )}
                  {isLocked
                    ? <span title="Kilitli — production/live">🔒</span>
                    : <span style={{ color: 'var(--text3)' }}>{isExpanded ? '▾' : '›'}</span>
                  }
                </div>

                {/* Adımlar */}
                {isExpanded && lesson && (
                  <div style={{ padding: '0 8px 8px' }}>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={e => handleDragEnd(e, lesson)}
                    >
                      <SortableContext items={lesson.steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        {lesson.steps.map(step => (
                          <SortableStep
                            key={step.id}
                            step={step}
                            lesson={lesson}
                            isActive={activeStepId === step.id}
                            isLocked={lesson.lockedStepIds.includes(step.id)}
                            onSelect={() => {
                              setActiveLessonOrder(order);
                              setActiveStepId(activeStepId === step.id ? null : step.id);
                            }}
                            onCopy={() => handleCopyStep(lesson, step)}
                            onDelete={() => handleDeleteStep(lesson, step.id)}
                            onToggleLock={() => handleToggleLock(lesson, step.id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                    {!lesson.steps.length && (
                      <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text3)', fontSize: 12 }}>
                        Henüz adım yok
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SAĞ PANELİ: Editör */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeLesson ? (
          <>
            {/* Kilitli ders banner */}
            {(activeLesson.status === 'production' || activeLesson.status === 'live') && (
              <div style={{
                background: '#7c4400', color: '#ffe6b0',
                padding: '7px 20px', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>🔒 Bu ders kilitli ({activeLesson.status === 'live' ? 'Yayında' : 'Üretimde'}) — düzenleme devre dışı.</span>
                <button
                  className="btn btn-sm"
                  style={{ background: '#ffe6b0', color: '#7c4400', marginLeft: 8, fontWeight: 700 }}
                  disabled={saving}
                  onClick={() => {
                    const prev = STATUS_CONFIG[activeLesson.status].prev!;
                    const prevLabel = STATUS_CONFIG[prev].label;
                    if (confirm(`Dersin durumu "${STATUS_CONFIG[activeLesson.status].label}" → "${prevLabel}" olarak geri alınacak. Düzenleme kilidi açılacak. Devam edilsin mi?`)) {
                      handleStatusRevert(activeLesson);
                    }
                  }}
                >
                  ↩️ Durumu Geri Al
                </button>
              </div>
            )}
            {/* Ders başlığı + aksiyonlar */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Ders {activeLesson.lessonOrder}: {activeLesson.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {activeLesson.items.length} kelime · {activeLesson.steps.length} adım
                </div>
              </div>

              <span className={`badge badge-${activeLesson.status}`}>
                {STATUS_CONFIG[activeLesson.status].label}
              </span>

              {conflicts.length > 0 && (
                <span className="conflict-pill">⚠️ {conflicts.length} uyarı</span>
              )}

              {STATUS_CONFIG[activeLesson.status].next && (
                <button
                  className={`btn ${STATUS_CONFIG[activeLesson.status].btnClass}`}
                  disabled={saving}
                  onClick={() => handleStatusChange(activeLesson)}
                >
                  {STATUS_CONFIG[activeLesson.status].btnLabel}
                </button>
              )}

              {(() => {
                const lessonLocked = activeLesson.status === 'production' || activeLesson.status === 'live';
                return (<>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={saving || lessonLocked}
                    title={lessonLocked ? 'Kilitli ders — kaydetme devre dışı' : undefined}
                    onClick={() => handleSaveLesson(activeLesson)}
                  >
                    {saving ? '⏳' : '💾'} Kaydet
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={lessonLocked}
                    title={lessonLocked ? 'Kilitli ders — AI üretimi devre dışı' : undefined}
                    onClick={() => {
                      if (confirm('AI Üretici\'ye gidince bu sayfadaki kaydedilmemiş değişiklikler kaybolabilir. Devam et?')) {
                        navigate(`/ai-generator?unitId=${unitId}&lessonOrder=${activeLesson.lessonOrder}`);
                      }
                    }}
                  >
                    🤖 AI Yeniden Üret
                  </button>

                  <button
                    className="btn btn-sm"
                    style={{ background: 'var(--red)', color: '#fff', opacity: (saving || lessonLocked) ? 0.4 : 1 }}
                    disabled={saving || lessonLocked}
                    title={lessonLocked ? 'Kilitli ders — silme devre dışı' : undefined}
                    onClick={() => handleDeleteLesson(activeLesson)}
                  >
                    🗑️ İçeriği Sil
                  </button>
                </>);
              })()}
            </div>

            {/* Sekmeler */}
            <div className="tabs" style={{ padding: '0 20px', margin: 0 }}>
              {[
                { key: 'grid',       label: `🗂️ 60 Kart` },
                { key: 'steps',      label: `📋 Adım Listesi (${activeLesson.steps.length})` },
                { key: 'items',      label: `📖 Kelimeler (${activeLesson.items.length})` },
                { key: 'production', label: '🎬 Üretim', highlight: ['approved','production','live'].includes(activeLesson.status) },
                { key: 'validate',   label: '🔍 Doğrulama' },
                { key: 'history',    label: '📜 Geçmiş' },
              ].map(tab => (
                <button
                  key={tab.key}
                  className={`tab${activeTab === tab.key ? ' active' : ''}`}
                  style={(tab as { highlight?: boolean }).highlight && activeTab !== tab.key
                    ? { color: 'var(--orange)' }
                    : undefined}
                  onClick={() => { setActiveTab(tab.key as typeof activeTab); setActiveStepId(null); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              {/* Sekme içeriği */}
              <div style={{ flex: 1, overflowY: 'auto', padding: activeTab === 'grid' ? '16px' : '20px' }}>
                {activeTab === 'grid' && (
                  <CardGridView
                    lesson={activeLesson}
                    onSelectStep={id => {
                      setActiveStepId(id);
                      setActiveTab('steps');
                    }}
                    onSaveLesson={handleSaveLesson}
                  />
                )}

                {activeTab === 'steps' && !activeStep && (
                  <div style={{ color: 'var(--text2)', fontSize: 13 }}>
                    Sol panelden veya 🗂️ 60 Kart sekmesinden bir adıma tıklayın düzenlemek için.
                    {conflicts.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        {conflicts.map((c, i) => (
                          <div key={i} className="validation-box validation-warning">{c.messageTr}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'steps' && activeStep && (
                  <StepEditPanel
                    step={activeStep}
                    lesson={activeLesson}
                    onSave={(updated, extraItems) => handleStepSave(activeLesson, updated, extraItems)}
                    onClose={() => setActiveStepId(null)}
                  />
                )}

                {activeTab === 'items' && (
                  <ItemsEditor
                    lesson={activeLesson}
                    onUpdate={items => handleSaveLesson({ ...activeLesson, items })}
                  />
                )}

                {activeTab === 'validate' && (
                  <ValidationPanel lesson={activeLesson} />
                )}

                {activeTab === 'production' && (
                  <ProductionPanel
                    lesson={activeLesson}
                    onSave={handleSaveLesson}
                  />
                )}

                {activeTab === 'history' && (
                  <HistoryPanel lesson={activeLesson} />
                )}
              </div>
            </div>
          </>
        ) : !lessonsLoaded ? (
          <div className="empty-state" style={{ margin: 'auto' }}>
            <div className="empty-icon">⏳</div>
            <div style={{ fontSize: 14 }}>Dersler yükleniyor...</div>
          </div>
        ) : (
          <div className="empty-state" style={{ margin: 'auto' }}>
            <div className="empty-icon">📝</div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Bu ders henüz üretilmedi</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              Ders {activeLessonOrder} için AI üretici'ye git
            </div>
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/ai-generator?unitId=${unitId}&lessonOrder=${activeLessonOrder}`)}
            >
              🤖 AI ile Ders Üret
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 60 KART IZGARA GÖRÜNÜMÜ ───
function CardGridView({
  lesson, onSelectStep, onSaveLesson,
}: {
  lesson: AdminLesson;
  onSelectStep: (stepId: string) => void;
  onSaveLesson: (lesson: AdminLesson) => void;
}) {
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  const PARTS = [
    { label: 'Bölüm 1 — Öğren (Can Yok, 20 adım)', color: 'var(--blue)', steps: lesson.steps.slice(0, 20), offset: 0 },
    { label: 'Bölüm 2 — Sınav (Can Var, 20 soru)', color: 'var(--green)', steps: lesson.steps.slice(20, 40), offset: 20 },
    { label: 'Bölüm 3 — Tekrar (Can Var, 20 soru)', color: 'var(--orange)', steps: lesson.steps.slice(40, 60), offset: 40 },
  ];

  function cardContent(step: CurriculumLessonStep): string {
    if (step.type === 'learn_card') {
      const item = lesson.items.find(i => i.id === (step as { itemId: string }).itemId);
      return item ? `${item.emoji ?? ''} ${item.ku} — ${item.tr}` : (step as { itemId: string }).itemId;
    }
    if ('prompt' in step && (step as { prompt?: string }).prompt) return (step as { prompt?: string }).prompt!.slice(0, 50);
    if ('sentenceKu' in step) return (step as { sentenceKu: string }).sentenceKu.slice(0, 50);
    if ('targetText' in step) return (step as { targetText: string }).targetText.slice(0, 50);
    if ('title' in step && (step as { title?: string }).title) return (step as { title?: string }).title!.slice(0, 50);
    if ('correctOrderKu' in step) return (step as { correctOrderKu: string[] }).correctOrderKu.join(' ').slice(0, 50);
    return step.type;
  }

  const editingStep = editingStepId ? lesson.steps.find(s => s.id === editingStepId) ?? null : null;

  return (
    <div>
      {/* Hızlı istatistik */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {PARTS.map(p => (
          <div key={p.label} style={{
            padding: '6px 14px', borderRadius: 8,
            background: `${p.color}18`, border: `1px solid ${p.color}44`,
            fontSize: 11, color: p.color, fontWeight: 600,
          }}>
            {p.label.split('—')[0].trim()}: {p.steps.length} / 20
          </div>
        ))}
        <div style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--bg4)', fontSize: 11, color: 'var(--text2)' }}>
          Toplam: {lesson.steps.length} adım
        </div>
      </div>

      {/* Inline editör (seçili kart) */}
      {editingStep && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--bg2)', border: '1px solid var(--blue)',
          borderRadius: 10, marginBottom: 16,
        }}>
          <StepEditPanel
            step={editingStep}
            lesson={lesson}
            onSave={(updated, extraItems) => {
              onSaveLesson(withStepAndExternalDistractors(lesson, updated, extraItems));
              setEditingStepId(null);
            }}
            onClose={() => setEditingStepId(null)}
          />
        </div>
      )}

      {/* 3 bölüm grid */}
      {PARTS.map(part => (
        <div key={part.label} style={{ marginBottom: 24 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 10,
          }}>
            <div style={{ width: 3, height: 18, background: part.color, borderRadius: 2 }} />
            <div style={{ fontWeight: 700, fontSize: 13, color: part.color }}>{part.label}</div>
            {part.steps.length < 20 && (
              <span style={{ fontSize: 11, color: 'var(--orange)', background: 'var(--orange-dim)', padding: '2px 8px', borderRadius: 6 }}>
                ⚠️ Eksik: {20 - part.steps.length} adım
              </span>
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 8,
          }}>
            {part.steps.map((step, si) => {
              const globalIdx = part.offset + si + 1;
              const color = STEP_COLORS[step.type] ?? '#666';
              const icon = STEP_ICONS[step.type] ?? '•';
              const isLocked = lesson.lockedStepIds.includes(step.id);
              const isEditing = editingStepId === step.id;
              const content = cardContent(step);

              return (
                <div
                  key={step.id}
                  style={{
                    background: isEditing ? 'var(--blue-dim)' : 'var(--bg4)',
                    border: `1px solid ${isEditing ? 'var(--blue)' : color + '44'}`,
                    borderRadius: 8, padding: '8px 10px',
                    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                    position: 'relative',
                  }}
                  onClick={() => setEditingStepId(isEditing ? null : step.id)}
                >
                  {/* Numara + tip */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: 'var(--text3)',
                      minWidth: 18, background: 'var(--bg)', borderRadius: 4,
                      padding: '1px 4px', textAlign: 'center',
                    }}>
                      {globalIdx}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 4,
                      background: `${color}22`, color, fontWeight: 700,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110,
                    }}>
                      {icon} {step.type}
                    </span>
                    {isLocked && <span style={{ fontSize: 10, marginLeft: 'auto' }}>🔒</span>}
                  </div>

                  {/* İçerik */}
                  <div style={{
                    fontSize: 11, color: 'var(--text)',
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    lineHeight: 1.4,
                  }}>
                    {content}
                  </div>

                  {/* Hızlı aksiyonlar */}
                  <div style={{
                    position: 'absolute', top: 4, right: 4,
                    display: 'flex', gap: 2,
                    opacity: 0, transition: 'opacity 0.15s',
                  }}
                    className="card-actions"
                  >
                    <button
                      className="btn btn-icon btn-secondary"
                      style={{ padding: '2px 5px', fontSize: 10 }}
                      title="Tam editörde aç"
                      onClick={e => { e.stopPropagation(); onSelectStep(step.id); }}
                    >⤢</button>
                  </div>
                </div>
              );
            })}

            {/* Boş slot göstergesi */}
            {Array.from({ length: Math.max(0, 20 - part.steps.length) }, (_, i) => (
              <div key={`empty-${i}`} style={{
                border: '1px dashed var(--border)', borderRadius: 8,
                padding: '8px 10px', opacity: 0.4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text3)', fontSize: 11, minHeight: 56,
              }}>
                {part.offset + part.steps.length + i + 1}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ValidationPanel({ lesson }: { lesson: AdminLesson }) {
  const result = validateLesson(lesson);
  return (
    <div>
      <div className={`validation-box ${result.valid ? 'validation-ok' : 'validation-error'}`} style={{ marginBottom: 16 }}>
        {result.valid ? '✅ Ders geçerli — üretime gönderilebilir' : `❌ ${result.errors.length} hata var`}
      </div>
      {result.errors.map((e, i) => (
        <div key={i} className="validation-box validation-error" style={{ marginBottom: 6 }}>{e}</div>
      ))}
      {result.warnings.map((w, i) => (
        <div key={i} className="validation-box validation-warning" style={{ marginBottom: 6 }}>{w}</div>
      ))}
      {result.valid && result.warnings.length === 0 && (
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>Uyarı yok 🎉</div>
      )}
    </div>
  );
}

function HistoryPanel({ lesson }: { lesson: AdminLesson }) {
  const history = [...(lesson.changeHistory ?? [])].reverse();
  if (!history.length) return <div style={{ color: 'var(--text3)' }}>Henüz değişiklik geçmişi yok.</div>;
  return (
    <div>
      {history.map((record, i) => (
        <div key={i} style={{
          background: 'var(--bg4)', borderRadius: 8, padding: '10px 14px',
          marginBottom: 6, fontSize: 12,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--text2)' }}>{record.action}</span>
            <span style={{ flex: 1, color: 'var(--text)' }}>{record.description}</span>
            <span style={{ color: 'var(--text3)' }}>{record.userEmail}</span>
          </div>
          <div style={{ color: 'var(--text3)', marginTop: 4 }}>
            {new Date(record.timestamp).toLocaleString('tr-TR')}
          </div>
        </div>
      ))}
    </div>
  );
}
