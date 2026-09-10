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

// As colunas de timestamp do banco são `timestamp without time zone`, mas
// guardam o instante em UTC (sessão do Postgres é UTC) — o PostgREST devolve
// esse valor sem sufixo "Z" (ex.: "2026-09-10T13:26:00"). Sem isso, o
// `new Date(...)` do navegador interpreta a string como hora LOCAL do
// próprio navegador, não como UTC, e a conversão pro fuso de Brasília sai
// errada (soma/subtrai o fuso duas vezes). Força UTC explicitamente quando a
// string não já tem um indicador de fuso (Z ou ±HH:MM).
function parseDbTimestamp(value: string): Date {
  const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasTimezone ? value : `${value.replace(" ", "T")}Z`);
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return parseDbTimestamp(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BRASILIA_TZ,
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return parseDbTimestamp(iso).toLocaleString("pt-BR", { timeZone: BRASILIA_TZ });
}
