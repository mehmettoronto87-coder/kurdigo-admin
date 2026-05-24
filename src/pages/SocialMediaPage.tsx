import { useEffect, useRef, useState } from 'react';
import OpenAI from 'openai';
import { useAuth } from '../hooks/useAuth';
import {
  getSocialPosts, createSocialPost, updateSocialPost, deleteSocialPost, logPostPerformance,
  getAllAdminUsers,
  type SocialPost, type SocialPlatform, type PostStatus, type PostCategory, type PostPerformance,
  POST_CATEGORY_LABELS,
} from '../lib/adminFirestore';
import type { AdminUser } from '../types/admin';

// ─── Sabitler ───────────────────────────────────────────────────────────────

const PLATFORMS: { id: SocialPlatform; label: string; icon: string; color: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: '📸', color: '#E1306C' },
  { id: 'tiktok',    label: 'TikTok',    icon: '🎵', color: '#555' },
  { id: 'twitter',   label: 'X / Twitter', icon: '🐦', color: '#1DA1F2' },
  { id: 'facebook',  label: 'Facebook',  icon: '📘', color: '#1877F2' },
  { id: 'youtube',   label: 'YouTube',   icon: '▶️', color: '#FF0000' },
  { id: 'linkedin',  label: 'LinkedIn',  icon: '💼', color: '#0A66C2' },
];

const STATUSES: { id: PostStatus; label: string; color: string; bg: string }[] = [
  { id: 'idea',      label: '💡 Fikir',     color: 'var(--text3)',  bg: 'var(--bg4)' },
  { id: 'draft',     label: '✏️ Taslak',    color: 'var(--text2)',  bg: 'var(--bg3)' },
  { id: 'review',    label: '👀 İnceleme',  color: 'var(--orange)', bg: 'var(--orange-dim)' },
  { id: 'approved',  label: '✅ Onaylandı', color: 'var(--green)',  bg: 'var(--green-dim)' },
  { id: 'scheduled', label: '📅 Planlandı', color: 'var(--blue)',   bg: 'var(--blue-dim)' },
  { id: 'published', label: '🚀 Yayında',   color: '#8b5cf6',       bg: '#8b5cf622' },
];

const CATEGORIES = Object.entries(POST_CATEGORY_LABELS) as [PostCategory, string][];

const STATUS_NEXT: Partial<Record<PostStatus, PostStatus>> = {
  idea: 'draft', draft: 'review', review: 'approved', approved: 'scheduled', scheduled: 'published',
};

const PERF_FIELDS: { key: keyof PostPerformance; label: string; icon: string }[] = [
  { key: 'views',    label: 'Görüntülenme', icon: '👁' },
  { key: 'reach',    label: 'Erişim',       icon: '📡' },
  { key: 'likes',    label: 'Beğeni',       icon: '❤️' },
  { key: 'comments', label: 'Yorum',        icon: '💬' },
  { key: 'shares',   label: 'Paylaşım',     icon: '🔁' },
  { key: 'saves',    label: 'Kaydet',       icon: '🔖' },
  { key: 'clicks',   label: 'Tıklama',      icon: '🖱' },
];

// ─── Yardımcı fonksiyonlar ──────────────────────────────────────────────────

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

// ─── AI Caption ─────────────────────────────────────────────────────────────

