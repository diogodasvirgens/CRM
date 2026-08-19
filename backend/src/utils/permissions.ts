import { Lead } from "@prisma/client";
import { Role } from "../types";
import { AuthUser } from "../middleware/auth";

/** Financeiro é somente leitura em tudo relacionado a leads. */
export function canWriteLeads(user: AuthUser): boolean {
  return user.role === "GESTOR" || user.role === "ATENDENTE";
}

/**
 * Gestor edita qualquer lead. Atendente só edita lead sem responsável
 * ou que já é dele. Financeiro nunca edita.
 */
export function canEditLead(user: AuthUser, lead: Pick<Lead, "ownerId">): boolean {
  if (user.role === "GESTOR") return true;
  if (user.role === "FINANCEIRO") return false;
  return lead.ownerId === null || lead.ownerId === user.id;
}

/** Atendente não pode atribuir lead a outra pessoa, só a si mesmo ou soltar. */
export function canSetOwner(user: AuthUser, newOwnerId: string | null): boolean {
  if (user.role === "GESTOR") return true;
  if (user.role === "FINANCEIRO") return false;
  return newOwnerId === null || newOwnerId === user.id;
}

export function assertRole(user: AuthUser, ...roles: Role[]): boolean {
  return roles.includes(user.role);
}

/** Financeiro não conversa pelo WhatsApp: sem acesso à caixa de entrada. */
export function canAccessInbox(user: AuthUser): boolean {
  return user.role !== "FINANCEIRO";
}
