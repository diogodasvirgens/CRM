import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./state/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { ChangePassword } from "./pages/ChangePassword";
import { Kanban } from "./pages/Kanban";
import { AdminLayout } from "./pages/Admin/AdminLayout";
import { AdminUsers } from "./pages/Admin/AdminUsers";
import { AdminStages } from "./pages/Admin/AdminStages";
import { AdminTags } from "./pages/Admin/AdminTags";
import { AdminEventEditions } from "./pages/Admin/AdminEventEditions";
import { AdminWhatsapp } from "./pages/Admin/AdminWhatsapp";
import { Inbox } from "./pages/Inbox";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuthStore();
  // A sessão do Supabase é restaurada de forma assíncrona ao carregar o
  // app; espera resolver antes de decidir (senão redireciona pro login
  // por uma fração de segundo mesmo com sessão salva).
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireGestor({ children }: { children: JSX.Element }) {
  const { user } = useAuthStore();
  if (user?.role !== "GESTOR") return <Navigate to="/" replace />;
  return children;
}

function RequireInboxAccess({ children }: { children: JSX.Element }) {
  const { user } = useAuthStore();
  if (user?.role === "FINANCEIRO") return <Navigate to="/" replace />;
  return children;
}

function LoginRoute() {
  // Decide uma única vez, assim que a sessão inicial termina de carregar,
  // e não reage a mudanças depois disso — evita competir com o navigate()
  // explícito do próprio formulário de login logo após autenticar.
  const loading = useAuthStore((s) => s.loading);
  const [decided, setDecided] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && decided === null) {
      setDecided(Boolean(useAuthStore.getState().user));
    }
  }, [loading, decided]);

  if (loading || decided === null) return null;
  if (decided) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Kanban />} />
        <Route path="/conversas" element={<RequireInboxAccess><Inbox /></RequireInboxAccess>} />
        <Route path="/trocar-senha" element={<ChangePassword />} />
        <Route
          path="/admin"
          element={
            <RequireGestor>
              <AdminLayout />
            </RequireGestor>
          }
        >
          <Route index element={<Navigate to="usuarios" replace />} />
          <Route path="usuarios" element={<AdminUsers />} />
          <Route path="etapas" element={<AdminStages />} />
          <Route path="etiquetas" element={<AdminTags />} />
          <Route path="edicoes" element={<AdminEventEditions />} />
          <Route path="whatsapp" element={<AdminWhatsapp />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
