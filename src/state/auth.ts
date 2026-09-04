import { create } from "zustand";
import { supabase } from "../api/supabaseClient";
import { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  updateUser: (partial: Partial<User>) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  updateUser: (partial) => set((s) => (s.user ? { user: { ...s.user, ...partial } } : s)),
  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  },
}));

async function loadProfile(userId: string, email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,role,active,must_change_password")
    .eq("id", userId)
    .single();

  if (error || !data || !data.active) return null;

  return {
    id: data.id,
    name: data.name,
    email,
    role: data.role,
    active: data.active,
    mustChangePassword: data.must_change_password,
  };
}

// onAuthStateChange dispara uma vez com a sessão já salva assim que o app
// carrega (restaurando login entre recarregamentos) e de novo a cada
// login/logout/refresh de token — cobre tanto o boot do app quanto as
// mudanças em tempo real.
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    const profile = await loadProfile(session.user.id, session.user.email ?? "");
    useAuthStore.getState().setUser(profile);
  } else {
    useAuthStore.getState().setUser(null);
  }
  useAuthStore.setState({ loading: false });
});
