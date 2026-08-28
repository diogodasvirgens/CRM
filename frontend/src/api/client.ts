import axios from "axios";
import { useAuthStore } from "../state/auth";

// Em modo porta única (backend servindo o frontend já compilado), "/api" já
// é o caminho certo. Quando o frontend é hospedado separado (ex.: Vercel) e
// o backend mora em outra URL, defina VITE_API_BASE_URL no ambiente de build
// (ex.: "https://seu-backend.up.railway.app/api").
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || "/api" });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (axios.isAxiosError(error) && error.response?.data?.error) {
    return error.response.data.error as string;
  }
  return fallback;
}
