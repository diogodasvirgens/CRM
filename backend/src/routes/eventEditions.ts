import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const eventEditionsRouter = Router();

eventEditionsRouter.use(requireAuth);

eventEditionsRouter.get("/", async (_req, res) => {
  const editions = await prisma.eventEdition.findMany({ orderBy: { date: "desc" } });
  res.json({ editions });
});

const editionSchema = z.object({
  name: z.string().min(1),
  date: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
  ticketPrice: z.number().nullable().optional(),
});

eventEditionsRouter.post("/", requireRole("GESTOR"), async (req, res) => {
  const parsed = editionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const edition = await prisma.eventEdition.create({
    data: {
      name: parsed.data.name,
      date: parsed.data.date ? new Date(parsed.data.date) : null,
      location: parsed.data.location ?? null,
      ticketPrice: parsed.data.ticketPrice ?? null,
    },
  });

  res.status(201).json({ edition });
});

eventEditionsRouter.put("/:id", requireRole("GESTOR"), async (req, res) => {
  const parsed = editionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const edition = await prisma.eventEdition.update({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      date: parsed.data.date !== undefined ? (parsed.data.date ? new Date(parsed.data.date) : null) : undefined,
    },
  });

  res.json({ edition });
});

eventEditionsRouter.delete("/:id", requireRole("GESTOR"), async (req, res) => {
  const leadCount = await prisma.lead.count({ where: { eventEditionId: req.params.id } });
  if (leadCount > 0) {
    return res.status(409).json({ error: "Não é possível apagar uma edição com leads vinculados." });
  }

  await prisma.eventEdition.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Lista de convidados para a portaria: nome e telefone de quem está vinculado à edição.
eventEditionsRouter.get("/:id/guests", async (req, res) => {
  const edition = await prisma.eventEdition.findUnique({ where: { id: req.params.id } });
  if (!edition) return res.status(404).json({ error: "Edição não encontrada." });

  const leads = await prisma.lead.findMany({
    where: { eventEditionId: req.params.id },
    include: { stage: true },
    orderBy: { contactName: "asc" },
  });

  res.json({
    edition,
    guests: leads.map((lead) => ({
      id: lead.id,
      name: lead.contactName,
      phone: lead.phone,
      stage: lead.stage.name,
    })),
  });
});

eventEditionsRouter.get("/:id/guests/export", async (req, res) => {
  const edition = await prisma.eventEdition.findUnique({ where: { id: req.params.id } });
  if (!edition) return res.status(404).json({ error: "Edição não encontrada." });

  const leads = await prisma.lead.findMany({
    where: { eventEditionId: req.params.id },
    include: { stage: true },
    orderBy: { contactName: "asc" },
  });

  const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const rows = [
    ["Nome", "Telefone", "Etapa"].map(escapeCsv).join(","),
    ...leads.map((lead) => [lead.contactName, lead.phone, lead.stage.name].map(escapeCsv).join(",")),
  ];

  const filename = `convidados-${edition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("﻿" + rows.join("\n"));
});
