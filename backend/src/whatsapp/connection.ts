import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import QRCode from "qrcode";
import type { WAMessage, WAMessageContent } from "@whiskeysockets/baileys";
import { prisma } from "../db";
import { findOrCreateContact, normalizePhone } from "../utils/contacts";
import { saveMedia } from "../utils/media";
import { transcodeToOggOpus } from "../utils/audio";

// Baileys 7.x é um pacote ESM puro ("type": "module"), enquanto o backend
// roda em CommonJS. `import()` estático nesse cenário seria rebaixado pelo
// TypeScript para `require()` (que não consegue carregar ESM), então usamos
// um import dinâmico "real" via Function, que o compilador não reescreve.
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<typeof import("@whiskeysockets/baileys")>;

type Baileys = typeof import("@whiskeysockets/baileys");
type WASocket = ReturnType<Baileys["default"]>;

export type WhatsappStatus = "disconnected" | "connecting" | "qr" | "connected" | "logged_out";

interface ConnectionState {
  status: WhatsappStatus;
  qr: string | null;
  phone: string | null;
  lastError: string | null;
  updatedAt: Date;
}

const state: ConnectionState = {
  status: "disconnected",
  qr: null,
  phone: null,
  lastError: null,
  updatedAt: new Date(),
};

let sock: WASocket | null = null;
let starting = false;

const sessionDir = path.join(__dirname, "../../whatsapp-session");
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? "warn" });
// Log próprio da integração (mensagens recebidas/gravadas), separado do
// logger que passamos pro Baileys — sempre visível, não depende de
// WHATSAPP_LOG_LEVEL, porque "não pode falhar em silêncio" vale também
// pra nós conseguirmos diagnosticar o que está chegando.
const appLog = pino({ level: "info", name: "whatsapp-inbox" });

function setState(partial: Partial<ConnectionState>) {
  Object.assign(state, partial, { updatedAt: new Date() });
}

export function getWhatsappState() {
  return { ...state };
}

export async function getWhatsappQrDataUrl(): Promise<string | null> {
  if (!state.qr) return null;
  return QRCode.toDataURL(state.qr);
}

function jidToPhone(jid: string): string {
  return normalizePhone(jid.split("@")[0].split(":")[0]);
}

// O WhatsApp às vezes endereça um contato pelo LID (identificador interno,
// não o número de telefone real) em vez do JID de número de telefone
// (@s.whatsapp.net) — cada vez mais comum. Quando isso acontece, `remoteJid`
// vem como "...@lid" e `remoteJidAlt` traz o JID de telefone correspondente.
// Sem resolver isso: 1) o "telefone" salvo vira um número de LID sem sentido
// (não bate com nenhum contato cadastrado manualmente) e 2) pior, reconstruir
// um JID a partir desse número pra responder manda a mensagem pra um
// endereço que não existe — ela nunca chega no destinatário nem sincroniza
// no celular de quem enviou.
function resolvePhoneAndJid(remoteJid: string, remoteJidAlt?: string | null): { phone: string; jid: string } {
  const isLid = remoteJid.endsWith("@lid");
  const preferredJid = isLid && remoteJidAlt && !remoteJidAlt.endsWith("@lid") ? remoteJidAlt : remoteJid;
  return { phone: jidToPhone(preferredJid), jid: preferredJid };
}

function phoneToJid(phone: string): string {
  return `${normalizePhone(phone)}@s.whatsapp.net`;
}

// WhatsApp embrulha o conteúdo real dentro de mensagens "envelope" em vários
// casos comuns: mensagem temporária (ephemeral), visualização única
// (view-once) e eco de mensagem enviada por outro aparelho ligado à mesma
// conta (deviceSentMessage). Sem desembrulhar isso, getContentType() devolve
// o tipo do envelope (ex.: "ephemeralMessage") e a extração de texto abaixo
// não reconhece nada, descartando a mensagem em silêncio.
function unwrapMessage(message: WAMessageContent | null | undefined): WAMessageContent | null | undefined {
  if (!message) return message;
  const envelope =
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.viewOnceMessageV2Extension?.message ??
    message.deviceSentMessage?.message;
  return envelope ? unwrapMessage(envelope) : message;
}

