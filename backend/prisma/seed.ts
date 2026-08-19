import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PROVISIONAL_PASSWORD = "Trocar@123";

const showStages = [
  "Acompanhar",
  "Reunião marcada",
  "Reunião feita",
  "Proposta enviada",
  "Sinal pago",
  "Quitado",
  "Perdido",
];

const eventoStages = [
  "Interessado",
  "Informado",
  "Pix enviado",
  "Pago",
  "Nome coletado",
  "Na lista",
  "Perdido",
];

async function main() {
  const passwordHash = await bcrypt.hash(PROVISIONAL_PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: "diogo@diogodasvirgens.com.br" },
    update: {},
    create: {
      name: "Diogo",
      email: "diogo@diogodasvirgens.com.br",
      role: "GESTOR",
      passwordHash,
      mustChangePassword: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "mauricio@diogodasvirgens.com.br" },
    update: {},
    create: {
      name: "Mauricio",
      email: "mauricio@diogodasvirgens.com.br",
      role: "ATENDENTE",
      passwordHash,
      mustChangePassword: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "secretaria@diogodasvirgens.com.br" },
    update: {},
    create: {
      name: "Secretária",
      email: "secretaria@diogodasvirgens.com.br",
      role: "ATENDENTE",
      passwordHash,
      mustChangePassword: true,
    },
  });

  for (const [index, name] of showStages.entries()) {
    await prisma.stage.upsert({
      where: { businessLine_order: { businessLine: "SHOW", order: index } },
      update: { name },
      create: { businessLine: "SHOW", name, order: index },
    });
  }

  for (const [index, name] of eventoStages.entries()) {
    await prisma.stage.upsert({
      where: { businessLine_order: { businessLine: "EVENTO", order: index } },
      update: { name },
      create: { businessLine: "EVENTO", name, order: index },
    });
  }

  console.log("Seed concluído.");
  console.log(`Senha provisória para todos os usuários iniciais: ${PROVISIONAL_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
