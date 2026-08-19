import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePasswordRequest } from "../api/resources";
import { apiErrorMessage } from "../api/client";
import { useAuthStore } from "../state/auth";
import { useToastStore } from "../state/toast";

export function ChangePassword() {
  const { user, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const toast = useToastStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("A confirmação não bate com a nova senha.");
      return;
    }

    setLoading(true);
    try {
      await changePasswordRequest(currentPassword, newPassword);
      updateUser({ mustChangePassword: false });
      toast.show("Senha trocada com sucesso.");
      navigate("/");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Trocar senha</h1>
      </div>
      <div style={{ padding: "0 24px", maxWidth: 380 }}>
        {user?.mustChangePassword && (
          <p className="hint-text" style={{ marginBottom: 16 }}>
            Sua senha é provisória. Defina uma senha nova para continuar usando o sistema.
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Senha atual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Nova senha</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="form-field">
            <label>Confirmar nova senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
