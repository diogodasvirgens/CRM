import axios from "axios";
import { supabase } from "./supabaseClient";

// Em modo porta única (backend servindo o frontend já compilado), "/api" já
// é o caminho certo. Quando o frontend é hospedado separado (ex.: Vercel) e
// o backend mora em outra URL, defina VITE_API_BASE_URL no ambiente de build
// (ex.: "https://seu-backend.up.railway.app/api").
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || "/api" });

// O backend Express (só o que depende do Baileys — WhatsApp e mídia) agora
// valida o JWT do Supabase Auth, não mais um token customizado. Anexa o
// access_token da sessão atual em toda chamada.
api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export function apiErrorMessage(error: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (axios.isAxiosError(error) && error.response?.data?.error) {
    return error.response.data.error as string;
  }
  return fallback;
}
