import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getAllAdminUsers, inviteAdminByEmail, updateAdminRole, deactivateAdmin, activateAdmin } from '../lib/adminFirestore';
import type { AdminUser, AdminRole } from '../types/admin';
import { ROLE_LABELS } from '../types/admin';

const ROLES: AdminRole[] = ['owner', 'content_editor', 'social_media', 'advertising', 'accounting', 'support_agent'];

const ROLE_COLORS: Record<AdminRole, string> = {
  owner:          'var(--yellow)',
  content_editor: 'var(--blue)',
  social_media:   'var(--purple)',
  advertising:    'var(--orange)',
  accounting:     'var(--green)',
  support_agent:  'var(--text2)',
};

export default function TeamPage() {
  const { adminUser } = useAuth();
  const isOwner = adminUser?.role === 'owner';

  const [members, setMembers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>('content_editor');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [editingUid, setEditingUid] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await getAllAdminUsers();
    setMembers(list.sort((a, b) => {
      const order: AdminRole[] = ['owner', 'content_editor', 'social_media', 'advertising', 'accounting', 'support_agent'];
      return order.indexOf(a.role) - order.indexOf(b.role);
    }));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg('');
    try {
      await inviteAdminByEmail(inviteEmail.trim(), inviteRole, adminUser!.uid);
      setInviteMsg('✅ Kullanıcı başarıyla eklendi.');
      setInviteEmail('');
      await load();
    } catch (err) {
      setInviteMsg(`❌ ${err instanceof Error ? err.message : 'Hata oluştu.'}`);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (uid: string, role: AdminRole) => {
    await updateAdminRole(uid, role);
    setMembers(m => m.map(u => u.uid === uid ? { ...u, role } : u));
    setEditingUid(null);
  };

  const handleToggleActive = async (member: AdminUser) => {
    if (member.uid === adminUser?.uid) return;
    if (member.isActive) {
      await deactivateAdmin(member.uid);
    } else {
      await activateAdmin(member.uid);
    }
    setMembers(m => m.map(u => u.uid === member.uid ? { ...u, isActive: !u.isActive } : u));
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">👥 Ekip</h1>
          <p className="page-subtitle">Admin paneline erişimi olan tüm ekip üyeleri</p>
        </div>
      </div>

      {/* Davet formu — sadece owner */}
      {isOwner && (
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Yeni Üye Ekle</h2>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            KurdîGo hesabı olan bir kullanıcının email adresiyle ekleyebilirsin.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder="ornek@email.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              style={{
                flex: '1 1 200px', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text)', fontSize: 14,
              }}
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as AdminRole)}
              style={{
                padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text)', fontSize: 14,
              }}
            >
              {ROLES.filter(r => r !== 'owner').map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button
              className="btn-primary"
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              style={{ minWidth: 120 }}
            >
              {inviting ? 'Ekleniyor...' : '+ Ekle'}
            </button>
          </div>
          {inviteMsg && (
            <div style={{ marginTop: 10, fontSize: 13, color: inviteMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>
              {inviteMsg}
            </div>
          )}
        </div>
      )}

      {/* Ekip listesi */}
      {loading ? (
        <div className="loading">Yükleniyor...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {members.map(member => (
            <div
              key={member.uid}
              className="card"
              style={{
                padding: 18,
                opacity: member.isActive ? 1 : 0.5,
                border: member.uid === adminUser?.uid ? '1px solid var(--blue)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', fontSize: 18,
                  background: ROLE_COLORS[member.role] + '22',
                  border: `2px solid ${ROLE_COLORS[member.role]}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, color: ROLE_COLORS[member.role],
                  flexShrink: 0,
                }}>
                  {member.displayName?.[0]?.toUpperCase() ?? member.email[0]?.toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.displayName ?? member.email.split('@')[0]}
                    {member.uid === adminUser?.uid && <span style={{ fontSize: 11, color: 'var(--blue)', marginLeft: 6 }}>(sen)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.email}
                  </div>
                </div>
              </div>

              {/* Rol */}
              {isOwner && member.uid !== adminUser?.uid && editingUid === member.uid ? (
                <select
                  value={member.role}
                  onChange={e => handleRoleChange(member.uid, e.target.value as AdminRole)}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg3)',
                    color: 'var(--text)', fontSize: 13, marginBottom: 10,
                  }}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              ) : (
                <div style={{
                  display: 'inline-block', fontSize: 12, fontWeight: 600,
                  color: ROLE_COLORS[member.role], background: ROLE_COLORS[member.role] + '18',
                  borderRadius: 6, padding: '3px 10px', marginBottom: 10,
                }}>
                  {ROLE_LABELS[member.role]}
                </div>
              )}

              {/* Owner butonları */}
              {isOwner && member.uid !== adminUser?.uid && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setEditingUid(editingUid === member.uid ? null : member.uid)}
                    style={{
                      flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 12,
                      border: '1px solid var(--border)', background: 'var(--bg3)',
                      color: 'var(--text2)', cursor: 'pointer',
                    }}
                  >
                    {editingUid === member.uid ? 'İptal' : '✏️ Rol Değiştir'}
                  </button>
                  <button
                    onClick={() => handleToggleActive(member)}
                    style={{
                      flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 12,
                      border: '1px solid var(--border)',
                      background: member.isActive ? 'var(--red-dim)' : 'var(--green-dim)',
                      color: member.isActive ? 'var(--red)' : 'var(--green)',
                      cursor: 'pointer',
                    }}
                  >
                    {member.isActive ? '🚫 Devre Dışı' : '✅ Aktif Et'}
                  </button>
                </div>
              )}

              {!member.isActive && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)', textAlign: 'center' }}>
                  Hesap devre dışı
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
