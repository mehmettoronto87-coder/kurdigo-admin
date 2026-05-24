import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardStats } from '../lib/firestore';
import { deduplicateCurriculumItems, type DeduplicationReport } from '../lib/itemDeduplicator';
import { UNITS, LEVELS } from '../lib/curriculumData';
import type { AdminLesson, LessonStatus } from '../types/admin';
import { Timestamp } from 'firebase/firestore';

interface Stats {
  totalUsers: number;
  premiumUsers: number;
  activeUsers7d: number;
  totalXP: number;
  lessonsByStatus: { draft: number; approved: number; production: number; live: number };
  allLessons: AdminLesson[];
  audioMissing: number;
  audioTotal: number;
  thisWeekLessons: number;
  recentEvents: Array<Record<string, unknown>>;
}

const STATUS_CFG: Record<LessonStatus, { label: string; color: string; dim: string; icon: string }> = {
  live:       { label: 'Yayında',   color: 'var(--green)',  dim: 'var(--green-dim)',  icon: '🟢' },
  production: { label: 'Üretimde',  color: 'var(--orange)', dim: 'var(--orange-dim)', icon: '⚙️' },
  approved:   { label: 'Onaylandı', color: 'var(--blue)',   dim: 'var(--blue-dim)',   icon: '✅' },
  draft:      { label: 'Taslak',    color: 'var(--text2)',  dim: 'var(--bg4)',        icon: '✏️' },
};

function bestStatus(lessons: AdminLesson[]): LessonStatus | null {
  for (const s of ['live', 'production', 'approved', 'draft'] as LessonStatus[]) {
    if (lessons.some(l => l.status === s)) return s;
  }
  return null;
}

