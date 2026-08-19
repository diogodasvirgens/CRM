import { app } from "./app";
import { env } from "./env";
import { startWhatsapp } from "./whatsapp/connection";

app.listen(env.port, () => {
  console.log(`API rodando em http://localhost:${env.port}`);
});

startWhatsapp().catch((err) => {
  console.error("Falha ao iniciar conexão com o WhatsApp:", err);
});
