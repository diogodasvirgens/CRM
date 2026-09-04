import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

// Mídia fica num bucket privado do Supabase Storage (RLS restringe leitura a
// quem tem acesso à caixa de entrada), então baixamos o blob autenticado e
// criamos uma URL local a partir dele.
export function useAuthedMediaUrl(messageId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!messageId) {
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    supabase.storage
      .from("whatsapp-media")
      .download(messageId)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [messageId]);

  return url;
}
