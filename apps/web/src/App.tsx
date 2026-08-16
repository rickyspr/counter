import { AuthProvider, useAuth } from "./lib/auth-context";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";

function AppContent() {
  const { session, loading } = useAuth();

  if (loading) return <p className="status">Laddar…</p>;

  return session ? <OverviewPage /> : <LoginPage />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
