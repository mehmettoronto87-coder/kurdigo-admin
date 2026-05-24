import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getSupportTickets, updateTicketStatus, updateTicketPriority,
  assignTicket, replyToTicket,
} from '../lib/adminFirestore';
import type { SupportTicket, TicketStatus, TicketPriority } from '../types/admin';

const STATUS_CFG: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  open:        { label: 'Açık',        color: 'var(--blue)',   bg: 'var(--blue-dim)' },
  in_progress: { label: 'İşlemde',     color: 'var(--orange)', bg: 'var(--orange-dim)' },
  resolved:    { label: 'Çözüldü',     color: 'var(--green)',  bg: 'var(--green-dim)' },
  closed:      { label: 'Kapatıldı',   color: 'var(--text3)',  bg: 'var(--bg4)' },
};

const PRIORITY_CFG: Record<TicketPriority, { label: string; color: string }> = {
  low:    { label: '🟢 Düşük',   color: 'var(--green)' },
  medium: { label: '🟡 Orta',    color: 'var(--yellow)' },
  high:   { label: '🔴 Yüksek',  color: 'var(--red)' },
};

export default function SupportPage() {
  const { adminUser } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TicketStatus | 'all'>('all');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const load = async () => {
    setLoading(true);
    const list = await getSupportTickets(filter === 'all' ? undefined : filter);
    setTickets(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleReply = async () => {
    if (!selected || !replyText.trim() || !adminUser) return;
    setReplying(true);
    await replyToTicket(
      selected.id,
      adminUser.uid,
      adminUser.displayName ?? adminUser.email,
      replyText.trim(),
    );
    setReplyText('');
    await load();
    // Güncel ticket'ı bul ve seçili tut
    const updated = tickets.find(t => t.id === selected.id);
    if (updated) setSelected(updated);
    setReplying(false);
  };

  const handleStatusChange = async (ticketId: string, status: TicketStatus) => {
    await updateTicketStatus(ticketId, status);
    setTickets(t => t.map(tk => tk.id === ticketId ? { ...tk, status } : tk));
    if (selected?.id === ticketId) setSelected(s => s ? { ...s, status } : s);
  };

  const handleAssign = async (ticketId: string) => {
    if (!adminUser) return;
    await assignTicket(ticketId, adminUser.uid, adminUser.displayName ?? adminUser.email);
    setTickets(t => t.map(tk => tk.id === ticketId ? { ...tk, assignedTo: adminUser.uid, assignedName: adminUser.displayName ?? adminUser.email, status: 'in_progress' } : tk));
    if (selected?.id === ticketId) setSelected(s => s ? { ...s, status: 'in_progress' } : s);
  };

  const openTickets  = tickets.filter(t => t.status === 'open').length;
  const inProgress   = tickets.filter(t => t.status === 'in_progress').length;

  return (
    <div className="page">
      <h1 className="page-title">🎧 Destek Talepleri</h1>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Açık Talepler</div>
          <div className="stat-value" style={{ color: 'var(--blue)', fontSize: 28 }}>{openTickets}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">İşlemde</div>
          <div className="stat-value" style={{ color: 'var(--orange)', fontSize: 28 }}>{inProgress}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Toplam</div>
          <div className="stat-value" style={{ fontSize: 28 }}>{tickets.length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 16 }}>
        {/* Liste */}
        <div>
          {/* Filtre */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
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
                {s === 'all' ? 'Tümü' : STATUS_CFG[s as TicketStatus].label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="loading">Yükleniyor...</div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40, fontSize: 15 }}>
              Talep bulunamadı
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tickets.map(ticket => {
                const sc = STATUS_CFG[ticket.status];
                const pc = PRIORITY_CFG[ticket.priority];
                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelected(selected?.id === ticket.id ? null : ticket)}
                    className="card"
                    style={{
                      padding: '12px 16px', cursor: 'pointer',
                      border: selected?.id === ticket.id ? '1px solid var(--blue)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: sc.color,
                        background: sc.bg, borderRadius: 5, padding: '2px 8px',
                      }}>{sc.label}</span>
                      <span style={{ fontSize: 11, color: pc.color }}>{pc.label}</span>
                      {ticket.assignedName && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
                          👤 {ticket.assignedName}
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ticket.subject}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      {ticket.userName} · {ticket.replies.length} yanıt
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detay paneli */}
        {selected && (
          <div className="card" style={{ padding: 20, height: 'fit-content', position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.subject}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {selected.userName} · {selected.userEmail}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)' }}>✕</button>
            </div>

            {/* Aksiyonlar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {selected.assignedTo !== adminUser?.uid && (
                <button className="btn btn-primary btn-sm" onClick={() => handleAssign(selected.id)}>
                  Üstlen
                </button>
              )}
              <select
                value={selected.status}
                onChange={e => handleStatusChange(selected.id, e.target.value as TicketStatus)}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 12,
                  border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)',
                }}
              >
                {Object.entries(STATUS_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select
                value={selected.priority}
                onChange={async e => {
                  const p = e.target.value as TicketPriority;
                  await updateTicketPriority(selected.id, p);
                  setSelected(s => s ? { ...s, priority: p } : s);
                }}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 12,
                  border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)',
                }}
              >
                {Object.entries(PRIORITY_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            {/* Mesajlar */}
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, marginBottom: 12, maxHeight: 300, overflowY: 'auto' }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Kullanıcı mesajı</div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{selected.message}</div>
              </div>
              {selected.replies.map((r, i) => (
                <div key={i} style={{
                  borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>
                    👤 {r.displayName}
                  </div>
                  <div style={{ fontSize: 13 }}>{r.text}</div>
                </div>
              ))}
            </div>

            {/* Yanıt kutusu */}
            <textarea
              placeholder="Yanıt yaz..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text)', fontSize: 13, resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <button
              className="btn-primary"
              onClick={handleReply}
              disabled={replying || !replyText.trim()}
              style={{ marginTop: 8, width: '100%' }}
            >
              {replying ? 'Gönderiliyor...' : 'Yanıtla'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
