import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "../api/resources";
import { apiErrorMessage } from "../api/client";
import { useAuthStore } from "../state/auth";

export function Login() {
  // Seleciona só a ação (não o token) para não re-renderizar e disparar
  // navegação duplicada assim que o login grava a sessão.
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await loginRequest(email, password);
      setSession(data.token, data.user);
      navigate(data.user.mustChangePassword ? "/trocar-senha" : "/", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "E-mail ou senha incorretos."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Diogo das Virgens</h1>
        <p>Entre com seu e-mail e senha para acessar o CRM.</p>
        <div className="form-field">
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="form-field">
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
