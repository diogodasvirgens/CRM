import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export const env = {
  jwtSecret: required("JWT_SECRET"),
  port: Number(process.env.PORT ?? 3333),
};
