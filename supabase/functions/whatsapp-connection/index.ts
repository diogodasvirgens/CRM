// Edge Function: proxy pros endpoints de conexão/QR da UAZAPI. Só Gestor
// mexe na conexão do WhatsApp (mesma regra do antigo requireRole("GESTOR")
// em backend/src/routes/whatsapp.ts).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (!["status", "connect", "disconnect"].includes(action)) {
    return json({ error: "Ação inválida." }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Token não informado." }, 401);
  }
  const token = authHeader.slice("Bearer ".length);

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

  const { data: config, error: configError } = await admin.rpc("get_whatsapp_config").single();
  if (configError || !config) {
    return json({ error: "Configuração da UAZAPI não encontrada." }, 500);
  }
  const { uazapi_url: uazapiUrl, uazapi_token: uazapiToken } = config as {
    uazapi_url: string;
    uazapi_token: string;
  };

  const pathByAction: Record<string, string> = {
    status: "/instance/status",
    connect: "/instance/connect",
    disconnect: "/instance/disconnect",
  };

  const res = await fetch(`${uazapiUrl}${pathByAction[action]}`, {
    method: action === "status" ? "GET" : "POST",
    headers: { "Content-Type": "application/json", token: uazapiToken },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: data?.error ?? "Não foi possível falar com a UAZAPI." }, 502);
  }

  return json(data);
});
