import { create } from "zustand";
import { User } from "../types";

interface AuthState {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
}

const storedToken = localStorage.getItem("crm_token");
const storedUser = localStorage.getItem("crm_user");

export const useAuthStore = create<AuthState>((set, get) => ({
  token: storedToken,
  user: storedUser ? JSON.parse(storedUser) : null,
  setSession: (token, user) => {
    localStorage.setItem("crm_token", token);
    localStorage.setItem("crm_user", JSON.stringify(user));
    set({ token, user });
  },
  updateUser: (partial) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...partial };
    localStorage.setItem("crm_user", JSON.stringify(updated));
    set({ user: updated });
  },
  logout: () => {
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
    set({ token: null, user: null });
  },
}));
