import { Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { FriendProfilePage } from "./pages/FriendProfilePage";
import { HistoryPage } from "./pages/HistoryPage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SocialPage } from "./pages/SocialPage";

function AppContent() {
  const { session, loading } = useAuth();

  if (loading) return <p className="status">Laddar…</p>;
  if (!session) return <LoginPage />;

  return (
    <>
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/pass" element={<HistoryPage />} />
          <Route path="/socialt" element={<SocialPage />} />
          <Route path="/socialt/:friendId" element={<FriendProfilePage />} />
          <Route path="/profil" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
