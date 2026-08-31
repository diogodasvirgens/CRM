// Edge Function: ações de administração de usuário que exigem privilégio
// (criar conta, resetar senha, mudar papel/e-mail/ativo) — coisas que só
// dá pra fazer com a service_role key do Supabase Auth, que nunca pode
// ficar exposta no frontend. Só quem já é Gestor pode chamar isto.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function generateProvisionalPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 12);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string") {
    return json({ error: "Requisição inválida." }, 400);
  }

  // bootstrap: cria os usuários iniciais. Não exige estar logado (não tem
  // como estar, ainda não existe ninguém) — a trava de segurança é que só
  // funciona uma vez, enquanto profiles estiver vazia.
  if (body.action === "bootstrap") {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });
    if (count && count > 0) {
      return json({ error: "Bootstrap já foi executado antes." }, 409);
    }

    const initialUsers = Array.isArray(body.users) ? body.users : [];
    const created: { name: string; email: string; role: string; provisionalPassword: string }[] = [];

    for (const u of initialUsers) {
      const provisionalPassword = generateProvisionalPassword();
      const { data: authUser, error: createError } = await admin.auth.admin.createUser({
        email: u.email,
        password: provisionalPassword,
        email_confirm: true,
      });
      if (createError || !authUser.user) {
        return json({ error: `Falha ao criar ${u.email}: ${createError?.message}`, created }, 400);
      }
      await admin.from("profiles").insert({
        id: authUser.user.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: true,
        must_change_password: true,
      });
      created.push({ name: u.name, email: u.email, role: u.role, provisionalPassword });
    }

    return json({ created });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Token não informado." }, 401);
  }
  const token = authHeader.slice("Bearer ".length);

  // Cliente com a chave anônima + o token de quem chamou, só pra
  // confirmar quem é essa pessoa (auth.getUser valida o JWT de verdade).
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ error: "Token inválido ou expirado." }, 401);
  }

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", userData.user.id)
    .single();

  if (!callerProfile?.active || callerProfile.role !== "GESTOR") {
    return json({ error: "Você não tem permissão para esta ação." }, 403);
  }

  try {
    if (body.action === "create") {
      const { name, email, role } = body;
      if (!name || !email || !["GESTOR", "ATENDENTE", "FINANCEIRO"].includes(role)) {
        return json({ error: "Dados inválidos." }, 400);
      }

      const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (existing) {
        return json({ error: "Já existe um usuário com este e-mail." }, 409);
      }

      const provisionalPassword = generateProvisionalPassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: provisionalPassword,
        email_confirm: true,
      });
      if (createError || !created.user) {
        return json({ error: createError?.message ?? "Não foi possível criar o usuário." }, 400);
      }

      const { error: profileError } = await admin.from("profiles").insert({
        id: created.user.id,
        name,
        email,
        role,
        active: true,
        must_change_password: true,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: profileError.message }, 400);
      }

      return json({
        user: { id: created.user.id, name, email, role, active: true },
        provisionalPassword,
      });
    }

    if (body.action === "resetPassword") {
      const { userId } = body;
      if (!userId) return json({ error: "userId é obrigatório." }, 400);

      const provisionalPassword = generateProvisionalPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password: provisionalPassword });
      if (error) return json({ error: error.message }, 400);

      await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);

      return json({ provisionalPassword });
    }

    if (body.action === "update") {
      const { userId, name, email, role, active } = body;
      if (!userId) return json({ error: "userId é obrigatório." }, 400);

      if (email) {
        const { error: emailError } = await admin.auth.admin.updateUserById(userId, { email });
        if (emailError) return json({ error: emailError.message }, 400);
      }

      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (email !== undefined) patch.email = email;
      if (role !== undefined) patch.role = role;
      if (active !== undefined) patch.active = active;

      const { data: updated, error } = await admin.from("profiles").update(patch).eq("id", userId).select().single();
      if (error) return json({ error: error.message }, 400);

      return json({
        user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active },
      });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro interno." }, 500);
  }
});
