import { AuthUser } from "../middleware/auth";

/** Financeiro não conversa pelo WhatsApp: sem acesso à caixa de entrada. */
export function canAccessInbox(user: AuthUser): boolean {
  return user.role !== "FINANCEIRO";
}
