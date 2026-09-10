// Edge Function: envia mensagem de texto ou mídia pela UAZAPI (API hospedada
// do WhatsApp) e grava a mensagem enviada no banco via record_whatsapp_message.
// Substitui POST /conversations/:contactId/messages e /media do backend Express
// antigo (que dependia de um processo Baileys persistente).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// O navegador manda uma requisição OPTIONS (preflight) antes de qualquer
// POST cross-origin com Content-Type: application/json. Sem responder isso
// com os headers certos, o fetch nem chega a sair do navegador — falha
// como "Failed to send a request to the Edge Function", sem nenhum log
// aqui do lado do servidor (por isso funcionava via curl mas não no app).
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

const MEDIA_LABELS: Record<string, string> = {
  image: "[Imagem]",
  video: "[Vídeo]",
  audio: "[Áudio]",
  document: "[Arquivo]",
  sticker: "[Figurinha]",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.contactId !== "string") {
    return json({ error: "Requisição inválida." }, 400);
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

  if (!callerProfile?.active || callerProfile.role === "FINANCEIRO") {
    return json({ error: "Você não tem acesso à caixa de entrada." }, 403);
  }

  const { data: contact, error: contactError } = await admin
    .from("Contact")
    .select("id, phone, whatsappJid, name")
    .eq("id", body.contactId)
    .single();
  if (contactError || !contact) {
    return json({ error: "Conversa não encontrada." }, 404);
  }

  const { data: config, error: configError } = await admin.rpc("get_whatsapp_config").single();
  if (configError || !config) {
    return json({ error: "Configuração da UAZAPI não encontrada." }, 500);
  }
  const { uazapi_url: uazapiUrl, uazapi_token: uazapiToken } = config as {
    uazapi_url: string;
    uazapi_token: string;
  };

  const number = contact.whatsappJid || contact.phone;

  try {
    let uazapiResponse: any;
    let content: string;
    let mediaType: string | null = null;
    let mediaMimeType: string | null = null;
    let mediaFileName: string | null = null;
    let mediaBytes: Uint8Array | null = null;

    if (typeof body.text === "string" && body.text.trim()) {
      const res = await fetch(`${uazapiUrl}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: uazapiToken },
        body: JSON.stringify({ number, text: body.text }),
      });
      uazapiResponse = await res.json();
      if (!res.ok) {
        return json({ error: uazapiResponse?.error ?? "Não foi possível enviar a mensagem." }, 409);
      }
      content = body.text;
    } else if (typeof body.mediaBase64 === "string" && typeof body.mediaType === "string") {
      const type = body.ptt ? "ptt" : body.mediaType;
      mediaType = body.mediaType;
      mediaMimeType = body.mimeType ?? null;
      mediaFileName = body.fileName ?? null;
      mediaBytes = Uint8Array.from(atob(body.mediaBase64), (c) => c.charCodeAt(0));

      const res = await fetch(`${uazapiUrl}/send/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: uazapiToken },
        body: JSON.stringify({
          number,
          type,
          file: `data:${body.mimeType ?? "application/octet-stream"};base64,${body.mediaBase64}`,
          text: body.caption,
          mimetype: body.mimeType,
          docName: body.fileName,
        }),
      });
      uazapiResponse = await res.json();
      if (!res.ok) {
        return json({ error: uazapiResponse?.error ?? "Não foi possível enviar o arquivo." }, 409);
      }
      content = body.caption?.trim() || MEDIA_LABELS[body.mediaType] || "[Arquivo]";
    } else {
      return json({ error: "Informe 'text' ou 'mediaBase64'+'mediaType'." }, 400);
    }

    const whatsappMessageId: string | null = uazapiResponse?.messageid ?? uazapiResponse?.id ?? null;

    const { data: message, error: rpcError } = await admin
      .rpc("record_whatsapp_message", {
        p_phone: contact.phone,
        p_whatsapp_jid: contact.whatsappJid,
        p_name: contact.name,
        p_content: content,
        p_direction: "OUT",
        p_whatsapp_message_id: whatsappMessageId,
        p_media_type: mediaType,
        p_media_mime_type: mediaMimeType,
        p_media_file_name: mediaFileName,
        p_sender_id: userData.user.id,
        p_created_at: new Date().toISOString(),
      })
      .single();

    if (rpcError || !message) {
      return json({ error: rpcError?.message ?? "Não foi possível registrar a mensagem." }, 500);
    }

    if (mediaBytes) {
      await admin.storage
        .from("whatsapp-media")
        .upload((message as any).id, mediaBytes, {
          contentType: mediaMimeType ?? "application/octet-stream",
          upsert: true,
        });
    }

    return json({ message }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro interno." }, 500);
  }
});
