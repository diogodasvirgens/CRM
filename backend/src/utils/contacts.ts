import { prisma } from "../db";

/**
 * WhatsApp JIDs and manually-typed phone numbers need to collapse to the same
 * key for a Contact lookup to unify them (e.g. "(11) 99999-9999" typed on a
 * manual lead vs. "5511999999999" from Baileys). We keep only digits; this is
 * best-effort (a manually-typed number missing the country code won't match
 * an incoming WhatsApp message until someone fixes it), not full E.164.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function findOrCreateContact(phone: string, name?: string | null, whatsappJid?: string | null) {
  const normalized = normalizePhone(phone);

  const existing = await prisma.contact.findUnique({ where: { phone: normalized } });
  if (existing) {
    const data: { name?: string; whatsappJid?: string } = {};
    if (name && !existing.name) data.name = name;
    if (whatsappJid && whatsappJid !== existing.whatsappJid) data.whatsappJid = whatsappJid;
    if (Object.keys(data).length > 0) {
      return prisma.contact.update({ where: { id: existing.id }, data });
    }
    return existing;
  }

  return prisma.contact.create({ data: { phone: normalized, name: name ?? null, whatsappJid: whatsappJid ?? null } });
}
