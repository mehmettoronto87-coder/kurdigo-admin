import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getSocialPosts, createSocialPost, updateSocialPost, deleteSocialPost,
  getAllAdminUsers,
  type SocialPost, type SocialPlatform, type PostStatus,
} from '../lib/adminFirestore';
import type { AdminUser } from '../types/admin';

const PLATFORMS: { id: SocialPlatform; label: string; icon: string; color: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: '📸', color: '#E1306C' },
  { id: 'tiktok',    label: 'TikTok',    icon: '🎵', color: '#000000' },
  { id: 'twitter',   label: 'X / Twitter', icon: '🐦', color: '#1DA1F2' },
  { id: 'facebook',  label: 'Facebook',  icon: '📘', color: '#1877F2' },
  { id: 'youtube',   label: 'YouTube',   icon: '▶️', color: '#FF0000' },
  { id: 'linkedin',  label: 'LinkedIn',  icon: '💼', color: '#0A66C2' },
];

const STATUSES: { id: PostStatus; label: string; color: string; bg: string }[] = [
  { id: 'idea',      label: '💡 Fikir',      color: 'var(--text3)',  bg: 'var(--bg4)' },
  { id: 'draft',     label: '✏️ Taslak',     color: 'var(--text2)',  bg: 'var(--bg3)' },
  { id: 'review',    label: '👀 İnceleme',   color: 'var(--orange)', bg: 'var(--orange-dim)' },
  { id: 'approved',  label: '✅ Onaylandı',  color: 'var(--green)',  bg: 'var(--green-dim)' },
  { id: 'scheduled', label: '📅 Planlandı',  color: 'var(--blue)',   bg: 'var(--blue-dim)' },
  { id: 'published', label: '🚀 Yayında',    color: 'var(--purple)', bg: 'var(--purple-dim, #6f42c122)' },
];

const STATUS_NEXT: Partial<Record<PostStatus, PostStatus>> = {
  idea: 'draft', draft: 'review', review: 'approved', approved: 'scheduled', scheduled: 'published',
};

function platformIcon(id: SocialPlatform) {
  return PLATFORMS.find(p => p.id === id)?.icon ?? '🌐';
}

function statusCfg(id: PostStatus) {
  return STATUSES.find(s => s.id === id) ?? STATUSES[0];
}

function formatDate(iso?: string) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

const EMPTY_FORM = {
  title: '', caption: '', platforms: [] as SocialPlatform[],
  hashtags: '', scheduledAt: '', notes: '', assignedTo: '', status: 'idea' as PostStatus,
};

