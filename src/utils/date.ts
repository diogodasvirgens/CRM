// Formata uma data-calendário (sem hora) a partir do prefixo YYYY-MM-DD do
// ISO string, sem passar por `new Date(...).toLocaleDateString()`. Isso evita
// o Date interpretar "2026-08-20" como meia-noite UTC e depois converter pro
// fuso local, o que empurra a data exibida um dia pra trás no Brasil (UTC-3).
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

// Horário de Brasília fixo (America/Sao_Paulo), independente do fuso do
// navegador de quem está acessando — evita mensagem "chegando" com hora
// errada pra quem abre o CRM fora do fuso do negócio.
const BRASILIA_TZ = "America/Sao_Paulo";

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BRASILIA_TZ });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: BRASILIA_TZ });
}
