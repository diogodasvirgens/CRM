import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { mediaExists, mediaPathFor } from "../utils/media";

export const mediaRouter = Router();

mediaRouter.use(requireAuth);

mediaRouter.get("/:messageId", async (req, res) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message || !message.mediaType) {
    return res.status(404).json({ error: "Mídia não encontrada." });
  }
  if (!mediaExists(message.id)) {
    return res.status(404).json({ error: "Arquivo de mídia não está mais disponível." });
  }

  res.setHeader("Content-Type", message.mediaMimeType ?? "application/octet-stream");
  if (message.mediaType === "document") {
    const fileName = message.mediaFileName ?? "arquivo";
    res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
  }
  res.sendFile(mediaPathFor(message.id));
});