export type MediaType = "image" | "audio" | "video" | "document" | "sticker";

const MEDIA_LABELS: Record<MediaType, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
};

interface ExtractedContent {
  text: string | null;
  mediaType: MediaType | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
}

function extractContent(baileys: Baileys, rawMessage: WAMessageContent | null | undefined): ExtractedContent {
  const empty: ExtractedContent = { text: null, mediaType: null, mediaMimeType: null, mediaFileName: null };
  const message = unwrapMessage(rawMessage);
  if (!message) return empty;
  const type = baileys.getContentType(message);
  switch (type) {
    case "conversation":
      return { ...empty, text: message.conversation ?? null };
    case "extendedTextMessage":
      return { ...empty, text: message.extendedTextMessage?.text ?? null };
    case "imageMessage":
      return {
        text: message.imageMessage?.caption ?? null,
        mediaType: "image",
        mediaMimeType: message.imageMessage?.mimetype ?? "image/jpeg",
        mediaFileName: null,
      };
    case "videoMessage":
      return {
        text: message.videoMessage?.caption ?? null,
        mediaType: "video",
        mediaMimeType: message.videoMessage?.mimetype ?? "video/mp4",
        mediaFileName: null,
      };
    case "audioMessage":
      return {
        text: null,
        mediaType: "audio",
        mediaMimeType: message.audioMessage?.mimetype ?? "audio/ogg",
        mediaFileName: null,
      };
    case "documentMessage":
      return {
        text: message.documentMessage?.caption ?? null,
        mediaType: "document",
        mediaMimeType: message.documentMessage?.mimetype ?? "application/octet-stream",
        mediaFileName: message.documentMessage?.fileName ?? null,
      };
    case "stickerMessage":
      return {
        text: null,
        mediaType: "sticker",
        mediaMimeType: message.stickerMessage?.mimetype ?? "image/webp",
        mediaFileName: null,
      };
    case "locationMessage":
      return { ...empty, text: "[Localização]" };
    case "contactMessage":
      return { ...empty, text: "[Contato compartilhado]" };
    default:
      appLog.info({ type }, "Tipo de mensagem sem extração de conteúdo definida, ignorando.");
      return empty;
  }
}

