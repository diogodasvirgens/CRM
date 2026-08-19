import { app } from "./app";
import { env } from "./env";

app.listen(env.port, () => {
  console.log(`API rodando em http://localhost:${env.port}`);
});
