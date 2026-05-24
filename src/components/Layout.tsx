import { NavLink, useLocation } from 'react-router-dom';
import type { AdminUser } from '../types/admin';

interface Props {
  adminUser: AdminUser | null;
  onLogout: () => void;
  children: React.ReactNode;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊', exact: true },
  { path: '/curriculum', label: 'Müfredat', icon: '📚' },
  { path: '/ai-generator', label: 'AI Üretici', icon: '🤖' },
  { path: '/scene-library', label: 'Ortam Kütüphanesi', icon: '🖼️' },
];

const settingsItems = [
  { path: '/settings', label: 'Ayarlar', icon: '⚙️' },
];

export default function Layout({ adminUser, onLogout, children }: Props) {
  const location = useLocation();

  const roleBadge = adminUser?.role === 'owner' ? '👑 Sahip' : '✏️ Editör';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🐦</span>
          <div>
            <div className="logo-text">KurdîGo</div>
            <div className="logo-sub">Admin Panel</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">İçerik</div>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `nav-item${isActive || (!item.exact && location.pathname.startsWith(item.path)) ? ' active' : ''}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          <div className="sidebar-section-title" style={{ marginTop: 12 }}>Sistem</div>
          {settingsItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">
            {adminUser?.displayName?.[0]?.toUpperCase() ?? adminUser?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <div className="user-name" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
              {adminUser?.displayName ?? adminUser?.email?.split('@')[0]}
            </div>
            <div className="user-name">{roleBadge}</div>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Çıkış Yap">🚪</button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
