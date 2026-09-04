import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { whatsappRouter } from "./routes/whatsapp";
import { conversationsRouter } from "./routes/conversations";
import { mediaRouter } from "./routes/media";

// Backend reduzido só ao que depende do Baileys (a conexão com o WhatsApp
// em si não roda em função serverless, precisa de processo persistente).
// Autenticação, leads, etapas, etiquetas, edições de evento e usuários
// migraram pra chamadas diretas do frontend ao Supabase (RLS + RPC) —
// ver frontend/src/api/resources.ts e supabase/functions/admin-users.
export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/whatsapp", whatsappRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/media", mediaRouter);

// Serve o frontend já compilado (frontend/dist) para que backend e frontend
// respondam num único localhost. Rode `npm run build` no frontend antes.
const frontendDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});