async function generateCaption(topic: string, platforms: SocialPlatform[], category?: PostCategory): Promise<{ caption: string; hashtags: string }> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string;
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const platformNames = platforms.map(p => PLATFORMS.find(x => x.id === p)?.label).filter(Boolean).join(', ');
  const categoryLabel = category ? POST_CATEGORY_LABELS[category] : '';

  const completion = await openai.chat.completions.create({
    model: import.meta.env.VITE_OPENAI_TEXT_MODEL || 'gpt-4o',
    messages: [{
      role: 'user',
      content: `KurdîGo adlı bir Kürtçe dil öğrenme uygulaması için sosyal medya gönderisi yaz.

Konu: ${topic}
Platform(lar): ${platformNames || 'Genel'}
İçerik türü: ${categoryLabel || 'Genel'}

Lütfen şunları ver:
1. CAPTION: Türkçe, samimi ve etkileşim odaklı bir gönderi metni (2-4 paragraf, emojilerle zenginleştirilmiş)
2. HASHTAGS: 10-15 alakalı hashtag (# işareti olmadan, virgülle ayır)

Format:
CAPTION:
[metin buraya]

HASHTAGS:
[hashtagler buraya]`,
    }],
    max_tokens: 600,
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const captionMatch = raw.match(/CAPTION:\s*([\s\S]*?)(?=HASHTAGS:|$)/i);
  const hashtagMatch = raw.match(/HASHTAGS:\s*([\s\S]*?)$/i);

  return {
    caption: captionMatch?.[1]?.trim() ?? raw,
    hashtags: hashtagMatch?.[1]?.trim() ?? '',
  };
}

// ─── Takvim bileşeni ─────────────────────────────────────────────────────────

function CalendarView({ posts, onSelect }: { posts: SocialPost[]; onSelect: (p: SocialPost) => void }) {
  const [current, setCurrent] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const postsByDay = new Map<number, SocialPost[]>();
  posts.forEach(p => {
    const dateStr = p.scheduledAt || p.publishedAt;
    if (!dateStr) return;
    try {
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const arr = postsByDay.get(day) ?? [];
        arr.push(p);
        postsByDay.set(day, arr);
      }
    } catch { /* skip */ }
  });

  const cells: (number | null)[] = [];
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = current.toLocaleString('tr-TR', { month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Navigasyon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer' }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel}</span>
        <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer' }}>›</button>
      </div>

      {/* Gün başlıkları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', fontWeight: 700, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Hücreler */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const dayPosts = postsByDay.get(day) ?? [];
          const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
          return (
            <div
              key={day}
              style={{
                minHeight: 64, padding: '4px 6px', borderRadius: 8,
                background: isToday ? 'var(--blue-dim)' : 'var(--bg3)',
                border: isToday ? '1px solid var(--blue)' : '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--blue)' : 'var(--text3)', marginBottom: 4 }}>{day}</div>
              {dayPosts.slice(0, 3).map(p => {
                const sc = statusCfg(p.status);
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelect(p)}
                    title={p.title}
                    style={{
                      fontSize: 10, padding: '2px 5px', borderRadius: 4, marginBottom: 2,
                      background: sc.bg, color: sc.color, cursor: 'pointer',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: 600,
                    }}
                  >
                    {p.platforms[0] ? platformIcon(p.platforms[0]) : ''} {p.title}
                  </div>
                );
              })}
              {dayPosts.length > 3 && (
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{dayPosts.length - 3}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Performans log formu ─────────────────────────────────────────────────────

function PerformanceLog({ post, onSaved }: { post: SocialPost; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<PostPerformance>>(post.performance ?? {});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await logPostPerformance(post.id, form);
    setSaving(false);
    setOpen(false);
    onSaved();
  };

  if (post.status !== 'published') return null;

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}
      >
        📊 {open ? 'Performans Kapatı' : post.performance ? 'Performansı Güncelle' : 'Performans Gir'}
      </button>

      {/* Mevcut metrikler */}
      {!open && post.performance && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          {PERF_FIELDS.filter(f => post.performance![f.key] !== undefined).map(f => (
            <div key={f.key} style={{ textAlign: 'center', padding: '6px 12px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 16 }}>{f.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{(post.performance![f.key] as number)?.toLocaleString('tr-TR')}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{f.label}</div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, padding: 16, background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
            {PERF_FIELDS.map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>{f.icon} {f.label}</label>
                <input
                  type="number"
                  min={0}
                  value={(form[f.key] as number) ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Kaydediliyor...' : 'Metrikleri Kaydet'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Ana sayfa ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', caption: '', platforms: [] as SocialPlatform[],
  hashtags: '', scheduledAt: '', notes: '', assignedTo: '',
  status: 'idea' as PostStatus, category: '' as PostCategory | '',
};

export default function SocialMediaPage() {
  const { adminUser } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [members, setMembers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<PostStatus | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<PostCategory | 'all'>('all');
  const [view, setView] = useState<'board' | 'list' | 'calendar'>('board');
  const [selected, setSelected] = useState<SocialPost | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const detailRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const [postList, memberList] = await Promise.all([getSocialPosts(), getAllAdminUsers()]);
    setPosts(postList);
    setMembers(memberList.filter(m => m.isActive));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Filtrelenmiş liste
  const filtered = posts.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!form.title.trim() || !adminUser) return;
    setSaving(true);
    const assignee = members.find(m => m.uid === form.assignedTo);
    await createSocialPost({
      title: form.title.trim(),
      caption: form.caption.trim(),
      platforms: form.platforms,
      status: form.status,
      category: form.category || undefined,
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

  const handleAICaption = async () => {
    if (!form.title.trim()) { setAiError('Önce bir başlık / konu yaz.'); return; }
    setAiLoading(true);
    setAiError('');
    try {
      const { caption, hashtags } = await generateCaption(form.title, form.platforms, form.category || undefined);
      setForm(f => ({ ...f, caption, hashtags }));
    } catch {
      setAiError('AI üretimi başarısız. OpenAI API anahtarını kontrol et.');
    }
    setAiLoading(false);
  };

  const handleStatusAdvance = async (post: SocialPost) => {
    const next = STATUS_NEXT[post.status];
    if (!next || !adminUser) return;
    const changes: Partial<SocialPost> = { status: next };
    if (next === 'approved') { changes.approvedBy = adminUser.uid; changes.approvedByName = adminUser.displayName ?? adminUser.email; }
    if (next === 'published') changes.publishedAt = new Date().toISOString();
    await updateSocialPost(post.id, changes);
    setPosts(ps => ps.map(p => p.id === post.id ? { ...p, ...changes } : p));
    setSelected(p => p?.id === post.id ? { ...p, ...changes } : p);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu içeriği silmek istiyor musun?')) return;
    await deleteSocialPost(id);
    setSelected(null);
    setPosts(ps => ps.filter(p => p.id !== id));
  };

  const openDetail = (post: SocialPost) => {
    setSelected(post);
    setShowForm(false);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  };

  // Board columns
  const boardColumns = STATUSES.map(s => ({ ...s, posts: filtered.filter(p => p.status === s.id) }));

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">📱 Sosyal Medya</h1>
          <p className="page-subtitle">İçerik planlama, onay akışı ve yayın takvimi</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['board', 'list', 'calendar'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              border: view === v ? '1px solid var(--blue)' : '1px solid var(--border)',
              background: view === v ? 'var(--blue-dim)' : 'var(--bg3)',
              color: view === v ? 'var(--blue)' : 'var(--text2)',
              fontWeight: view === v ? 700 : 400,
            }}>
              {v === 'board' ? '⬛ Kanban' : v === 'list' ? '☰ Liste' : '📅 Takvim'}
            </button>
          ))}
          <button className="btn-primary" onClick={() => { setShowForm(s => !s); setSelected(null); }}>
            {showForm ? '✕ Kapat' : '+ Yeni İçerik'}
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as PostStatus | 'all')}
          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12 }}
        >
          <option value="all">Tüm Durumlar</option>
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as PostCategory | 'all')}
          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12 }}
        >
          <option value="all">Tüm Kategoriler</option>
          {CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{filtered.length} içerik</span>
      </div>

      {/* Yeni içerik formu */}
      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 14 }}>Yeni İçerik Oluştur</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder="Başlık / Konu"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
            />

            {/* AI caption butonu */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                placeholder="Gönderi metni / caption"
                value={form.caption}
                onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                rows={4}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }}
              />
              <button
                onClick={handleAICaption}
                disabled={aiLoading}
                title="AI ile caption ve hashtag üret"
                style={{
                  padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: '1px solid var(--blue)', background: 'var(--blue-dim)', color: 'var(--blue)',
                  whiteSpace: 'nowrap', fontWeight: 600,
                }}
              >
                {aiLoading ? '⏳ Üretiyor...' : '🤖 AI Yaz'}
              </button>
            </div>
            {aiError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{aiError}</div>}

            <input
              placeholder="Hashtagler (virgül veya boşlukla ayır)"
              value={form.hashtags}
              onChange={e => setForm(f => ({ ...f, hashtags: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
            />

            {/* Platformlar */}
            <div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Platformlar</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PLATFORMS.map(p => (
                  <button key={p.id} onClick={() => setForm(f => ({
                    ...f, platforms: f.platforms.includes(p.id) ? f.platforms.filter(x => x !== p.id) : [...f.platforms, p.id],
                  }))} style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${form.platforms.includes(p.id) ? p.color : 'var(--border)'}`,
                    background: form.platforms.includes(p.id) ? p.color + '22' : 'var(--bg3)',
                    color: form.platforms.includes(p.id) ? p.color : 'var(--text2)',
                    fontWeight: form.platforms.includes(p.id) ? 700 : 400,
                  }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as PostCategory | '' }))}
                style={{ flex: '1 1 150px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}>
                <option value="">Kategori seç</option>
                {CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as PostStatus }))}
                style={{ flex: '1 1 130px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                style={{ flex: '1 1 150px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}>
                <option value="">Kişi ata</option>
                {members.map(m => <option key={m.uid} value={m.uid}>{m.displayName ?? m.email.split('@')[0]}</option>)}
              </select>
              <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                style={{ flex: '1 1 180px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }} />
            </div>

            <textarea placeholder="Notlar" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }} />

            <button className="btn-primary" onClick={handleCreate} disabled={saving || !form.title.trim()}>
              {saving ? 'Kaydediliyor...' : 'İçeriği Kaydet'}
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="loading">Yükleniyor...</div> : (
        <>
          {/* Kanban */}
          {view === 'board' && (
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16 }}>
              {boardColumns.map(col => (
                <div key={col.id} style={{ minWidth: 220, flex: '0 0 220px' }}>
                  <div style={{ padding: '5px 10px', borderRadius: 8, marginBottom: 8, background: col.bg, color: col.color, fontWeight: 700, fontSize: 12, border: `1px solid ${col.color}44` }}>
                    {col.label} ({col.posts.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.posts.map(post => (
                      <div key={post.id} onClick={() => openDetail(post)} className="card"
                        style={{ padding: '10px 12px', cursor: 'pointer', border: selected?.id === post.id ? '1px solid var(--blue)' : undefined }}>
                        {post.category && (
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{POST_CATEGORY_LABELS[post.category]}</div>
                        )}
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{post.title}</div>
                        <div style={{ display: 'flex', gap: 4 }}>{post.platforms.map(p => <span key={p} style={{ fontSize: 13 }}>{platformIcon(p)}</span>)}</div>
                        {post.scheduledAt && <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 4 }}>📅 {formatDate(post.scheduledAt)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Liste */}
          {view === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.length === 0 && <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 40 }}>İçerik bulunamadı</div>}
              {filtered.map(post => {
                const sc = statusCfg(post.status);
                return (
                  <div key={post.id} onClick={() => openDetail(post)} className="card"
                    style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, border: selected?.id === post.id ? '1px solid var(--blue)' : undefined }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{post.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {post.category ? POST_CATEGORY_LABELS[post.category] + ' · ' : ''}{post.createdByName}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>{post.platforms.map(p => <span key={p} style={{ fontSize: 15 }}>{platformIcon(p)}</span>)}</div>
                    {post.scheduledAt && <div style={{ fontSize: 11, color: 'var(--blue)', whiteSpace: 'nowrap' }}>📅 {formatDate(post.scheduledAt)}</div>}
                    <div style={{ fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>{sc.label}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Takvim */}
          {view === 'calendar' && (
            <div className="card" style={{ padding: 20 }}>
              <CalendarView posts={posts} onSelect={openDetail} />
            </div>
          )}
        </>
      )}

      {/* Detay paneli */}
      {selected && (
        <div ref={detailRef} className="card" style={{ padding: 20, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <h2 style={{ fontWeight: 700, fontSize: 17 }}>{selected.title}</h2>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                {selected.createdByName} · {formatDate(selected.createdAt)}
                {selected.assignedName && ` · 👤 ${selected.assignedName}`}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>✕</button>
          </div>

          {/* Durum + kategori + platformlar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusCfg(selected.status).color, background: statusCfg(selected.status).bg, padding: '4px 12px', borderRadius: 20 }}>
              {statusCfg(selected.status).label}
            </span>
            {selected.category && (
              <span style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg3)', padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)' }}>
                {POST_CATEGORY_LABELS[selected.category]}
              </span>
            )}
            {selected.platforms.map(p => {
              const cfg = PLATFORMS.find(x => x.id === p)!;
              return <span key={p} style={{ fontSize: 12, color: cfg.color, background: cfg.color + '18', padding: '4px 10px', borderRadius: 20 }}>{cfg.icon} {cfg.label}</span>;
            })}
          </div>

          {selected.caption && (
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {selected.caption}
            </div>
          )}

          {selected.hashtags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {selected.hashtags.map(h => (
                <span key={h} style={{ fontSize: 12, color: 'var(--blue)', background: 'var(--blue-dim)', padding: '2px 8px', borderRadius: 12 }}>#{h}</span>
              ))}
            </div>
          )}

          {selected.scheduledAt && <div style={{ fontSize: 13, color: 'var(--blue)', marginBottom: 8 }}>📅 Planlandı: {formatDate(selected.scheduledAt)}</div>}
          {selected.publishedAt && <div style={{ fontSize: 13, color: 'var(--green)', marginBottom: 8 }}>🚀 Yayınlandı: {formatDate(selected.publishedAt)}</div>}
          {selected.approvedByName && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>✅ Onaylayan: {selected.approvedByName}</div>}
          {selected.notes && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, fontStyle: 'italic' }}>📝 {selected.notes}</div>}

          {/* Aksiyonlar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {STATUS_NEXT[selected.status] && (
              <button className="btn-primary" onClick={() => handleStatusAdvance(selected)}>
                {selected.status === 'review' ? '✅ Onayla' : selected.status === 'approved' ? '📅 Planla' : selected.status === 'scheduled' ? '🚀 Yayınlandı' : '→ İlerlet'}
              </button>
            )}
            {adminUser?.role === 'owner' && (
              <button onClick={() => handleDelete(selected.id)}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--red)', background: '#ff000011', color: 'var(--red)', cursor: 'pointer', fontSize: 13 }}>
                🗑 Sil
              </button>
            )}
          </div>

          {/* Performans log */}
          <PerformanceLog post={selected} onSaved={async () => { await load(); const updated = posts.find(p => p.id === selected.id); if (updated) setSelected(updated); }} />
        </div>
      )}
    </div>
  );
}
