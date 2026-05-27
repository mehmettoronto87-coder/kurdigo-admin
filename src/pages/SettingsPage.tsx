import { useEffect, useState } from 'react';
import { getAdminUsers, saveAdminUser, deleteAdminUser } from '../lib/firestore';
import { getProjectSettings, saveProjectSettings, invalidateProjectSettingsCache } from '../lib/projectSettings';
import { useAuth } from '../hooks/useAuth';
import type { AdminUser, AdminRole } from '../types/admin';

export default function SettingsPage() {
  const { adminUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('editor');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const isOwner = adminUser?.role === 'owner';

  const [imageBrief, setImageBrief] = useState('');
  const [textQualityRules, setTextQualityRules] = useState('');
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefSaving, setBriefSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    getAdminUsers().then(us => { setUsers(us); setLoading(false); });
  }, []);

  useEffect(() => {
    getProjectSettings().then(s => {
      setImageBrief(s.imageBrief ?? '');
      setTextQualityRules(s.textQualityRules ?? '');
      setBriefLoading(false);
    }).catch(() => setBriefLoading(false));
  }, []);

  const handleSaveBrief = async () => {
    setBriefSaving(true);
    try {
      await saveProjectSettings({ imageBrief, textQualityRules });
      invalidateProjectSettingsCache();
      showToast('✅ Proje kısıtları kaydedildi');
    } catch {
      showToast('❌ Kaydedilemedi');
    } finally {
      setBriefSaving(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === adminUser?.uid) { showToast('❌ Kendi hesabını silemezsin'); return; }
    if (!confirm('Bu kullanıcıyı silmek istediğine emin misin?')) return;
    await deleteAdminUser(uid);
    setUsers(us => us.filter(u => u.uid !== uid));
    showToast('✅ Kullanıcı silindi');
  };

  const handleChangeRole = async (uid: string, role: AdminRole) => {
    const user = users.find(u => u.uid === uid);
    if (!user) return;
    await saveAdminUser({ ...user, role });
    setUsers(us => us.map(u => u.uid === uid ? { ...u, role } : u));
    showToast('✅ Rol güncellendi');
  };

  const handleAddUser = async () => {
    if (!newEmail) return;
    setSaving(true);
    const newUser: AdminUser = {
      uid: `invited_${Date.now()}`,
      email: newEmail,
      role: newRole,
      createdAt: new Date().toISOString(),
    };
    await saveAdminUser(newUser);
    setUsers(us => [...us, newUser]);
    setShowAddModal(false);
    setNewEmail('');
    setSaving(false);
    showToast('✅ Kullanıcı eklendi — Firebase Auth ile giriş yapabilirler');
  };

  return (
    <div className="page" style={{ maxWidth: 800 }}>
      <div className="page-header">
        <h1 className="page-title">⚙️ Ayarlar</h1>
        <p className="page-subtitle">Admin kullanıcı yönetimi ve sistem ayarları</p>
      </div>

      {/* Kullanıcı Yönetimi */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>👤 Admin Kullanıcılar</h2>
          {isOwner && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
              + Kullanıcı Ekle
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading">Yükleniyor...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>İsim</th>
                  <th>Rol</th>
                  <th>Eklenme Tarihi</th>
                  {isOwner && <th>Aksiyonlar</th>}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.uid}>
                    <td>
                      {u.email}
                      {u.uid === adminUser?.uid && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green)', background: 'var(--green-dim)', padding: '1px 6px', borderRadius: 10 }}>
                          Sen
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{u.displayName ?? '—'}</td>
                    <td>
                      {isOwner && u.uid !== adminUser?.uid ? (
                        <select
                          value={u.role}
                          onChange={e => handleChangeRole(u.uid, e.target.value as AdminRole)}
                          style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                        >
                          <option value="owner">👑 Sahip</option>
                          <option value="editor">✏️ Editör</option>
                        </select>
                      ) : (
                        <span style={{ color: u.role === 'owner' ? 'var(--yellow)' : 'var(--blue)' }}>
                          {u.role === 'owner' ? '👑 Sahip' : '✏️ Editör'}
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('tr-TR') : '—'}
                    </td>
                    {isOwner && (
                      <td>
                        {u.uid !== adminUser?.uid && (
                          <button
                            className="btn btn-red btn-sm"
                            onClick={() => handleDeleteUser(u.uid)}
                          >
                            🗑️ Sil
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Proje AI Kısıtları */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🎨 Proje AI Kısıtları</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
          Bu alanlarda yazılanlar <strong>tüm AI üretimlerine</strong> otomatik eklenir.
          Görsel kısmı her image prompt'unun başına, yazılı kısmı sistem prompt'una enjekte edilir.
          Buraya tek bir kez yaz — tüm prompt kutuları bu hafızayı paylaşır.
        </p>

        {briefLoading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Yükleniyor...</div>
        ) : (
          <>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ marginBottom: 6, display: 'block', fontWeight: 700 }}>
                🖼️ Görsel Stil Kısıtı
                <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>
                  — image prompt'larına prepend edilir
                </span>
              </label>
              <textarea
                value={imageBrief}
                onChange={e => setImageBrief(e.target.value)}
                rows={7}
                placeholder={`Örnek:\nKURDIGO STYLE GUIDE — follow exactly:\n- 3D cartoon illustration, warm soft lighting, Pixar-quality render\n- Characters: BARAN (24yo, curly black hair, blue shirt, friendly learner) and BERFIN (26yo, long black hair, mint green dress, journalist)\n- KURDO mascot: gender-neutral yellow-orange 3D plush bird, RED KNITTED KURDISH SCARF always visible\n- Square 1024x1024, mobile-readable, single concept, no text/logo/watermark\n- Kurdish/Diyarbakir atmosphere: stone alleys, bazaar, warm family interiors`}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7, resize: 'vertical' }}
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Karakterleri (BARAN, BERFIN, KURDO) ve stil tercihini (3D çizgi film / gerçekçi / flat design) buraya yaz.
                Artık her görselde aynı stili göreceksin.
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ marginBottom: 6, display: 'block', fontWeight: 700 }}>
                📝 Ek Kürtçe Metin Kuralları
                <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 8 }}>
                  — sistem prompt'una eklenir
                </span>
              </label>
              <textarea
                value={textQualityRules}
                onChange={e => setTextQualityRules(e.target.value)}
                rows={5}
                placeholder={`Örnek:\n- Bu ünitede şehir isimleri: Amed (Diyarbakır), Wan (Van), Mêrdîn (Mardin) kullan.\n- Diyalog cümlelerinde günlük konuşma dili kullan, resmi yazı dili değil.\n- Bu ünitede sadece Botî lehçesini kullan (veya Badini, Sorani değil).`}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7, resize: 'vertical' }}
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Dilbilgisi kuralları, lehçe tercihleri veya içerik odağını buraya yaz.
                Zaten aktif olan AI-ERR kurallarına ek olarak uygulanır.
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSaveBrief}
              disabled={briefSaving}
              style={{ minWidth: 140 }}
            >
              {briefSaving ? '⏳ Kaydediliyor...' : '💾 Kaydet'}
            </button>
          </>
        )}
      </div>

      {/* Sistem Bilgisi */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>ℹ️ Sistem Bilgisi</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Firebase Projesi', value: 'kurdish-app-ea16a' },
            { label: 'Admin URL', value: 'localhost:3001' },
            { label: 'Erişim', value: 'Sadece localhost' },
            { label: 'AI Model', value: 'GPT-4o' },
            { label: 'Müfredat', value: '60 ünite × 5 ders = 300 ders' },
            { label: 'Versiyonu', value: '1.0.0' },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--bg4)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Kürmanci Politika Hatırlatması */}
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📋 Kürmanci Dil Kuralları</h2>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
          <div><strong style={{ color: 'var(--red)' }}>YASAK KARAKTERLER:</strong> ğ, Ğ, ı, İ, ö, Ö, ü, Ü (Türkçe karakterler)</div>
          <div><strong style={{ color: 'var(--green)' }}>ZORUNLU DİYAKRİTİKLER:</strong> ç, ê, î, ş, û, x, q, w</div>
          <div><strong style={{ color: 'var(--blue)' }}>COPULA:</strong> ez→im, tu→î, ew→e, em→in, hûn→in</div>
          <div style={{ marginTop: 8 }}>
            AI üretiminde tüm kurallar otomatik uygulanır. Editörde düzenlerken dikkat et.
          </div>
        </div>
      </div>

      {/* Kullanıcı Ekleme Modalı */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">+ Yeni Admin Kullanıcı</h2>
            <div className="form-group">
              <label className="form-label">Email Adresi</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="calisan@kurdigo.ca"
                autoFocus
              />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Bu kişi Firebase Auth ile kendi şifresini oluşturmalı.
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Rol</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value as AdminRole)}>
                <option value="editor">✏️ Editör — Ders oluşturabilir, onaylayamaz</option>
                <option value="owner">👑 Sahip — Tam yetki</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleAddUser} disabled={saving}>
                {saving ? '⏳' : '✅'} Ekle
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.startsWith('❌') ? 'toast-error' : 'toast-success'}`}>{toast}</div>}
    </div>
  );
}
