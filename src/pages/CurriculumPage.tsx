import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllLessons } from '../lib/firestore';
import { UNITS, LEVELS } from '../lib/curriculumData';
import type { AdminLesson, LessonStatus } from '../types/admin';

const STATUS_CFG: Record<LessonStatus, { label: string; cls: string; icon: string; color: string; dim: string }> = {
  live:       { label: 'Yayında',   cls: 'badge-live',       icon: '🟢', color: 'var(--green)',  dim: 'var(--green-dim)'  },
  production: { label: 'Üretimde',  cls: 'badge-production', icon: '⚙️', color: 'var(--orange)', dim: 'var(--orange-dim)' },
  approved:   { label: 'Onaylandı', cls: 'badge-approved',   icon: '✅', color: 'var(--blue)',   dim: 'var(--blue-dim)'   },
  draft:      { label: 'Taslak',    cls: 'badge-draft',      icon: '✏️', color: 'var(--text2)',  dim: 'var(--bg4)'        },
};

function LessonCell({
  status,
  index,
  lessonTitle,
  onClick,
}: {
  status: LessonStatus | undefined;
  index: number;
  lessonTitle: string;
  onClick: () => void;
}) {
  const cfg = status ? STATUS_CFG[status] : null;
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={`Ders ${index + 1}${lessonTitle ? `: ${lessonTitle}` : ''} — ${cfg ? cfg.label : 'Boş'}`}
      style={{
        width: 28, height: 28, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
        background: cfg ? cfg.dim : 'var(--bg2)',
        color: cfg ? cfg.color : 'var(--text3)',
        border: cfg ? `1px solid ${cfg.color}` : '1px dashed var(--border)',
        transition: 'transform 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {cfg ? (index + 1) : '·'}
    </div>
  );
}

export default function CurriculumPage() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [view, setView] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    getAllLessons().then(ls => {
      setLessons(ls);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const lessonsByUnit = new Map<string, AdminLesson[]>();
  lessons.forEach(l => {
    const arr = lessonsByUnit.get(l.unitId) ?? [];
    arr.push(l);
    lessonsByUnit.set(l.unitId, arr);
  });

  const filteredUnits = UNITS.filter(u => {
    if (filterLevel !== 'all' && u.levelId !== filterLevel) return false;
    return true;
  });

  if (loading) return <div className="loading">📚 Müfredat yükleniyor...</div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Müfredat</h1>
          <p className="page-subtitle">60 ünite × 5 ders = 300 ders · Durum takibi</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* View Toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg4)', padding: 3, borderRadius: 8 }}>
            <button
              className={`btn btn-sm ${view === 'list' ? 'btn-blue' : ''}`}
              style={{ background: view === 'list' ? 'var(--blue)' : 'transparent', color: view === 'list' ? '#000' : 'var(--text2)' }}
              onClick={() => setView('list')}
            >
              ☰ Liste
            </button>
            <button
              className={`btn btn-sm ${view === 'grid' ? 'btn-blue' : ''}`}
              style={{ background: view === 'grid' ? 'var(--blue)' : 'transparent', color: view === 'grid' ? '#000' : 'var(--text2)' }}
              onClick={() => setView('grid')}
            >
              🗺️ Harita
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/ai-generator')}>
            🤖 AI ile Yeni Ders Üret
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Tüm Seviyeler</option>
          {LEVELS.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
        {view === 'list' && (
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">Tüm Durumlar</option>
            <option value="draft">Taslak</option>
            <option value="approved">Onaylandı</option>
            <option value="production">Üretimde</option>
            <option value="live">Yayında</option>
          </select>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {Object.entries(STATUS_CFG).map(([status, cfg]) => {
            const count = lessons.filter(l => l.status === status).length;
            return (
              <span key={status} className={`badge ${cfg.cls}`}>
                {cfg.icon} {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* ─── LISTE VIEW ─── */}
      {view === 'list' && (
        <>
          {LEVELS.filter(l => filterLevel === 'all' || l.id === filterLevel).map(level => {
            const levelUnits = filteredUnits.filter(u => u.levelId === level.id);
            if (!levelUnits.length) return null;

            return (
              <div key={level.id} style={{ marginBottom: 32 }}>
                <h2 style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--text2)',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ color: 'var(--green)' }}>●</span>
                  {level.title} — {level.description}
                </h2>

                <div style={{ display: 'grid', gap: 8 }}>
                  {levelUnits.map(unit => {
                    const unitLessons = lessonsByUnit.get(unit.id) ?? [];
                    const totalWithContent = unitLessons.length;

                    if (filterStatus !== 'all' && !unitLessons.some(l => l.status === filterStatus)) return null;

                    return (
                      <div
                        key={unit.id}
                        style={{
                          background: 'var(--bg3)', border: '1px solid var(--border)',
                          borderRadius: 10, padding: '14px 16px',
                          cursor: 'pointer', transition: 'border-color 0.15s',
                        }}
                        onClick={() => navigate(`/curriculum/${unit.id}`)}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 22 }}>{unit.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{unit.title}</span>
                              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                                {unit.id.toUpperCase()} · {unit.city}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{unit.description}</div>
                          </div>

                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {Array.from({ length: 5 }, (_, i) => {
                              const lesson = unitLessons.find(l => l.lessonOrder === i + 1);
                              return (
                                <LessonCell
                                  key={i}
                                  status={lesson?.status}
                                  index={i}
                                  lessonTitle={lesson?.title ?? ''}
                                  onClick={() => navigate(`/curriculum/${unit.id}`)}
                                />
                              );
                            })}
                          </div>

                          <div style={{ width: 100, flexShrink: 0 }}>
                            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, textAlign: 'right' }}>
                              {totalWithContent}/5 ders
                            </div>
                            <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%',
                                width: `${(totalWithContent / 5) * 100}%`,
                                background: totalWithContent === 5 ? 'var(--green)' : 'var(--blue)',
                                borderRadius: 2,
                              }} />
                            </div>
                          </div>

                          <span style={{ color: 'var(--text3)', fontSize: 16 }}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ─── HARITA VIEW ─── */}
      {view === 'grid' && (
        <div>
          {LEVELS.filter(l => filterLevel === 'all' || l.id === filterLevel).map(level => {
            const levelUnits = UNITS.filter(u => u.levelId === level.id);
            if (!levelUnits.length) return null;

            return (
              <div key={level.id} style={{ marginBottom: 28 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '1px', color: 'var(--text3)', marginBottom: 8,
                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                }}>
                  {level.title} — {level.description}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Header row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '32px 20px 1fr 148px', gap: 8, alignItems: 'center', padding: '0 8px', marginBottom: 4 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>#</div>
                    <div />
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>Ünite</div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {[1,2,3,4,5].map(n => (
                        <div key={n} style={{ width: 28, textAlign: 'center', fontSize: 10, color: 'var(--text3)' }}>L{n}</div>
                      ))}
                    </div>
                  </div>

                  {levelUnits.map(unit => {
                    const unitLessons = lessonsByUnit.get(unit.id) ?? [];

                    return (
                      <div
                        key={unit.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '32px 20px 1fr 148px',
                          gap: 8, alignItems: 'center',
                          padding: '5px 8px', borderRadius: 6,
                          cursor: 'pointer', transition: 'background 0.12s',
                        }}
                        onClick={() => navigate(`/curriculum/${unit.id}`)}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg4)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700 }}>
                          U{unit.order.toString().padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: 15 }}>{unit.icon}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {unit.title}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {unit.city}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {Array.from({ length: 5 }, (_, i) => {
                            const lesson = unitLessons.find(l => l.lessonOrder === i + 1);
                            return (
                              <LessonCell
                                key={i}
                                status={lesson?.status}
                                index={i}
                                lessonTitle={lesson?.title ?? ''}
                                onClick={() => navigate(`/curriculum/${unit.id}`)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