function ContentMapGrid({
  allLessons,
  onUnit,
}: {
  allLessons: AdminLesson[];
  onUnit: (id: string) => void;
}) {
  const byUnit = new Map<string, AdminLesson[]>();
  allLessons.forEach(l => {
    const arr = byUnit.get(l.unitId) ?? [];
    arr.push(l);
    byUnit.set(l.unitId, arr);
  });

  return (
    <div>
      {LEVELS.map(level => {
        const units = UNITS.filter(u => u.levelId === level.id);
        return (
          <div key={level.id} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px',
              color: 'var(--text3)', marginBottom: 6, fontWeight: 700,
            }}>
              {level.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 5 }}>
              {units.map(unit => {
                const lessons = byUnit.get(unit.id) ?? [];
                const status = bestStatus(lessons);
                const liveCount = lessons.filter(l => l.status === 'live').length;
                const cfg = status ? STATUS_CFG[status] : null;

                return (
                  <div
                    key={unit.id}
                    onClick={() => onUnit(unit.id)}
                    title={`${unit.title}\n${unit.city}\n${lessons.length}/5 ders`}
                    style={{
                      background: cfg ? cfg.dim : 'var(--bg2)',
                      border: `1px solid ${cfg ? cfg.color : 'var(--border)'}`,
                      borderStyle: cfg ? 'solid' : 'dashed',
                      borderRadius: 7,
                      padding: '7px 3px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'transform 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    <div style={{ fontSize: 9, color: cfg ? cfg.color : 'var(--text3)', fontWeight: 700 }}>
                      U{unit.order.toString().padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: cfg ? cfg.color : 'var(--text3)', lineHeight: 1.2 }}>
                      {liveCount}
                      <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>/5</span>
                    </div>
                    <div style={{ fontSize: 10 }}>{unit.icon}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
        {(['live', 'production', 'approved', 'draft'] as LessonStatus[]).map(s => (
          <span key={s} style={{ fontSize: 11, color: STATUS_CFG[s].color, display: 'flex', alignItems: 'center', gap: 4 }}>
            {STATUS_CFG[s].icon} {STATUS_CFG[s].label}
          </span>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>· · Boş</span>
      </div>
    </div>
  );
}

function formatDate(ts: unknown): string {
  if (!ts) return '';
  if (ts instanceof Timestamp) return ts.toDate().toLocaleString('tr-TR');
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return new Date((ts as { seconds: number }).seconds * 1000).toLocaleString('tr-TR');
  }
  return '';
}

const EVENT_LABELS: Record<string, string> = {
  lesson_complete:    '✅ Ders Tamamlandı',
  register:           '👤 Yeni Kayıt',
  badge_earned:       '🏅 Rozet Kazanıldı',
  premium_purchase:   '👑 Premium Alındı',
  weak_words_review:  '🔁 Tekrar Yapıldı',
};

function MaintenancePanel() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [report, setReport] = useState<DeduplicationReport | null>(null);

  const run = async () => {
    if (running) return;
    if (!confirm('Tüm müfredattaki yinelenen kelime ID\'leri birleştirilecek. Devam edilsin mi?')) return;
    setRunning(true);
    setLog([]);
    setReport(null);
    try {
      const result = await deduplicateCurriculumItems(msg => setLog(prev => [...prev, msg]));
      setReport(result);
    } catch (err) {
      setLog(prev => [...prev, `❌ Hata: ${String(err)}`]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card" style={{ padding: 20, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🔧 Kelime ID Tekilleştirme</div>
          <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 3 }}>
            Tüm müfredatta aynı Kürtçe kelimeye sahip farklı ID'leri tek ID'ye birleştirir.
            İlk üretildiği dersteki ID'yi baz alır; diğer tüm derslerdeki referansları ve canlı dersleri günceller.
          </div>
        </div>
        <button className="btn-primary" onClick={run} disabled={running} style={{ minWidth: 140 }}>
          {running ? '⏳ Çalışıyor...' : '🚀 Çalıştır'}
        </button>
      </div>

      {log.length > 0 && (
        <div style={{
          background: 'var(--bg3)', borderRadius: 8, padding: 12, maxHeight: 200,
          overflowY: 'auto', fontSize: 12, fontFamily: 'monospace', color: 'var(--text2)',
        }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {report && (
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="stat-card" style={{ flex: '1 1 120px', minWidth: 120 }}>
            <div className="stat-label">Toplam Kelime</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{report.totalWords}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 120px', minWidth: 120 }}>
            <div className="stat-label">Yinelenen Kelime</div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--orange)' }}>{report.duplicateWords}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 120px', minWidth: 120 }}>
            <div className="stat-label">Birleştirilen ID</div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--red)' }}>{report.remappedIds}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 120px', minWidth: 120 }}>
            <div className="stat-label">Güncellenen Ders</div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--green)' }}>{report.updatedLessons}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 120px', minWidth: 120 }}>
            <div className="stat-label">Asset Merge</div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--blue)' }}>{report.updatedSceneAssets ?? 0}</div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 120px', minWidth: 120 }}>
            <div className="stat-label">Silinen Asset</div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--red)' }}>{report.deletedSceneAssets ?? 0}</div>
          </div>
        </div>
      )}

      {report && report.details.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>
            Birleştirilen kelimeler ({report.details.length})
          </summary>
          <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text3)' }}>Kürtçe</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text3)' }}>ID Sayısı</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text3)' }}>Seçilen ID</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text3)' }}>Medya</th>
                </tr>
              </thead>
              <tbody>
                {report.details.map((d, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px', fontWeight: 600 }}>{d.ku}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--orange)' }}>{d.ids.length}</td>
                    <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text2)' }}>
                      {d.canonical.slice(0, 20)}…
                    </td>
                    <td style={{ padding: '4px 8px' }}>{d.hadMedia ? '✅' : '⚠️ yok'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(s => { setStats(s as Stats); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const TOTAL = 300;
  const live = stats?.lessonsByStatus.live ?? 0;
  const pct = Math.round((live / TOTAL) * 100);

  if (loading) return <div className="loading">📊 Yükleniyor...</div>;

  return (
    <div className="page">
      {/* Header + Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">KurdîGo içerik üretim durumu</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => navigate('/ai-generator')}>🤖 Yeni Ders Üret</button>
          <button className="btn btn-secondary" onClick={() => navigate('/curriculum')}>📚 Müfredat</button>
          <button className="btn btn-secondary" onClick={() => navigate('/scene-library')}>🎙️ Ortam</button>
        </div>
      </div>

      {/* Curriculum Progress */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>Müfredat İlerlemesi</h2>
          <span>
            <span style={{ fontSize: 26, fontWeight: 800, color: pct === 100 ? 'var(--green)' : 'var(--blue)' }}>{live}</span>
            <span style={{ fontSize: 13, color: 'var(--text2)', marginLeft: 4 }}>/ {TOTAL} ders yayında</span>
          </span>
        </div>

        {/* Stacked progress bar */}
        <div style={{ height: 12, background: 'var(--bg4)', borderRadius: 6, overflow: 'hidden', marginBottom: 16, display: 'flex' }}>
          {(['live', 'production', 'approved', 'draft'] as LessonStatus[]).map(s => {
            const count = stats?.lessonsByStatus[s] ?? 0;
            const w = (count / TOTAL) * 100;
            if (!w) return null;
            return (
              <div
                key={s}
                title={`${STATUS_CFG[s].label}: ${count}`}
                style={{ height: '100%', width: `${w}%`, background: STATUS_CFG[s].color, transition: 'width 0.5s' }}
              />
            );
          })}
        </div>

        {/* Status cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {(['live', 'production', 'approved', 'draft'] as LessonStatus[]).map(s => {
            const cfg = STATUS_CFG[s];
            const count = stats?.lessonsByStatus[s] ?? 0;
            return (
              <div key={s} style={{
                background: cfg.dim, border: `1px solid ${cfg.color}`,
                borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 10, color: cfg.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {cfg.icon} {cfg.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: cfg.color, margin: '4px 0 2px' }}>{count}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {TOTAL > 0 ? Math.round((count / TOTAL) * 100) : 0}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Quality Row */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">🎙️ Ses Eksik</div>
          <div className="stat-value" style={{
            color: (stats?.audioMissing ?? 0) > 0 ? 'var(--red)' : 'var(--green)',
            fontSize: 28,
          }}>
            {stats?.audioMissing ?? 0}
          </div>
          <div className="stat-sub">
            {stats?.audioTotal ? `${stats.audioTotal} asset içinde` : 'asset yok'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">📅 Bu Hafta Üretilen</div>
          <div className="stat-value" style={{ color: 'var(--blue)', fontSize: 28 }}>
            {stats?.thisWeekLessons ?? 0}
          </div>
          <div className="stat-sub">ders oluşturuldu / güncellendi</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">🎯 Kalan Hedef</div>
          <div className="stat-value" style={{ color: 'var(--orange)', fontSize: 28 }}>
            {TOTAL - live}
          </div>
          <div className="stat-sub">ders kaldı · {pct}% tamamlandı</div>
        </div>
      </div>

      {/* Content Map */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>İçerik Haritası</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/curriculum')}>
            Müfredat Sayfası →
          </button>
        </div>
        <ContentMapGrid
          allLessons={stats?.allLessons ?? []}
          onUnit={id => navigate(`/curriculum/${id}`)}
        />
      </div>

      {/* Bottom: Users + Recent Activity */}
      <div className="grid-2">
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Kullanıcılar</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="stat-card">
              <div className="stat-label">Toplam</div>
              <div className="stat-value" style={{ color: 'var(--blue)', fontSize: 24 }}>{stats?.totalUsers ?? 0}</div>
              <div className="stat-sub">kayıtlı hesap</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Premium</div>
              <div className="stat-value" style={{ color: 'var(--yellow)', fontSize: 24 }}>{stats?.premiumUsers ?? 0}</div>
              <div className="stat-sub">aktif abone</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">7 Günlük Aktif</div>
              <div className="stat-value" style={{ color: 'var(--green)', fontSize: 24 }}>{stats?.activeUsers7d ?? 0}</div>
              <div className="stat-sub">kullanıcı</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Toplam XP</div>
              <div className="stat-value" style={{ color: 'var(--purple)', fontSize: 24 }}>
                {(stats?.totalXP ?? 0).toLocaleString('tr-TR')}
              </div>
              <div className="stat-sub">kazanılan puan</div>
            </div>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Son Aktiviteler</h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {!stats?.recentEvents?.length ? (
              <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>
                Henüz aktivite yok
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Etkinlik</th>
                      <th>Kullanıcı</th>
                      <th>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentEvents.slice(0, 8).map((e, i) => (
                      <tr key={i}>
                        <td>{EVENT_LABELS[e['type'] as string] ?? String(e['type'] ?? '')}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 12 }}>
                          {String(e['uid'] ?? '').slice(0, 8)}…
                        </td>
                        <td style={{ color: 'var(--text3)', fontSize: 12 }}>{formatDate(e['ts'])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <MaintenancePanel />
      </div>
    </div>
  );
}
