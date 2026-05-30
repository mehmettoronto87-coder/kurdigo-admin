import { NavLink, useLocation } from 'react-router-dom';
import type { AdminUser } from '../types/admin';
import { ROLE_LABELS, ROLE_PANELS } from '../types/admin';

interface Props {
  adminUser: AdminUser | null;
  onLogout: () => void;
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: string;
  panel: string;
  exact?: boolean;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Genel',
    items: [
      { path: '/', label: 'Dashboard', icon: '📊', panel: 'dashboard', exact: true },
    ],
  },
  {
    title: 'İçerik',
    items: [
      { path: '/curriculum', label: 'Müfredat', icon: '📚', panel: 'curriculum' },
      { path: '/ai-generator', label: 'AI Üretici', icon: '🤖', panel: 'ai-generator' },
      { path: '/scene-library', label: 'Ortam Kütüphanesi', icon: '🖼️', panel: 'scene-library' },
      { path: '/vocab-image-pipeline', label: 'Görsel Pipeline', icon: '🎨', panel: 'scene-library' },
    ],
  },
  {
    title: 'Operasyon',
    items: [
      { path: '/social-media', label: 'Sosyal Medya', icon: '📱', panel: 'social-media' },
      { path: '/advertising', label: 'Reklam', icon: '📣', panel: 'advertising' },
      { path: '/accounting', label: 'Muhasebe', icon: '💰', panel: 'accounting' },
      { path: '/support', label: 'Destek Talepleri', icon: '🎧', panel: 'support' },
    ],
  },
  {
    title: 'Ekip',
    items: [
      { path: '/team', label: 'Ekip', icon: '👥', panel: 'team' },
      { path: '/messages', label: 'Mesajlar', icon: '💬', panel: 'team' },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { path: '/settings',         label: 'Ayarlar',         icon: '⚙️', panel: 'settings' },
    ],
  },
];

export default function Layout({ adminUser, onLogout, children }: Props) {
  const location = useLocation();
  const allowedPanels = adminUser ? ROLE_PANELS[adminUser.role] : [];

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
          {NAV_SECTIONS.map(section => {
            const visible = section.items.filter(i => allowedPanels.includes(i.panel));
            if (!visible.length) return null;

            return (
              <div key={section.title}>
                <div className="sidebar-section-title">{section.title}</div>
                {visible.map(item => (
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
              </div>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">
            {adminUser?.displayName?.[0]?.toUpperCase() ?? adminUser?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {adminUser?.displayName ?? adminUser?.email?.split('@')[0]}
            </div>
            <div className="user-name">
              {adminUser ? ROLE_LABELS[adminUser.role] : ''}
            </div>
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
