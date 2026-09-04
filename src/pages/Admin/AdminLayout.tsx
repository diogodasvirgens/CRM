import { NavLink, Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <NavLink to="/admin/usuarios" className={({ isActive }) => (isActive ? "active" : "")}>
          Usuários
        </NavLink>
        <NavLink to="/admin/etapas" className={({ isActive }) => (isActive ? "active" : "")}>
          Etapas dos funis
        </NavLink>
        <NavLink to="/admin/etiquetas" className={({ isActive }) => (isActive ? "active" : "")}>
          Etiquetas
        </NavLink>
        <NavLink to="/admin/edicoes" className={({ isActive }) => (isActive ? "active" : "")}>
          Edições de evento
        </NavLink>
        <NavLink to="/admin/whatsapp" className={({ isActive }) => (isActive ? "active" : "")}>
          WhatsApp
        </NavLink>
      </aside>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  );
}
