import { create } from "zustand";

interface ToastState {
  message: string | null;
  variant: "info" | "error";
  show: (message: string, variant?: "info" | "error") => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: "info",
  show: (message, variant = "info") => {
    set({ message, variant });
    setTimeout(() => set({ message: null }), 3500);
  },
  clear: () => set({ message: null }),
}));
