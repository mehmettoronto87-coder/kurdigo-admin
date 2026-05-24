import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CurriculumPage from './pages/CurriculumPage';
import LessonEditorPage from './pages/LessonEditorPage';
import AIGeneratorPage from './pages/AIGeneratorPage';
import SceneLibraryPage from './pages/SceneLibraryPage';
import SettingsPage from './pages/SettingsPage';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Yükleniyor...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading, adminUser, logout } = useAuth();

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
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/curriculum" element={<CurriculumPage />} />
                  <Route path="/curriculum/:unitId" element={<LessonEditorPage />} />
                  <Route path="/ai-generator" element={<AIGeneratorPage />} />
                  <Route path="/scene-library" element={<SceneLibraryPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
