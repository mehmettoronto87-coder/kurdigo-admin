import { useEffect, useMemo, useState } from 'react';
import { getLessonsForUnit } from '../lib/firestore';
import { UNITS } from '../lib/curriculumData';
import { generateImageAsset } from '../lib/aiProviders';
import {
  DEFAULT_QC,
  buildVocabImageJobs,
  qcPassed,
  type VocabImageJob,
  type VocabImageQc,
} from '../lib/vocabImagePipeline';

type GeneratedState = {
  url?: string;
  loading?: boolean;
  error?: string;
  qc: VocabImageQc;
  attempts: number;
};

const PILOT_UNITS = UNITS.filter(unit => ['unit9', 'unit10'].includes(unit.id));

function stateKey(job: VocabImageJob): string {
  return `${job.unitId}:${job.uniqueKey}`;
}

function categoryLabel(category: VocabImageJob['category']): string {
  return {
    concrete_object: 'Somut',
    action: 'Eylem',
    emotion: 'Duygu',
    abstract_concept: 'Soyut',
    cultural_concept: 'Kültürel',
    ambiguous_hard: 'Zor',
  }[category];
}

function fileName(job: VocabImageJob): string {
  return `${job.unitId}_${job.itemId}.webp`;
}



export default function VocabImagePipelinePage() {
  const [unitId, setUnitId] = useState('unit9');
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<VocabImageJob[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, GeneratedState>>({});
  const [batchLimit, setBatchLimit] = useState(5);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage('');
    getLessonsForUnit(unitId)
      .then(lessons => {
        if (cancelled) return;
        const nextJobs = buildVocabImageJobs(lessons);
        setJobs(nextJobs);
        setSelectedKey(nextJobs[0] ? stateKey(nextJobs[0]) : null);
      })
      .catch(error => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Dersler yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [unitId]);

  const selected = useMemo(
    () => jobs.find(job => stateKey(job) === selectedKey) ?? jobs[0],
    [jobs, selectedKey],
  );

  const stats = useMemo(() => {
    const values = jobs.map(job => generated[stateKey(job)]);
    return {
      generated: values.filter(Boolean).length,
      approved: values.filter(value => value && qcPassed(value.qc)).length,
      rejected: values.filter(value => value && !qcPassed(value.qc) && value.attempts > 0).length,
    };
  }, [jobs, generated]);

  const setJobState = (job: VocabImageJob, patch: Partial<GeneratedState>) => {
    const key = stateKey(job);
    setGenerated(prev => ({
      ...prev,
      [key]: {
        qc: { ...DEFAULT_QC },
        attempts: 0,
        ...(prev[key] ?? {}),
        ...patch,
      },
    }));
  };

  const generateOne = async (job: VocabImageJob) => {
    setJobState(job, { loading: true, error: undefined });
    try {
      const current = generated[stateKey(job)];
      const prompt = current?.qc.notes
        ? `${job.prompt}\n\nRetry note from reviewer: ${current.qc.notes}`
        : job.prompt;
      const asset = await generateImageAsset(prompt);
      const url = URL.createObjectURL(asset.blob);
      setJobState(job, {
        url,
        loading: false,
        attempts: (current?.attempts ?? 0) + 1,
        qc: { ...DEFAULT_QC },
      });
    } catch (error) {
      setJobState(job, {
        loading: false,
        error: error instanceof Error ? error.message : 'Görsel üretilemedi.',
      });
    }
  };

  const generateBatch = async () => {
    const queue = jobs
      .filter(job => !generated[stateKey(job)]?.url || !qcPassed(generated[stateKey(job)].qc))
      .slice(0, batchLimit);
    for (const job of queue) {
      await generateOne(job);
    }
  };

  const updateQc = (job: VocabImageJob, patch: Partial<VocabImageQc>) => {
    const key = stateKey(job);
    setGenerated(prev => {
      const current = prev[key] ?? { qc: { ...DEFAULT_QC }, attempts: 0 };
      return {
        ...prev,
        [key]: {
          ...current,
          qc: { ...current.qc, ...patch },
        },
      };
    });
  };

  const selectedState = selected ? generated[stateKey(selected)] : undefined;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28 }}>Görsel Pipeline</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text2)' }}>
          Ücretsiz pilot mod: prompt/style/QC burada, ilk görsel denemeleri Pollinations ile.
        </p>
      </div>

      <section className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 700 }}>Ünite</span>
          <select value={unitId} onChange={e => setUnitId(e.target.value)} style={{ minWidth: 220 }}>
            {PILOT_UNITS.map(unit => (
              <option key={unit.id} value={unit.id}>{unit.order}. {unit.title}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 700 }}>Batch</span>
          <input
            type="number"
            min={1}
            max={20}
            value={batchLimit}
            onChange={e => setBatchLimit(Number(e.target.value) || 1)}
            style={{ width: 90 }}
          />
        </label>
        <button className="btn btn-primary" onClick={generateBatch} disabled={loading || jobs.length === 0}>
          OpenAI ile {batchLimit} üret
        </button>
        <button className="btn" onClick={() => selected && generateOne(selected)} disabled={!selected || selectedState?.loading}>
          Seçileni üret / retry
        </button>
        <div style={{ marginLeft: 'auto', color: 'var(--text2)', fontSize: 13 }}>
          {jobs.length} iş · {stats.generated} üretildi · {stats.approved} onay · {stats.rejected} retry
        </div>
      </section>

      {message && <div className="card" style={{ borderColor: '#ef4444', color: '#991b1b' }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 18, alignItems: 'start' }}>
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)', fontWeight: 800 }}>Kelime İşleri</div>
          <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
            {jobs.map(job => {
              const key = stateKey(job);
              const state = generated[key];
              const passed = state ? qcPassed(state.qc) : false;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  style={{
                    width: '100%',
                    border: 0,
                    borderBottom: '1px solid var(--border)',
                    background: selectedKey === key ? 'var(--blue-dim)' : 'transparent',
                    padding: 12,
                    textAlign: 'left',
                    display: 'grid',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{job.emoji || '🖼️'}</span>
                    <strong style={{ flex: 1 }}>{job.ku}</strong>
                    <span style={{ fontSize: 11, color: passed ? '#58cc02' : state?.url ? '#ff9600' : 'var(--text3)', fontWeight: 800 }}>
                      {passed ? 'OK' : state?.url ? 'QC' : categoryLabel(job.category)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{job.tr} / {job.en}</div>
                  {job.duplicateItemIds.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Tekrar: {job.duplicateItemIds.length}</div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {selected && (
          <section style={{ display: 'grid', gap: 14 }}>
            <div className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 380px) 1fr', gap: 18 }}>
              <div>
                <div
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 8,
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {selectedState?.loading ? (
                    <div style={{ color: 'var(--text2)', fontWeight: 800 }}>Üretiliyor...</div>
                  ) : selectedState?.url ? (
                    <img src={selectedState.url} alt={selected.ku} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text2)' }}>
                      <div style={{ fontSize: 48 }}>{selected.emoji || '🖼️'}</div>
                      <strong>Henüz görsel yok</strong>
                    </div>
                  )}
                </div>
                {selectedState?.error && (
                  <div style={{ color: '#991b1b', fontSize: 12, marginTop: 8 }}>{selectedState.error}</div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selected.ku}</h2>
                  <div style={{ color: 'var(--text2)' }}>{selected.tr} / {selected.en}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>
                    {selected.lessonTitle} · {categoryLabel(selected.category)} · {fileName(selected)}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  {[
                    ['conceptCorrect', 'Kavram doğru mu?'],
                    ['styleConsistent', 'Stil uyuyor mu?'],
                    ['noTextOrLogo', 'Yazı/logo yok mu?'],
                    ['mobileReadable', 'Küçük ekranda okunur mu?'],
                    ['characterOrPropOk', 'Karakter/prop düzgün mü?'],
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text2)' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedState?.qc[key as keyof VocabImageQc])}
                        onChange={e => updateQc(selected, { [key]: e.target.checked } as Partial<VocabImageQc>)}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <textarea
                  placeholder="Retry notu: yanlışsa buraya kısa yaz. Örn: Sabah daha net olsun, yazı çıkmasın, karakter olmasın."
                  value={selectedState?.qc.notes ?? ''}
                  onChange={e => updateQc(selected, { notes: e.target.value })}
                  rows={3}
                />

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={() => generateOne(selected)} disabled={selectedState?.loading}>
                    {selectedState?.url ? 'Retry üret' : 'OpenAI ile üret'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => navigator.clipboard.writeText(selected.prompt)}
                  >
                    Promptu kopyala
                  </button>
                  <span style={{ alignSelf: 'center', color: selectedState && qcPassed(selectedState.qc) ? '#58cc02' : 'var(--text3)', fontWeight: 800 }}>
                    {selectedState && qcPassed(selectedState.qc) ? 'QC geçti' : 'QC bekliyor'}
                  </span>
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Sabit Prompt</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5, color: 'var(--text2)', maxHeight: 360, overflow: 'auto' }}>
                {selected.prompt}
              </pre>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
