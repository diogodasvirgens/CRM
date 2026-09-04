import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Só usado pra validar o token de sessão que o frontend manda (auth.getUser).
// O backend acessa o banco direto via Prisma (DATABASE_URL), não passa pelo
// PostgREST/RLS, então a chave anônima aqui não precisa de mais privilégio
// que isso.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
