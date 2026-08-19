import { useState } from "react";
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
  const { token, user } = useAuthStore();
  if (!token || !user) return <Navigate to="/login" replace />;
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
  // Lido uma vez, sem assinar mudanças: evita competir com o navigate()
  // explícito do próprio formulário de login logo após autenticar.
  const [alreadyLoggedIn] = useState(() => Boolean(useAuthStore.getState().token));
  if (alreadyLoggedIn) return <Navigate to="/" replace />;
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
