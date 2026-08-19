import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { stagesRouter } from "./routes/stages";
import { tagsRouter } from "./routes/tags";
import { eventEditionsRouter } from "./routes/eventEditions";
import { leadsRouter } from "./routes/leads";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/stages", stagesRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/event-editions", eventEditionsRouter);
app.use("/api/leads", leadsRouter);

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
