import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../state/auth";
import { ROLE_LABELS } from "../types";
import { Toast } from "./Toast";

export function Layout() {
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand" onClick={closeMenu}>
            Diogo das Virgens <span>CRM</span>
          </Link>
        </div>

        <button
          type="button"
          className="hamburger-btn"
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        <div className={`topbar-menu ${menuOpen ? "open" : ""}`}>
          <nav className="topnav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")} onClick={closeMenu}>
              Funil
            </NavLink>
            {user.role !== "FINANCEIRO" && (
              <NavLink to="/conversas" className={({ isActive }) => (isActive ? "active" : "")} onClick={closeMenu}>
                Conversas
              </NavLink>
            )}
            {user.role === "GESTOR" && (
              <NavLink to="/admin/usuarios" className={({ isActive }) => (isActive ? "active" : "")} onClick={closeMenu}>
                Administração
              </NavLink>
            )}
          </nav>
          <div className="topbar-right">
            <div className="user-pill">
              {user.name}
              <span className="role-badge">{ROLE_LABELS[user.role]}</span>
            </div>
            <Link to="/trocar-senha" className="btn btn-ghost btn-small" onClick={closeMenu}>
              Trocar senha
            </Link>
            <button className="btn btn-ghost btn-small" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <Toast />
    </div>
  );
}
