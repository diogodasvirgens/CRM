import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { canAccessInbox, canWriteLeads } from "../utils/permissions";
import { deleteMedia } from "../utils/media";
import { MediaType, sendWhatsappMedia, sendWhatsappMessage } from "../whatsapp/connection";

export const conversationsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

function mediaTypeFromMime(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

conversationsRouter.use(requireAuth);
conversationsRouter.use((req, res, next) => {
  if (!canAccessInbox(req.user!)) {
    return res.status(403).json({ error: "Você não tem acesso à caixa de entrada." });
  }
  next();
});

function serializeContact(contact: any) {
  const lastMessage = contact.messages[0] ?? null;
  const unread = Boolean(
    lastMessage && lastMessage.direction === "IN" && (!contact.lastReadAt || lastMessage.createdAt > contact.lastReadAt)
  );

  return {
    id: contact.id,
    phone: contact.phone,
    name: contact.name,
    archivedAt: contact.archivedAt,
    lastMessageAt: contact.lastMessageAt,
    unread,
    lastMessage: lastMessage
      ? { content: lastMessage.content, direction: lastMessage.direction, createdAt: lastMessage.createdAt }
      : null,
    currentLead: contact.currentLead
      ? {
          id: contact.currentLead.id,
          contactName: contact.currentLead.contactName,
          businessLine: contact.currentLead.businessLine,
          stage: contact.currentLead.stage,
        }
      : null,
  };
}

// Mesma lógica de busca tolerante a erro de digitação/acento usada em leads
// (ver findMatchingLeadIds em routes/leads.ts), aplicada a nome do contato e
// conteúdo das mensagens; telefone compara só os dígitos.
async function findMatchingContactIds(q: string): Promise<string[]> {
  const digitsOnly = q.replace(/\D/g, "");

  const conditions: Prisma.Sql[] = [
    Prisma.sql`extensions.similarity(extensions.unaccent(coalesce(c.name, '')), extensions.unaccent(${q})) > 0.2`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM "Message" m
      WHERE m."contactId" = c.id AND extensions.similarity(extensions.unaccent(m.content), extensions.unaccent(${q})) > 0.2
    )`,
  ];
  if (digitsOnly) {
    conditions.push(Prisma.sql`regexp_replace(c.phone, '\D', '', 'g') LIKE ${"%" + digitsOnly + "%"}`);
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT c.id FROM "Contact" c WHERE ${Prisma.join(conditions, " OR ")}
  `);
  return rows.map((r) => r.id);
}

conversationsRouter.get("/", async (req, res) => {
  const { archived, q, stageId } = req.query as Record<string, string | undefined>;
  const showArchived = archived === "true";

  const contacts = await prisma.contact.findMany({
    where: {
      archivedAt: showArchived ? { not: null } : null,
      currentLead: stageId ? (stageId === "none" ? null : { stageId }) : undefined,
      id: q ? { in: await findMatchingContactIds(q) } : undefined,
    },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      currentLead: {
        select: { id: true, contactName: true, businessLine: true, stage: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
  });

  res.json({ conversations: contacts.map(serializeContact) });
});

conversationsRouter.get("/:contactId/messages", async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
  if (!contact) return res.status(404).json({ error: "Conversa não encontrada." });

  const messages = await prisma.message.findMany({
    where: { contactId: contact.id },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true } } },
  });

  await prisma.contact.update({ where: { id: contact.id }, data: { lastReadAt: new Date() } });

  res.json({ contact, messages });
});

// Apaga só o registro dentro do CRM (e o arquivo de mídia, se tiver) — não
// tenta revogar a mensagem no WhatsApp em si. O WhatsApp só permite "apagar
// pra todos" mensagens que a própria conta enviou, dentro de uma janela de
// tempo curta; apagar aqui cobre qualquer mensagem, de qualquer direção, a
// qualquer momento, então os dois comportamentos não seriam a mesma coisa.
conversationsRouter.delete("/:contactId/messages/:messageId", async (req, res) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.contactId !== req.params.contactId) {
    return res.status(404).json({ error: "Mensagem não encontrada." });
  }

  await prisma.message.delete({ where: { id: message.id } });
  if (message.mediaType) {
    await deleteMedia(message.id);
  }

  res.json({ ok: true });
});

const sendMessageSchema = z.object({ text: z.string().min(1) });

conversationsRouter.post("/:contactId/messages", async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
  if (!contact) return res.status(404).json({ error: "Conversa não encontrada." });

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const message = await sendWhatsappMessage({ contactId: contact.id, text: parsed.data.text, senderId: req.user!.id });
    res.status(201).json({ message });
  } catch (err: any) {
    res.status(409).json({ error: err?.message ?? "Não foi possível enviar a mensagem." });
  }
});

conversationsRouter.post("/:contactId/media", upload.single("file"), async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
  if (!contact) return res.status(404).json({ error: "Conversa não encontrada." });

  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado." });
  }

  const mediaType = mediaTypeFromMime(req.file.mimetype);
  const ptt = req.body.ptt === "true";
  const caption = typeof req.body.caption === "string" && req.body.caption.trim() ? req.body.caption.trim() : undefined;

  try {
    const message = await sendWhatsappMedia({
      contactId: contact.id,
      senderId: req.user!.id,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      mediaType,
      fileName: req.file.originalname,
      caption,
      ptt,
    });
    res.status(201).json({ message });
  } catch (err: any) {
    res.status(409).json({ error: err?.message ?? "Não foi possível enviar o arquivo." });
  }
});

conversationsRouter.post("/:contactId/archive", async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
  if (!contact) return res.status(404).json({ error: "Conversa não encontrada." });

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: { archivedAt: contact.archivedAt ? null : new Date() },
  });

  res.json({ contact: updated });
});

const createLeadFromConversationSchema = z.object({ businessLine: z.enum(["SHOW", "EVENTO"]) });

conversationsRouter.post("/:contactId/lead", async (req, res) => {
  if (!canWriteLeads(req.user!)) {
    return res.status(403).json({ error: "Você não tem permissão para criar leads." });
  }

  const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
  if (!contact) return res.status(404).json({ error: "Conversa não encontrada." });
  if (contact.currentLeadId) {
    return res.status(409).json({ error: "Esta conversa já está ligada a um lead." });
  }

  const parsed = createLeadFromConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const firstStage = await prisma.stage.findFirst({
    where: { businessLine: parsed.data.businessLine },
    orderBy: { order: "asc" },
  });
  if (!firstStage) {
    return res.status(409).json({ error: "Não há etapas cadastradas para este funil." });
  }

  const lead = await prisma.lead.create({
    data: {
      contactName: contact.name ?? contact.phone,
      contactId: contact.id,
      businessLine: parsed.data.businessLine,
      stageId: firstStage.id,
      origin: "OUTRO",
      originDetail: "Caixa de entrada do WhatsApp",
      // Quem converte a conversa em lead assume ele — mesma regra de "quem
      // traz o lead pro funil vira responsável" usada ao mudar de etapa.
      ownerId: req.user!.id,
    },
    include: { stage: true, owner: { select: { id: true, name: true } } },
  });

  await prisma.contact.update({ where: { id: contact.id }, data: { currentLeadId: lead.id } });

  res.status(201).json({ lead });
});
