// Edge Function: recebe os webhooks de mensagem da UAZAPI (API hospedada do
// WhatsApp) e grava no banco via record_whatsapp_message. Pública (sem JWT
// do Supabase, quem chama é o servidor da UAZAPI) e SEM checagem de segredo
// (removido a pedido explícito). Substitui o listener `messages.upsert` do
// Baileys (backend Express antigo).
//
// IMPORTANTE: o payload real da UAZAPI NÃO segue o schema documentado no
// OpenAPI (`{event, instance, data}`). O formato real é:
//   { EventType: "messages", chat: {...}, message: {...}, owner, token, ... }
// — descoberto inspecionando `/webhook/errors` e um log de debug temporário
// direto no payload cru recebido aqui. `chat` tem os dados do contato/
// conversa (wa_chatid, wa_contactName, wa_label etc.), `message` tem os
// dados da mensagem em si (chatid, sender, text, mediaType, fromMe,
// messageid...).
//
// Sincronização de etiqueta do WhatsApp -> etapa do funil: o payload de
// "messages" já traz `chat.wa_label` (array de ids de etiqueta tipo
// "<dono>:<n>"). A UAZAPI também tem um evento dedicado pra mudança de
// etiqueta (assinado como "chat_labels" aqui) — como o formato exato desse
// evento específico não foi validado ao vivo ainda, o código trata o `chat`
// dele do mesmo jeito que o do evento de mensagem (mesma função
// syncStageFromLabels), de forma defensiva.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const MEDIA_LABELS: Record<string, string> = {
  image: "[Imagem]",
  video: "[Vídeo]",
  audio: "[Áudio]",
  document: "[Arquivo]",
  sticker: "[Figurinha]",
};

const KNOWN_MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);

function normalizeMediaType(rawMediaType?: string, messageType?: string, mimetype?: string): string | null {
  if (rawMediaType) {
    const t = rawMediaType.toLowerCase();
    if (t === "ptt") return "audio";
    if (KNOWN_MEDIA_TYPES.has(t)) return t;
  }
  const hay = `${messageType ?? ""} ${mimetype ?? ""}`.toLowerCase();
  if (hay.includes("sticker")) return "sticker";
  if (hay.includes("image")) return "image";
  if (hay.includes("audio") || hay.includes("ptt")) return "audio";
  if (hay.includes("video")) return "video";
  if (hay.includes("document")) return "document";
  return null;
}

