import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { canAccessInbox, canWriteLeads } from "../utils/permissions";
import { sendWhatsappMessage } from "../whatsapp/connection";

export const conversationsRouter = Router();

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

conversationsRouter.get("/", async (req, res) => {
  const { archived, q, stageId } = req.query as Record<string, string | undefined>;
  const showArchived = archived === "true";

  const contacts = await prisma.contact.findMany({
    where: {
      archivedAt: showArchived ? { not: null } : null,
      currentLead: stageId ? (stageId === "none" ? null : { stageId }) : undefined,
      OR: q
        ? [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { messages: { some: { content: { contains: q, mode: "insensitive" } } } },
          ]
        : undefined,
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

const sendMessageSchema = z.object({ text: z.string().min(1) });

conversationsRouter.post("/:contactId/messages", async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
  if (!contact) return res.status(404).json({ error: "Conversa não encontrada." });

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const message = await sendWhatsappMessage({ phone: contact.phone, text: parsed.data.text, senderId: req.user!.id });
    res.status(201).json({ message });
  } catch (err: any) {
    res.status(409).json({ error: err?.message ?? "Não foi possível enviar a mensagem." });
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
      ownerId: req.user!.role === "ATENDENTE" ? req.user!.id : null,
    },
    include: { stage: true, owner: { select: { id: true, name: true } } },
  });

  await prisma.contact.update({ where: { id: contact.id }, data: { currentLeadId: lead.id } });

  res.status(201).json({ lead });
});
