// SQLite não suporta enum nativo no Prisma, então esses valores vivem como
// String no schema e ganham tipagem forte aqui, usada em toda a aplicação.

export type Role = "GESTOR" | "ATENDENTE" | "FINANCEIRO";
export type BusinessLine = "SHOW" | "EVENTO";
export type LeadOrigin = "INDICACAO" | "REDES_SOCIAIS" | "RECORRENCIA" | "TRAFEGO_PAGO" | "OUTRO";
export type HistoryField = "STAGE" | "OWNER";
