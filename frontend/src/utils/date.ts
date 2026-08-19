// Formata uma data-calendário (sem hora) a partir do prefixo YYYY-MM-DD do
// ISO string, sem passar por `new Date(...).toLocaleDateString()`. Isso evita
// o Date interpretar "2026-08-20" como meia-noite UTC e depois converter pro
// fuso local, o que empurra a data exibida um dia pra trás no Brasil (UTC-3).
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