async function persistIncomingOrEcho(baileys: Baileys, msg: WAMessage) {
  if (!msg.key) {
    appLog.info("Mensagem recebida sem key, ignorando.");
    return;
  }
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") {
    appLog.info({ remoteJid }, "Mensagem de grupo/status, ignorando.");
    return;
  }

  const whatsappMessageId = msg.key.id;
  if (!whatsappMessageId) {
    appLog.info("Mensagem sem id, ignorando.");
    return;
  }

  const already = await prisma.message.findUnique({ where: { whatsappMessageId } });
  if (already) return;

  const extracted = extractContent(baileys, msg.message);
  if (!extracted.text && !extracted.mediaType) {
    appLog.info({ whatsappMessageId, hasMessage: Boolean(msg.message) }, "Sem conteúdo extraível, mensagem não gravada.");
    return;
  }

  const fromMe = Boolean(msg.key.fromMe);
  const { phone, jid } = resolvePhoneAndJid(remoteJid, msg.key.remoteJidAlt);
  const pushName = !fromMe ? msg.pushName ?? null : null;

  const contact = await findOrCreateContact(phone, pushName, jid);
  const content = extracted.text || (extracted.mediaType ? `[${MEDIA_LABELS[extracted.mediaType]}]` : "");

  let message: { id: string };
  try {
    [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          contactId: contact.id,
          leadId: contact.currentLeadId,
          content,
          direction: fromMe ? "OUT" : "IN",
          senderId: null,
          whatsappMessageId,
          mediaType: extracted.mediaType,
          mediaMimeType: extracted.mediaMimeType,
          mediaFileName: extracted.mediaFileName,
          createdAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
        },
      }),
      prisma.contact.update({
        where: { id: contact.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } catch (err: any) {
    // Corrida com o nosso próprio envio: sendWhatsappMessage/sendWhatsappMedia
    // já gravou essa mensagem (mesmo whatsappMessageId) entre o check acima
    // e este insert — é só o eco chegando, não uma falha de verdade.
    if (err?.code === "P2002") {
      appLog.info({ whatsappMessageId }, "Eco do nosso próprio envio, já gravado antes.");
      return;
    }
    throw err;
  }

  appLog.info({ whatsappMessageId, direction: fromMe ? "OUT" : "IN", contactId: contact.id }, "Mensagem gravada.");

  if (extracted.mediaType && sock) {
    try {
      const buffer = await baileys.downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
      await saveMedia(message.id, buffer);
      appLog.info({ messageId: message.id, mediaType: extracted.mediaType }, "Mídia baixada e salva.");
    } catch (err) {
      appLog.error({ err, messageId: message.id }, "Falha ao baixar mídia do WhatsApp.");
    }
  }
}

export async function startWhatsapp(): Promise<void> {
  if (starting) return;
  starting = true;

  try {
    const baileys = await dynamicImport("@whiskeysockets/baileys");
    const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;

    const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    setState({ status: "connecting", qr: null, lastError: null });

    sock = makeWASocket({
      version,
      auth: authState,
      logger: logger as any,
      printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        appLog.info("QR Code novo gerado, aguardando leitura.");
        setState({ status: "qr", qr });
      }

      if (connection === "open") {
        const phone = jidToPhone(sock?.user?.id ?? "");
        appLog.info({ phone }, "WhatsApp conectado.");
        setState({ status: "connected", qr: null, phone, lastError: null });
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        appLog.info({ statusCode, message: lastDisconnect?.error?.message }, "Conexão com o WhatsApp encerrada.");
        // loggedOut: usuário desvinculou pelo celular. badSession: credenciais
        // corrompidas, tentar de novo com os mesmos arquivos só repetiria o
        // erro. Os dois exigem QR Code novo, não uma simples reconexão.
        const needsFreshPairing = statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession;

        setState({
          status: needsFreshPairing ? "logged_out" : "disconnected",
          phone: null,
          lastError: lastDisconnect?.error?.message ?? "Conexão encerrada.",
        });

        sock = null;
        starting = false;

        if (needsFreshPairing) {
          fs.promises
            .rm(sessionDir, { recursive: true, force: true })
            .then(() => startWhatsapp())
            .catch((err) => {
              setState({ status: "disconnected", lastError: err?.message ?? "Falha ao gerar novo QR Code." });
            });
        } else {
          setTimeout(() => {
            startWhatsapp().catch((err) => {
              setState({ status: "disconnected", lastError: err?.message ?? "Falha ao reconectar." });
            });
          }, 3000);
        }
        return;
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      appLog.info({ type, count: messages.length }, "messages.upsert recebido.");
      if (type !== "notify" && type !== "append") return;
      for (const msg of messages) {
        persistIncomingOrEcho(baileys, msg).catch((err) => {
          appLog.error({ err }, "Falha ao gravar mensagem do WhatsApp.");
        });
      }
    });
  } catch (err: any) {
    setState({ status: "disconnected", lastError: err?.message ?? "Falha ao iniciar conexão com o WhatsApp." });
  } finally {
    starting = false;
  }
}

export async function logoutWhatsapp(): Promise<void> {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // ignora erro de logout de socket já caído
    }
  }
  sock = null;
  starting = false;

  await fs.promises.rm(sessionDir, { recursive: true, force: true });

  setState({ status: "disconnected", qr: null, phone: null, lastError: null });
}

