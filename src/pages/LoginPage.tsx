import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login, resetPassword, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      setResetError('Email adresinizi girin.');
      return;
    }
    setResetLoading(true);
    setResetError(null);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch {
      setResetError('Bu email adresi kayıtlı değil veya bir hata oluştu.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🐦</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>KurdîGo Admin</div>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Yetkili ekip girişi</div>
        </div>

        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
          {!forgotMode ? (
            <form onSubmit={handleLogin}>
              {error && (
                <div className="validation-box validation-error" style={{ marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ornek@email.com"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Şifre</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              >
                {loading ? '⏳ Bekle...' : '🔐 Giriş Yap'}
              </button>

              <button
                type="button"
                onClick={() => { setForgotMode(true); setResetSent(false); setResetError(null); }}
                style={{
                  width: '100%', marginTop: 12, background: 'none', border: 'none',
                  color: 'var(--text2)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                Şifremi unuttum
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Şifre Sıfırlama</div>
                <div style={{ color: 'var(--text2)', fontSize: 13 }}>
                  Email adresinize sıfırlama bağlantısı gönderilecek.
                </div>
              </div>

              {resetSent ? (
                <div className="validation-box validation-ok" style={{ marginBottom: 16 }}>
                  Sıfırlama bağlantısı gönderildi. Email kutunuzu kontrol edin.
                </div>
              ) : (
                <>
                  {resetError && (
                    <div className="validation-box validation-error" style={{ marginBottom: 16 }}>
                      {resetError}
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="ornek@email.com"
                      required
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={resetLoading}
                    style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                  >
                    {resetLoading ? '⏳ Gönderiliyor...' : '📧 Sıfırlama Linki Gönder'}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setForgotMode(false)}
                style={{
                  width: '100%', marginTop: 12, background: 'none', border: 'none',
                  color: 'var(--text2)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                Geri dön
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
