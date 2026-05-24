import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    login(email, password);
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

        <form
          onSubmit={handleLogin}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}
        >
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
        </form>
      </div>
    </div>
  );
}
