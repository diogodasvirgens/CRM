import { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { supabase } from "../supabaseClient";
import { Role } from "../types";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não informado." });
  }

  const token = header.slice("Bearer ".length);

  // O frontend agora manda o access_token do Supabase Auth (não mais um JWT
  // customizado). auth.getUser valida a assinatura/expiração de verdade
  // junto ao Supabase.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }

  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
  if (!profile || !profile.active) {
    return res.status(401).json({ error: "Usuário inválido ou inativo." });
  }

  req.user = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role as Role,
  };
  next();
}
