// Backend Express foi descontinuado — tudo fala direto com Supabase
// (supabase-js, RLS, RPC, Edge Functions) e com a UAZAPI via Edge Functions.
// Este helper só formata mensagens de erro de forma consistente pra tela.
export function apiErrorMessage(error: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
