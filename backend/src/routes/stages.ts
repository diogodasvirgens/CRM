import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const stagesRouter = Router();

stagesRouter.use(requireAuth);

stagesRouter.get("/", async (_req, res) => {
  const stages = await prisma.stage.findMany({ orderBy: [{ businessLine: "asc" }, { order: "asc" }] });
  res.json({ stages });
});

const createStageSchema = z.object({
  businessLine: z.enum(["SHOW", "EVENTO"]),
  name: z.string().min(1),
});

stagesRouter.post("/", requireRole("GESTOR"), async (req, res) => {
  const parsed = createStageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const last = await prisma.stage.findFirst({
    where: { businessLine: parsed.data.businessLine },
    orderBy: { order: "desc" },
  });

  const stage = await prisma.stage.create({
    data: {
      businessLine: parsed.data.businessLine,
      name: parsed.data.name,
      order: (last?.order ?? -1) + 1,
    },
  });

  res.status(201).json({ stage });
});

const renameStageSchema = z.object({ name: z.string().min(1) });

stagesRouter.put("/:id", requireRole("GESTOR"), async (req, res) => {
  const parsed = renameStageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const stage = await prisma.stage.update({
    where: { id: req.params.id },
    data: { name: parsed.data.name },
  });

  res.json({ stage });
});

const reorderSchema = z.object({
  businessLine: z.enum(["SHOW", "EVENTO"]),
  orderedIds: z.array(z.string()).min(1),
});

stagesRouter.put("/reorder/all", requireRole("GESTOR"), async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { businessLine, orderedIds } = parsed.data;

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.stage.update({
        where: { id },
        data: { order: index + 1000 },
      })
    )
  );
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.stage.update({
        where: { id },
        data: { order: index },
      })
    )
  );

  const stages = await prisma.stage.findMany({
    where: { businessLine },
    orderBy: { order: "asc" },
  });
  res.json({ stages });
});

stagesRouter.delete("/:id", requireRole("GESTOR"), async (req, res) => {
  const stage = await prisma.stage.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { leads: true } } },
  });

  if (!stage) {
    return res.status(404).json({ error: "Etapa não encontrada." });
  }

  if (stage._count.leads > 0) {
    return res.status(409).json({ error: "Não é possível apagar uma etapa com leads. Mova os leads antes." });
  }

  const siblingCount = await prisma.stage.count({ where: { businessLine: stage.businessLine } });
  if (siblingCount <= 1) {
    return res.status(409).json({ error: "O funil precisa de pelo menos uma etapa." });
  }

  await prisma.stage.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
