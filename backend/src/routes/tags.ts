import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const tagsRouter = Router();

tagsRouter.use(requireAuth);

tagsRouter.get("/", async (_req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  res.json({ tags });
});

const createTagSchema = z.object({ name: z.string().min(1) });

// Qualquer usuário logado pode criar etiqueta livremente, a qualquer momento.
tagsRouter.post("/", async (req, res) => {
  const parsed = createTagSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const name = parsed.data.name.trim();
  const existing = await prisma.tag.findUnique({ where: { name } });
  if (existing) return res.json({ tag: existing });

  const tag = await prisma.tag.create({ data: { name } });
  res.status(201).json({ tag });
});

// Apagar etiqueta é ação administrativa (tela de administração é exclusiva do Gestor).
tagsRouter.delete("/:id", requireRole("GESTOR"), async (req, res) => {
  await prisma.tag.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
