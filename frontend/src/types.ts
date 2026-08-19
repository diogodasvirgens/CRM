export type Role = "GESTOR" | "ATENDENTE" | "FINANCEIRO";
export type BusinessLine = "SHOW" | "EVENTO";
export type LeadOrigin = "INDICACAO" | "REDES_SOCIAIS" | "RECORRENCIA" | "TRAFEGO_PAGO" | "OUTRO";

export const ORIGIN_LABELS: Record<LeadOrigin, string> = {
  INDICACAO: "Indicação",
  REDES_SOCIAIS: "Redes sociais",
  RECORRENCIA: "Recorrência",
  TRAFEGO_PAGO: "Tráfego pago",
  OUTRO: "Outro",
};

export const ROLE_LABELS: Record<Role, string> = {
  GESTOR: "Gestor",
  ATENDENTE: "Atendente / Vendedor",
  FINANCEIRO: "Financeiro",
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  mustChangePassword?: boolean;
}

export interface Stage {
  id: string;
  businessLine: BusinessLine;
  name: string;
  order: number;
}

export interface Tag {
  id: string;
  name: string;
}

export interface EventEdition {
  id: string;
  name: string;
  date: string | null;
  location: string | null;
  ticketPrice: number | null;
}

export interface LeadHistoryEntry {
  id: string;
  field: "STAGE" | "OWNER";
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  changedBy: { id: string; name: string };
}

export interface Lead {
  id: string;
  contactName: string;
  phone: string;
  businessLine: BusinessLine;
  stageId: string;
  stage: Stage;
  estimatedValue: number | null;
  eventDate: string | null;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  origin: LeadOrigin;
  originDetail: string | null;
  notes: string | null;
  eventEditionId: string | null;
  eventEdition: { id: string; name: string } | null;
  tags: Tag[];
  history?: LeadHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
