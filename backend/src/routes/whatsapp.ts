import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { getWhatsappQrDataUrl, getWhatsappState, logoutWhatsapp, startWhatsapp } from "../whatsapp/connection";

export const whatsappRouter = Router();

whatsappRouter.use(requireAuth, requireRole("GESTOR"));

whatsappRouter.get("/status", async (_req, res) => {
  const state = getWhatsappState();
  const qr = await getWhatsappQrDataUrl();
  res.json({ ...state, qr });
});

whatsappRouter.post("/logout", async (_req, res) => {
  await logoutWhatsapp();
  startWhatsapp().catch(() => undefined);
  res.json({ ok: true });
});
