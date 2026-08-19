import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const usersRouter = Router();

usersRouter.use(requireAuth);

function generateProvisionalPassword(): string {
  return crypto.randomBytes(6).toString("base64url");
}

usersRouter.get("/", requireRole("GESTOR"), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
  res.json({ users });
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["GESTOR", "ATENDENTE", "FINANCEIRO"]),
});

usersRouter.post("/", requireRole("GESTOR"), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return res.status(409).json({ error: "Já existe um usuário com este e-mail." });
  }

  const provisionalPassword = generateProvisionalPassword();
  const passwordHash = await bcrypt.hash(provisionalPassword, 10);

  const user = await prisma.user.create({
    data: {
      ...parsed.data,
      passwordHash,
      mustChangePassword: true,
    },
  });

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    },
    provisionalPassword,
  });
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["GESTOR", "ATENDENTE", "FINANCEIRO"]).optional(),
  active: z.boolean().optional(),
});

usersRouter.put("/:id", requireRole("GESTOR"), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    },
  });
});

usersRouter.post("/:id/reset-password", requireRole("GESTOR"), async (req, res) => {
  const provisionalPassword = generateProvisionalPassword();
  const passwordHash = await bcrypt.hash(provisionalPassword, 10);

  await prisma.user.update({
    where: { id: req.params.id },
    data: { passwordHash, mustChangePassword: true },
  });

  res.json({ provisionalPassword });
});
