import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";

export function Login() {
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
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !data.user) {
        throw authError ?? new Error("Não foi possível entrar.");
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("active, must_change_password")
        .eq("id", data.user.id)
        .single();

      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        throw new Error("Usuário inativo ou não encontrado.");
      }

      navigate(profile.must_change_password ? "/trocar-senha" : "/", { replace: true });
    } catch (err) {
      const message =
        err instanceof Error && err.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : err instanceof Error
          ? err.message
          : "E-mail ou senha incorretos.";
      setError(message);
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
