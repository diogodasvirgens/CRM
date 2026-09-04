import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { canAccessInbox } from "../utils/permissions";
import { MediaType, sendWhatsappMedia, sendWhatsappMessage } from "../whatsapp/connection";

// Só o que realmente precisa do Baileys fica aqui — enviar mensagem/mídia.
// Listar conversas, ler mensagens, arquivar e criar lead a partir de uma
// conversa migraram pro frontend chamando o Supabase direto (RLS + RPC),
// já que não dependem da conexão com o WhatsApp em si.
export const conversationsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

function mediaTypeFromMime(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

conversationsRouter.use(requireAuth);
conversationsRouter.use((req, res, next) => {
  if (!canAccessInbox(req.user!)) {
    return res.status(403).json({ error: "Você não tem acesso à caixa de entrada." });
  }
  next();
});

const sendMessageSchema = z.object({ text: z.string().min(1) });

conversationsRouter.post("/:contactId/messages", async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
  if (!contact) return res.status(404).json({ error: "Conversa não encontrada." });

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const message = await sendWhatsappMessage({ contactId: contact.id, text: parsed.data.text, senderId: req.user!.id });
    res.status(201).json({ message });
  } catch (err: any) {
    res.status(409).json({ error: err?.message ?? "Não foi possível enviar a mensagem." });
  }
});

conversationsRouter.post("/:contactId/media", upload.single("file"), async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
  if (!contact) return res.status(404).json({ error: "Conversa não encontrada." });

  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado." });
  }

  const mediaType = mediaTypeFromMime(req.file.mimetype);
  const ptt = req.body.ptt === "true";
  const caption = typeof req.body.caption === "string" && req.body.caption.trim() ? req.body.caption.trim() : undefined;

  try {
    const message = await sendWhatsappMedia({
      contactId: contact.id,
      senderId: req.user!.id,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      mediaType,
      fileName: req.file.originalname,
      caption,
      ptt,
    });
    res.status(201).json({ message });
  } catch (err: any) {
    res.status(409).json({ error: err?.message ?? "Não foi possível enviar o arquivo." });
  }
});
