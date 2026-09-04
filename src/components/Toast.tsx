import { useToastStore } from "../state/toast";

export function Toast() {
  const { message, variant } = useToastStore();
  if (!message) return null;
  return <div className={`toast ${variant === "error" ? "error" : ""}`}>{message}</div>;
}
