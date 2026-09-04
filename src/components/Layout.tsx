import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../state/auth";
import { ROLE_LABELS } from "../types";
import { Toast } from "./Toast";

export function Layout() {
  const { user, logout } = useAuthStore();

  if (!user) return null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand">
            Diogo das Virgens <span>CRM</span>
          </Link>
          <nav className="topnav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Funil
            </NavLink>
            {user.role !== "FINANCEIRO" && (
              <NavLink to="/conversas" className={({ isActive }) => (isActive ? "active" : "")}>
                Conversas
              </NavLink>
            )}
            {user.role === "GESTOR" && (
              <NavLink to="/admin/usuarios" className={({ isActive }) => (isActive ? "active" : "")}>
                Administração
              </NavLink>
            )}
          </nav>
        </div>
        <div className="topbar-right">
          <div className="user-pill">
            {user.name}
            <span className="role-badge">{ROLE_LABELS[user.role]}</span>
          </div>
          <Link to="/trocar-senha" className="btn btn-ghost btn-small">
            Trocar senha
          </Link>
          <button className="btn btn-ghost btn-small" onClick={logout}>
            Sair
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <Toast />
    </div>
  );
}
