import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { canEditLead, canSetOwner, canWriteLeads } from "../utils/permissions";
import { findOrCreateContact } from "../utils/contacts";

export const leadsRouter = Router();

leadsRouter.use(requireAuth);

const leadInclude = {
  stage: true,
  owner: { select: { id: true, name: true } },
  eventEdition: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
  contact: true,
};

function serializeLead(lead: any) {
  return {
    ...lead,
    tags: lead.tags.map((lt: any) => lt.tag),
  };
}

leadsRouter.get("/", async (req, res) => {
  const { businessLine, stageId, ownerId, tagId } = req.query as Record<string, string | undefined>;

  const leads = await prisma.lead.findMany({
    where: {
      businessLine: businessLine as any,
      stageId,
      ownerId,
      tags: tagId ? { some: { tagId } } : undefined,
    },
    include: leadInclude,
    orderBy: { updatedAt: "desc" },
  });

  res.json({ leads: leads.map(serializeLead) });
});

leadsRouter.get("/:id", async (req, res) => {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id },
    include: {
      ...leadInclude,
      contact: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: { sender: { select: { id: true, name: true } } },
          },
        },
      },
      history: {
        include: { changedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  res.json({ lead: serializeLead(lead) });
});

const createLeadSchema = z.object({
  contactName: z.string().min(1),
  phone: z.string().min(1),
  businessLine: z.enum(["SHOW", "EVENTO"]),
  stageId: z.string().optional(),
  estimatedValue: z.number().nullable().optional(),
  eventDate: z.string().datetime().nullable().optional(),
  eventType: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  origin: z.enum(["INDICACAO", "REDES_SOCIAIS", "RECORRENCIA", "TRAFEGO_PAGO", "OUTRO"]),
  originDetail: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  eventEditionId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
});

leadsRouter.post("/", async (req, res) => {
  if (!canWriteLeads(req.user!)) {
    return res.status(403).json({ error: "Você não tem permissão para criar leads." });
  }

  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const data = parsed.data;

  if (data.ownerId !== undefined && data.ownerId !== null && !canSetOwner(req.user!, data.ownerId)) {
    return res.status(403).json({ error: "Você só pode atribuir o lead a si mesmo." });
  }

  let stageId = data.stageId;
  if (!stageId) {
    const firstStage = await prisma.stage.findFirst({
      where: { businessLine: data.businessLine },
      orderBy: { order: "asc" },
    });
    if (!firstStage) {
      return res.status(409).json({ error: "Não há etapas cadastradas para este funil." });
    }
    stageId = firstStage.id;
  }

  const contact = await findOrCreateContact(data.phone, data.contactName);

  const lead = await prisma.lead.create({
    data: {
      contactName: data.contactName,
      contactId: contact.id,
      businessLine: data.businessLine,
      stageId,
      estimatedValue: data.estimatedValue ?? null,
      eventDate: data.eventDate ? new Date(data.eventDate) : null,
      eventType: data.eventType ?? null,
      location: data.location ?? null,
      ownerId: data.ownerId ?? null,
      origin: data.origin,
      originDetail: data.originDetail ?? null,
      notes: data.notes ?? null,
      eventEditionId: data.businessLine === "EVENTO" ? data.eventEditionId ?? null : null,
      tags: data.tagIds ? { create: data.tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
    include: leadInclude,
  });

  await prisma.contact.update({ where: { id: contact.id }, data: { currentLeadId: lead.id } });

  res.status(201).json({ lead: serializeLead(lead) });
});

const updateLeadSchema = z.object({
  contactName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  stageId: z.string().optional(),
  estimatedValue: z.number().nullable().optional(),
  eventDate: z.string().datetime().nullable().optional(),
  eventType: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  origin: z.enum(["INDICACAO", "REDES_SOCIAIS", "RECORRENCIA", "TRAFEGO_PAGO", "OUTRO"]).optional(),
  originDetail: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  eventEditionId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
});

leadsRouter.put("/:id", async (req, res) => {
  const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Lead não encontrado." });

  if (!canEditLead(req.user!, existing)) {
    return res.status(403).json({ error: "Você não pode editar este lead." });
  }

  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const data = parsed.data;

  if (data.ownerId !== undefined && !canSetOwner(req.user!, data.ownerId)) {
    return res.status(403).json({ error: "Você só pode atribuir o lead a si mesmo ou deixá-lo sem responsável." });
  }

  let contactId: string | undefined;
  if (data.phone !== undefined) {
    const currentContact = await prisma.contact.findUnique({ where: { id: existing.contactId } });
    const targetContact = await findOrCreateContact(data.phone, data.contactName ?? existing.contactName);
    if (targetContact.id !== existing.contactId) {
      contactId = targetContact.id;
      if (currentContact?.currentLeadId === existing.id) {
        await prisma.contact.update({ where: { id: currentContact.id }, data: { currentLeadId: null } });
      }
      await prisma.contact.update({ where: { id: targetContact.id }, data: { currentLeadId: existing.id } });
    }
  }

  const historyEntries: { field: "STAGE" | "OWNER"; oldValue: string | null; newValue: string | null }[] = [];

  if (data.stageId && data.stageId !== existing.stageId) {
    const [oldStage, newStage] = await Promise.all([
      prisma.stage.findUnique({ where: { id: existing.stageId } }),
      prisma.stage.findUnique({ where: { id: data.stageId } }),
    ]);
    if (!newStage) return res.status(400).json({ error: "Etapa inválida." });
    historyEntries.push({ field: "STAGE", oldValue: oldStage?.name ?? null, newValue: newStage.name });
  }

  if (data.ownerId !== undefined && data.ownerId !== existing.ownerId) {
    const [oldOwner, newOwner] = await Promise.all([
      existing.ownerId ? prisma.user.findUnique({ where: { id: existing.ownerId } }) : null,
      data.ownerId ? prisma.user.findUnique({ where: { id: data.ownerId } }) : null,
    ]);
    historyEntries.push({
      field: "OWNER",
      oldValue: oldOwner?.name ?? null,
      newValue: newOwner?.name ?? null,
    });
  }

  const lead = await prisma.lead.update({
    where: { id: existing.id },
    data: {
      contactName: data.contactName,
      contactId,
      stageId: data.stageId,
      estimatedValue: data.estimatedValue,
      eventDate: data.eventDate !== undefined ? (data.eventDate ? new Date(data.eventDate) : null) : undefined,
      eventType: data.eventType,
      location: data.location,
      ownerId: data.ownerId,
      origin: data.origin,
      originDetail: data.originDetail,
      notes: data.notes,
      eventEditionId: data.eventEditionId,
      tags: data.tagIds
        ? {
            deleteMany: {},
            create: data.tagIds.map((tagId) => ({ tagId })),
          }
        : undefined,
      history: historyEntries.length
        ? { create: historyEntries.map((entry) => ({ ...entry, changedById: req.user!.id })) }
        : undefined,
    },
    include: leadInclude,
  });

  res.json({ lead: serializeLead(lead) });
});

leadsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Lead não encontrado." });

  if (!canEditLead(req.user!, existing)) {
    return res.status(403).json({ error: "Você não pode apagar este lead." });
  }

  const contact = await prisma.contact.findUnique({ where: { id: existing.contactId } });
  if (contact?.currentLeadId === existing.id) {
    await prisma.contact.update({ where: { id: contact.id }, data: { currentLeadId: null } });
  }

  await prisma.lead.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});
