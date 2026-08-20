import { app } from "./app";
import { env } from "./env";
import { startWhatsapp } from "./whatsapp/connection";

// Rede instável (wifi caindo, Mac dormindo) faz bibliotecas de baixo nível
// (fetch/undici, dentro do próprio Baileys) emitirem erro fora de qualquer
// try/catch nosso. Sem isso, um único soquete resetado derrubava o processo
// inteiro — não só a conexão do WhatsApp, a API inteira junto. Loga e
// continua: a lógica de reconexão do WhatsApp já trata queda de conexão
// de verdade; isto é só a rede de segurança pra erros que escapam dela.
process.on("uncaughtException", (err) => {
  console.error("Erro não tratado (processo continua rodando):", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Promise rejeitada sem tratamento (processo continua rodando):", err);
});

app.listen(env.port, () => {
  console.log(`API rodando em http://localhost:${env.port}`);
});

startWhatsapp().catch((err) => {
  console.error("Falha ao iniciar conexão com o WhatsApp:", err);
});