async function requireConnectedContact(contactId: string) {
  if (!sock || state.status !== "connected") {
    throw new Error("WhatsApp não está conectado.");
  }
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    throw new Error("Contato não encontrado.");
  }
  // Responder pro JID exato de onde a conversa aconteceu (guardado quando a
  // última mensagem chegou), nunca reconstruído a partir do telefone — ver
  // o comentário de resolvePhoneAndJid. Só reconstrói como último recurso,
  // pra contato criado manualmente que nunca mandou mensagem nenhuma.
  const jid = contact.whatsappJid ?? phoneToJid(contact.phone);
  return { contact, jid };
}

export async function sendWhatsappMessage(params: {
  contactId: string;
  text: string;
  senderId: string;
}): Promise<{ id: string; createdAt: Date }> {
  const { contact, jid } = await requireConnectedContact(params.contactId);

  const result = await sock!.sendMessage(jid, { text: params.text });
  const whatsappMessageId = result?.key?.id;
  if (!whatsappMessageId) {
    throw new Error("Não foi possível confirmar o envio da mensagem.");
  }

  const message = await prisma.message.create({
    data: {
      contactId: contact.id,
      leadId: contact.currentLeadId,
      content: params.text,
      direction: "OUT",
      senderId: params.senderId,
      whatsappMessageId,
    },
  });

  await prisma.contact.update({ where: { id: contact.id }, data: { lastMessageAt: new Date() } });

  return { id: message.id, createdAt: message.createdAt };
}

export async function sendWhatsappMedia(params: {
  contactId: string;
  senderId: string;
  buffer: Buffer;
  mimeType: string;
  mediaType: MediaType;
  fileName?: string;
  caption?: string;
  ptt?: boolean;
}): Promise<{ id: string; createdAt: Date }> {
  const { contact, jid } = await requireConnectedContact(params.contactId);

  // Mensagem de voz gravada no navegador vem em WebM/Opus. O upload até
  // "funciona" nesse formato (o Baileys devolve um id de mensagem válido),
  // mas o WhatsApp exige o contêiner OGG pra tratar como voice note de
  // verdade — sem isso o áudio não toca do outro lado. Transcodifica antes
  // de mandar como ptt, e o arquivo salvo localmente já fica no formato
  // certo também (o player da própria caixa de entrada usa esse arquivo).
  let buffer = params.buffer;
  let mimeType = params.mimeType;
  if (params.mediaType === "audio" && params.ptt) {
    buffer = await transcodeToOggOpus(params.buffer);
    mimeType = "audio/ogg; codecs=opus";
  }

  const content =
    params.mediaType === "image"
      ? { image: buffer, caption: params.caption, mimetype: mimeType }
      : params.mediaType === "video"
      ? { video: buffer, caption: params.caption, mimetype: mimeType }
      : params.mediaType === "audio"
      ? { audio: buffer, mimetype: mimeType, ptt: params.ptt }
      : { document: buffer, mimetype: mimeType, fileName: params.fileName, caption: params.caption };

  const result = await sock!.sendMessage(jid, content);
  const whatsappMessageId = result?.key?.id;
  if (!whatsappMessageId) {
    throw new Error("Não foi possível confirmar o envio da mensagem.");
  }

  const message = await prisma.message.create({
    data: {
      contactId: contact.id,
      leadId: contact.currentLeadId,
      content: params.caption || `[${MEDIA_LABELS[params.mediaType]}]`,
      direction: "OUT",
      senderId: params.senderId,
      whatsappMessageId,
      mediaType: params.mediaType,
      mediaMimeType: mimeType,
      mediaFileName: params.fileName ?? null,
    },
  });

  await saveMedia(message.id, buffer);
  await prisma.contact.update({ where: { id: contact.id }, data: { lastMessageAt: new Date() } });

  return { id: message.id, createdAt: message.createdAt };
}
