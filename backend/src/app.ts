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

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/stages", stagesRouter);
app.use("/tags", tagsRouter);
app.use("/event-editions", eventEditionsRouter);
app.use("/leads", leadsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});