// Etiqueta do WhatsApp -> etapa do funil, por nome idêntico (sem acento/
// maiúscula não importa). Só move se exatamente UMA etapa bater com as
// etiquetas atuais do chat — se o chat tem etiquetas que apontam pra etapas
// diferentes entre si, ou nenhuma bate, não faz nada (evita mover errado).
async function syncStageFromLabels(chat: any, uazapiUrl: string, uazapiToken: string) {
  const waLabelIds: string[] = Array.isArray(chat?.wa_label) ? chat.wa_label : [];
  const chatJid: string = chat?.wa_chatid || "";
  const phone = chatJid.replace(/\D/g, "");
  if (!phone || waLabelIds.length === 0) return;

  try {
    const labelsRes = await fetch(`${uazapiUrl}/labels`, {
      method: "GET",
      headers: { token: uazapiToken },
    });
    if (!labelsRes.ok) return;
    const allLabels: Array<{ id: string; name: string }> = await labelsRes.json();
    const labelNameById = new Map(allLabels.map((l) => [l.id, (l.name ?? "").trim().toLowerCase()]));

    const chatLabelNames = waLabelIds
      .map((id) => labelNameById.get(id))
      .filter((name): name is string => Boolean(name));
    if (chatLabelNames.length === 0) return;

    const { data: stages, error: stagesError } = await admin.from("Stage").select("id, name");
    if (stagesError || !stages) return;

    const matchedStageIds = new Set(
      stages.filter((s: any) => chatLabelNames.includes((s.name ?? "").trim().toLowerCase())).map((s: any) => s.id)
    );

    if (matchedStageIds.size !== 1) return;
    const [stageId] = matchedStageIds;

    await admin.rpc("apply_whatsapp_label_stage", { p_phone: phone, p_stage_id: stageId });
  } catch {
    // Mensagem/evento principal já foi processado; falha aqui não deve
    // quebrar o resto do webhook.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  const { data: config, error: configError } = await admin.rpc("get_whatsapp_config").single();
  if (configError || !config) {
    return json({ error: "Configuração não encontrada." }, 500);
  }
  const { uazapi_url: uazapiUrl, uazapi_token: uazapiToken } = config as {
    uazapi_url: string;
    uazapi_token: string;
  };

  const body = await req.json().catch(() => null);
  if (!body || typeof body.EventType !== "string") {
    return json({ ok: true });
  }

  // Evento dedicado de mudança de etiqueta (nome do evento ainda não
  // validado ao vivo — ver comentário no topo do arquivo).
  if (body.EventType === "chat_labels" || body.EventType === "labels") {
    const chat = body.chat ?? body.data?.chat ?? body.data ?? {};
    await syncStageFromLabels(chat, uazapiUrl, uazapiToken);
    return json({ ok: true });
  }

  if (body.EventType !== "messages") {
    return json({ ok: true });
  }

  const message = body.message ?? {};
  const chat = body.chat ?? {};

  // Toda mensagem já carrega o estado atual das etiquetas do chat —
  // aproveita pra manter o funil sincronizado sem depender só do evento
  // dedicado (que pode não disparar se a etiqueta mudar sem mensagem nova).
  await syncStageFromLabels(chat, uazapiUrl, uazapiToken);

  if (message.isGroup || message.wasSentByApi === true) {
    return json({ ok: true });
  }

  // `chat.wa_chatid` já vem resolvido pela UAZAPI (JID de telefone, não
  // LID); cai pro que tiver na própria mensagem só se faltar no chat.
  const jid: string = chat.wa_chatid || message.chatid || message.sender_pn || message.sender || "";
  const phone = jid.replace(/\D/g, "");
  if (!phone) {
    return json({ ok: true });
  }

  const name: string | null = chat.wa_contactName || chat.name || chat.wa_name || null;

  const mediaType = normalizeMediaType(message.mediaType, message.messageType, message.content?.mimetype);
  const content: string =
    (typeof message.text === "string" && message.text) ||
    (mediaType ? MEDIA_LABELS[mediaType] ?? "[Arquivo]" : "");

  let mediaBytes: Uint8Array | null = null;
  let mediaMimeType: string | null = message.content?.mimetype ?? null;

  // O conteúdo de mídia no payload (`message.content.URL`) é um link
  // criptografado do WhatsApp — não dá pra baixar direto, precisa passar
  // pelo /message/download da UAZAPI (que descriptografa) pra ter o arquivo
  // de verdade.
  if (mediaType && message.messageid) {
    try {
      const dlRes = await fetch(`${uazapiUrl}/message/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: uazapiToken },
        body: JSON.stringify({ id: message.messageid, return_link: true, generate_mp3: false }),
      });
      if (dlRes.ok) {
        const dl = await dlRes.json();
        mediaMimeType = dl.mimetype ?? mediaMimeType;
        if (dl.fileURL) {
          const fileRes = await fetch(dl.fileURL);
          if (fileRes.ok) {
            mediaBytes = new Uint8Array(await fileRes.arrayBuffer());
            mediaMimeType = fileRes.headers.get("Content-Type") ?? mediaMimeType;
          }
        }
      }
    } catch {
      // Mensagem ainda é gravada mesmo se o download da mídia falhar.
    }
  }

  const { data: savedMessage, error: rpcError } = await admin
    .rpc("record_whatsapp_message", {
      p_phone: phone,
      p_whatsapp_jid: jid,
      p_name: name,
      p_content: content,
      p_direction: message.fromMe ? "OUT" : "IN",
      p_whatsapp_message_id: message.messageid ?? null,
      p_media_type: mediaType,
      p_media_mime_type: mediaMimeType,
      p_media_file_name: null,
      p_sender_id: null,
      p_created_at: message.messageTimestamp
        ? new Date(message.messageTimestamp).toISOString()
        : new Date().toISOString(),
    })
    .single();

  if (rpcError || !savedMessage) {
    return json({ error: rpcError?.message ?? "Não foi possível registrar a mensagem." }, 500);
  }

  if (mediaBytes) {
    await admin.storage
      .from("whatsapp-media")
      .upload((savedMessage as any).id, mediaBytes, {
        contentType: mediaMimeType ?? "application/octet-stream",
        upsert: true,
      });
  }

  return json({ ok: true });
});
