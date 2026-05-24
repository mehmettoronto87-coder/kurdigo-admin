import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ROLE_PANELS } from './types/admin';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CurriculumPage from './pages/CurriculumPage';
import LessonEditorPage from './pages/LessonEditorPage';
import AIGeneratorPage from './pages/AIGeneratorPage';
import SceneLibraryPage from './pages/SceneLibraryPage';
import SettingsPage from './pages/SettingsPage';
import TeamPage from './pages/TeamPage';
import SupportPage from './pages/SupportPage';
import MessagesPage from './pages/MessagesPage';
import ComingSoonPage from './pages/ComingSoonPage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Yükleniyor...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading, adminUser, logout } = useAuth();
  const allowed = adminUser ? ROLE_PANELS[adminUser.role] : [];

  if (loading) return <div className="loading" style={{ height: '100vh', fontSize: 16 }}>🐦 KurdîGo Admin yükleniyor...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <Layout adminUser={adminUser} onLogout={logout}>
                <Routes>
                  {/* Dashboard */}
                  {allowed.includes('dashboard') && <Route path="/" element={<DashboardPage />} />}

                  {/* İçerik */}
                  {allowed.includes('curriculum') && <Route path="/curriculum" element={<CurriculumPage />} />}
                  {allowed.includes('curriculum') && <Route path="/curriculum/:unitId" element={<LessonEditorPage />} />}
                  {allowed.includes('ai-generator') && <Route path="/ai-generator" element={<AIGeneratorPage />} />}
                  {allowed.includes('scene-library') && <Route path="/scene-library" element={<SceneLibraryPage />} />}

                  {/* Operasyon */}
                  {allowed.includes('social-media') && <Route path="/social-media" element={<ComingSoonPage title="Sosyal Medya" icon="📱" />} />}
                  {allowed.includes('advertising') && <Route path="/advertising" element={<ComingSoonPage title="Reklam Yönetimi" icon="📣" />} />}
                  {allowed.includes('accounting') && <Route path="/accounting" element={<ComingSoonPage title="Muhasebe" icon="💰" />} />}
                  {allowed.includes('support') && <Route path="/support" element={<SupportPage />} />}

                  {/* Ekip */}
                  {allowed.includes('team') && <Route path="/team" element={<TeamPage />} />}
                  {allowed.includes('team') && <Route path="/messages" element={<MessagesPage />} />}

                  {/* Sistem */}
                  {allowed.includes('settings') && <Route path="/settings" element={<SettingsPage />} />}

                  {/* Varsayılan yönlendirme */}
                  <Route path="*" element={<Navigate to={allowed[0] ? `/${allowed[0] === 'dashboard' ? '' : allowed[0]}` : '/login'} replace />} />
                </Routes>
              </Layout>
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