export default function SocialMediaPage() {
  const { adminUser } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [members, setMembers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PostStatus | 'all'>('all');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [postList, memberList] = await Promise.all([
      getSocialPosts(filter === 'all' ? undefined : filter),
      getAllAdminUsers(),
    ]);
    setPosts(postList);
    setMembers(memberList.filter(m => m.isActive));
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleCreate = async () => {
    if (!form.title.trim() || !adminUser) return;
    setSaving(true);
    const assignee = members.find(m => m.uid === form.assignedTo);
    await createSocialPost({
      title: form.title.trim(),
      caption: form.caption.trim(),
      platforms: form.platforms,
      status: form.status,
      mediaUrls: [],
      hashtags: form.hashtags.split(/[\s,]+/).map(h => h.replace(/^#/, '').trim()).filter(Boolean),
      scheduledAt: form.scheduledAt || undefined,
      createdBy: adminUser.uid,
      createdByName: adminUser.displayName ?? adminUser.email,
      assignedTo: form.assignedTo || undefined,
      assignedName: assignee?.displayName ?? assignee?.email,
      notes: form.notes.trim() || undefined,
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
    await load();
    setSaving(false);
  };

  const handleStatusAdvance = async (post: SocialPost) => {
    const next = STATUS_NEXT[post.status];
    if (!next || !adminUser) return;
    const changes: Partial<SocialPost> = { status: next };
    if (next === 'approved') {
      changes.approvedBy = adminUser.uid;
      changes.approvedByName = adminUser.displayName ?? adminUser.email;
    }
    if (next === 'published') changes.publishedAt = new Date().toISOString();
    await updateSocialPost(post.id, changes);
    await load();
    if (selected?.id === post.id) setSelected(p => p ? { ...p, ...changes } : p);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu içeriği silmek istiyor musun?')) return;
    await deleteSocialPost(id);
    setSelected(null);
    await load();
  };

  // Board view — Kanban tarzı
  const boardColumns = STATUSES.map(s => ({
    ...s,
    posts: posts.filter(p => p.status === s.id),
  }));

  // List view — filtreli
  const listPosts = filter === 'all' ? posts : posts.filter(p => p.status === filter);

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">📱 Sosyal Medya</h1>
          <p className="page-subtitle">İçerik planlama, onay akışı ve yayın takvimi</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setView(v => v === 'board' ? 'list' : 'board')}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}
          >
            {view === 'board' ? '☰ Liste' : '⬛ Kanban'}
          </button>
          <button className="btn-primary" onClick={() => { setShowForm(true); setSelected(null); }}>
            + Yeni İçerik
          </button>
        </div>
      </div>

      {/* Özet istatistikler */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUSES.map(s => {
          const count = posts.filter(p => p.status === s.id).length;
          if (!count) return null;
          return (
            <div key={s.id} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              color: s.color, background: s.bg, border: `1px solid ${s.color}44`,
            }}>
              {s.label} · {count}
            </div>
          );
        })}
      </div>

      {/* Yeni içerik formu */}
      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontWeight: 700 }}>Yeni İçerik Oluştur</h3>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder="Başlık (iç kullanım)"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
            />
            <textarea
              placeholder="Gönderi metni / caption"
              value={form.caption}
              onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
              rows={4}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }}
            />
            <input
              placeholder="Hashtagler (virgül veya boşlukla ayır)"
              value={form.hashtags}
              onChange={e => setForm(f => ({ ...f, hashtags: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
            />

            {/* Platform seçimi */}
            <div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Platformlar</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setForm(f => ({
                      ...f,
                      platforms: f.platforms.includes(p.id) ? f.platforms.filter(x => x !== p.id) : [...f.platforms, p.id],
                    }))}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${form.platforms.includes(p.id) ? p.color : 'var(--border)'}`,
                      background: form.platforms.includes(p.id) ? p.color + '22' : 'var(--bg3)',
                      color: form.platforms.includes(p.id) ? p.color : 'var(--text2)',
                      fontWeight: form.platforms.includes(p.id) ? 700 : 400,
                    }}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as PostStatus }))}
                style={{ flex: '1 1 140px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
              >
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select
                value={form.assignedTo}
                onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                style={{ flex: '1 1 160px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
              >
                <option value="">Kişi ata (opsiyonel)</option>
                {members.map(m => <option key={m.uid} value={m.uid}>{m.displayName ?? m.email.split('@')[0]}</option>)}
              </select>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                style={{ flex: '1 1 180px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
              />
            </div>
            <textarea
              placeholder="Notlar (opsiyonel)"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }}
            />
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
            >
              {saving ? 'Kaydediliyor...' : 'İçeriği Kaydet'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Yükleniyor...</div>
      ) : view === 'board' ? (
        /* ── Kanban Board ── */
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16 }}>
          {boardColumns.map(col => (
            <div key={col.id} style={{ minWidth: 240, flex: '0 0 240px' }}>
              <div style={{
                padding: '6px 12px', borderRadius: 8, marginBottom: 10,
                background: col.bg, color: col.color, fontWeight: 700, fontSize: 13,
                border: `1px solid ${col.color}44`,
              }}>
                {col.label} <span style={{ opacity: 0.7, fontWeight: 400 }}>({col.posts.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.posts.map(post => (
                  <div
                    key={post.id}
                    onClick={() => { setSelected(post); setShowForm(false); }}
                    className="card"
                    style={{ padding: '12px 14px', cursor: 'pointer', border: selected?.id === post.id ? '1px solid var(--blue)' : undefined }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{post.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {post.caption || '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {post.platforms.map(p => (
                        <span key={p} style={{ fontSize: 14 }}>{platformIcon(p)}</span>
                      ))}
                    </div>
                    {post.scheduledAt && (
                      <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 4 }}>📅 {formatDate(post.scheduledAt)}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Liste görünümü ── */
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['all', ...STATUSES.map(s => s.id)] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: filter === s ? '1px solid var(--blue)' : '1px solid var(--border)',
                  background: filter === s ? 'var(--blue-dim)' : 'var(--bg3)',
                  color: filter === s ? 'var(--blue)' : 'var(--text2)',
                  fontWeight: filter === s ? 700 : 400,
                }}
              >
                {s === 'all' ? 'Tümü' : statusCfg(s as PostStatus).label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {listPosts.map(post => {
              const sc = statusCfg(post.status);
              return (
                <div
                  key={post.id}
                  onClick={() => { setSelected(post); setShowForm(false); }}
                  className="card"
                  style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, border: selected?.id === post.id ? '1px solid var(--blue)' : undefined }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{post.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{post.createdByName}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {post.platforms.map(p => <span key={p} style={{ fontSize: 16 }}>{platformIcon(p)}</span>)}
                  </div>
                  {post.scheduledAt && <div style={{ fontSize: 11, color: 'var(--blue)', whiteSpace: 'nowrap' }}>📅 {formatDate(post.scheduledAt)}</div>}
                  <div style={{ fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                    {sc.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detay paneli */}
      {selected && (
        <div className="card" style={{ padding: 20, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <h2 style={{ fontWeight: 700, fontSize: 18 }}>{selected.title}</h2>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                {selected.createdByName} · {formatDate(selected.createdAt)}
                {selected.assignedName && ` · 👤 ${selected.assignedName}`}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
          </div>

          {/* Durum + platformlar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              fontSize: 12, fontWeight: 700, color: statusCfg(selected.status).color,
              background: statusCfg(selected.status).bg, padding: '4px 12px', borderRadius: 20,
            }}>
              {statusCfg(selected.status).label}
            </span>
            {selected.platforms.map(p => {
              const cfg = PLATFORMS.find(x => x.id === p)!;
              return (
                <span key={p} style={{ fontSize: 12, color: cfg.color, background: cfg.color + '18', padding: '4px 10px', borderRadius: 20 }}>
                  {cfg.icon} {cfg.label}
                </span>
              );
            })}
          </div>

          {/* Caption */}
          {selected.caption && (
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {selected.caption}
            </div>
          )}

          {/* Hashtagler */}
          {selected.hashtags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {selected.hashtags.map(h => (
                <span key={h} style={{ fontSize: 12, color: 'var(--blue)', background: 'var(--blue-dim)', padding: '2px 8px', borderRadius: 12 }}>#{h}</span>
              ))}
            </div>
          )}

          {selected.scheduledAt && (
            <div style={{ fontSize: 13, color: 'var(--blue)', marginBottom: 12 }}>📅 Planlanan yayın: {formatDate(selected.scheduledAt)}</div>
          )}
          {selected.publishedAt && (
            <div style={{ fontSize: 13, color: 'var(--green)', marginBottom: 12 }}>🚀 Yayınlandı: {formatDate(selected.publishedAt)}</div>
          )}
          {selected.notes && (
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, fontStyle: 'italic' }}>📝 {selected.notes}</div>
          )}

          {/* Aksiyonlar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_NEXT[selected.status] && (
              <button className="btn-primary" onClick={() => handleStatusAdvance(selected)}>
                {selected.status === 'review' ? '✅ Onayla' :
                 selected.status === 'approved' ? '📅 Planla' :
                 selected.status === 'scheduled' ? '🚀 Yayınlandı Olarak İşaretle' :
                 '→ Sonraki Aşama'}
              </button>
            )}
            {adminUser?.role === 'owner' && (
              <button
                onClick={() => handleDelete(selected.id)}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--red)', background: 'var(--red-dim, #ff000011)', color: 'var(--red)', cursor: 'pointer', fontSize: 13 }}
              >
                🗑 Sil
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
