import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, fetchUsers, resetUserPassword, updateUser } from "../../api/resources";
import { apiErrorMessage } from "../../api/client";
import { useToastStore } from "../../state/toast";
import { ROLE_LABELS, Role } from "../../types";

export function AdminUsers() {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("ATENDENTE");
  const [error, setError] = useState<string | null>(null);
  const [provisionalPassword, setProvisionalPassword] = useState<{ email: string; password: string } | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { provisionalPassword } = await createUser({ name, email, role });
      setProvisionalPassword({ email, password: provisionalPassword });
      setName("");
      setEmail("");
      setRole("ATENDENTE");
      setShowForm(false);
      invalidate();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleRoleChange(id: string, newRole: Role) {
    try {
      await updateUser(id, { role: newRole });
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    try {
      await updateUser(id, { active: !active });
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleResetPassword(id: string, email: string) {
    if (!confirm("Gerar uma nova senha provisória para este usuário?")) return;
    try {
      const { provisionalPassword } = await resetUserPassword(id);
      setProvisionalPassword({ email, password: provisionalPassword });
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  return (
    <div>
      <h2>Usuários</h2>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "Novo usuário"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ maxWidth: 420, marginBottom: 20 }}>
          <div className="form-field">
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Papel</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" type="submit">
            Criar usuário
          </button>
        </form>
      )}

      {provisionalPassword && (
        <div className="provisional-password-box">
          Senha provisória criada para <b>{provisionalPassword.email}</b>: <code>{provisionalPassword.password}</code>
          <br />
          Repasse essa senha ao usuário. Ele vai precisar trocá-la no primeiro login.
        </div>
      )}

      <table style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Papel</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {usersQuery.data?.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <span className={`status-dot ${u.active ? "active" : "inactive"}`} />
                {u.active ? "Ativo" : "Inativo"}
              </td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-secondary btn-small" onClick={() => handleToggleActive(u.id, u.active ?? true)}>
                  {u.active ? "Desativar" : "Ativar"}
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => handleResetPassword(u.id, u.email)}>
                  Nova senha
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
