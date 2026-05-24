import { useState, type FormEvent } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';

const ALLOWED_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string;

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState(ALLOWED_EMAIL);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (email !== ALLOWED_EMAIL) {
      setRegError('Sadece yetkili email ile kayıt olunabilir.');
      return;
    }
    setRegLoading(true);
    setRegError('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setRegSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      if (msg.includes('email-already-in-use')) {
        setRegError('Bu email zaten kayıtlı — giriş yap.');
        setMode('login');
      } else {
        setRegError(msg);
      }
    } finally {
      setRegLoading(false);
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
          <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Sadece yetkili admin erişimi</div>
        </div>

        {/* Sekme */}
        <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: '12px 12px 0 0', border: '1px solid var(--border)', borderBottom: 'none' }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setRegError(''); }}
              style={{
                flex: 1, padding: '12px', fontSize: 13, fontWeight: 600,
                borderRadius: m === 'login' ? '12px 0 0 0' : '0 12px 0 0',
                background: mode === m ? 'var(--bg3)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text3)',
                borderBottom: mode === m ? '2px solid var(--blue)' : 'none',
              }}
            >
              {m === 'login' ? '🔐 Giriş Yap' : '✨ İlk Kurulum'}
            </button>
          ))}
        </div>

        <form
          onSubmit={mode === 'login' ? handleLogin : handleRegister}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '0 0 16px 16px', padding: 28 }}
        >
          {(error || regError) && (
            <div className="validation-box validation-error" style={{ marginBottom: 16 }}>
              {error || regError}
            </div>
          )}
          {regSuccess && (
            <div className="validation-box validation-ok" style={{ marginBottom: 16 }}>
              ✅ Hesap oluşturuldu! Şimdi giriş yap.
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="kurdigo.ca@gmail.com"
              required autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Şifre {mode === 'register' && <span style={{ color: 'var(--text3)', fontSize: 11 }}>(min 6 karakter)</span>}</label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={6}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || regLoading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
          >
            {loading || regLoading ? '⏳ Bekle...'
              : mode === 'login' ? '🔐 Giriş Yap'
              : '✨ Hesap Oluştur'}
          </button>

          {mode === 'register' && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, textAlign: 'center' }}>
              Sadece <strong>{ALLOWED_EMAIL}</strong> ile kayıt olunabilir.
            </div>
          )}
        </form>

        <div style={{ textAlign: 'center', marginTop: 16, color: 'var(--text3)', fontSize: 12 }}>
          localhost:3001 — Yalnızca yerel erişim
        </div>
      </div>
    </div>
  );
}
