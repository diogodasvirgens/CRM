import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import QRCode from "qrcode";
import { prisma } from "../db";
import { findOrCreateContact, normalizePhone } from "../utils/contacts";

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

function phoneToJid(phone: string): string {
  return `${normalizePhone(phone)}@s.whatsapp.net`;
}

function extractText(baileys: Baileys, message: import("@whiskeysockets/baileys").proto.IMessage | null | undefined): string | null {
  if (!message) return null;
  const type = baileys.getContentType(message);
  switch (type) {
    case "conversation":
      return message.conversation ?? null;
    case "extendedTextMessage":
      return message.extendedTextMessage?.text ?? null;
    case "imageMessage":
      return message.imageMessage?.caption || "[Imagem]";
    case "videoMessage":
      return message.videoMessage?.caption || "[Vídeo]";
    case "audioMessage":
      return message.audioMessage?.ptt ? "[Áudio]" : "[Arquivo de áudio]";
    case "documentMessage":
      return message.documentMessage?.caption || `[Documento] ${message.documentMessage?.fileName ?? ""}`.trim();
    case "stickerMessage":
      return "[Figurinha]";
    case "locationMessage":
      return "[Localização]";
    case "contactMessage":
      return "[Contato compartilhado]";
    default:
      return null;
  }
}

async function persistIncomingOrEcho(
  baileys: Baileys,
  msg: import("@whiskeysockets/baileys").proto.IWebMessageInfo
) {
  if (!msg.key) return;
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") return;

  const whatsappMessageId = msg.key.id;
  if (!whatsappMessageId) return;

  const already = await prisma.message.findUnique({ where: { whatsappMessageId } });
  if (already) return;

  const text = extractText(baileys, msg.message);
  if (!text) return;

  const fromMe = Boolean(msg.key.fromMe);
  const phone = jidToPhone(remoteJid);
  const pushName = !fromMe ? msg.pushName ?? null : null;

  const contact = await findOrCreateContact(phone, pushName);

  await prisma.$transaction([
    prisma.message.create({
      data: {
        contactId: contact.id,
        leadId: contact.currentLeadId,
        content: text,
        direction: fromMe ? "OUT" : "IN",
        senderId: null,
        whatsappMessageId,
        createdAt: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
      },
    }),
    prisma.contact.update({
      where: { id: contact.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);
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
        setState({ status: "qr", qr });
      }

      if (connection === "open") {
        setState({ status: "connected", qr: null, phone: jidToPhone(sock?.user?.id ?? ""), lastError: null });
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
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
      if (type !== "notify" && type !== "append") return;
      for (const msg of messages) {
        persistIncomingOrEcho(baileys, msg).catch((err) => {
          logger.error({ err }, "Falha ao gravar mensagem do WhatsApp.");
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

export async function sendWhatsappMessage(params: {
  phone: string;
  text: string;
  senderId: string;
}): Promise<{ id: string; createdAt: Date }> {
  if (!sock || state.status !== "connected") {
    throw new Error("WhatsApp não está conectado.");
  }

  const jid = phoneToJid(params.phone);
  const result = await sock.sendMessage(jid, { text: params.text });
  const whatsappMessageId = result?.key?.id;
  if (!whatsappMessageId) {
    throw new Error("Não foi possível confirmar o envio da mensagem.");
  }

  const contact = await findOrCreateContact(params.phone);
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
