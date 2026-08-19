import { useEffect, useState } from "react";
import { api } from "../api/client";

// Mídia é servida atrás de autenticação (o mesmo JWT do resto da API), então
// uma tag <img>/<audio src="..."> comum não funciona — o navegador não anexa
// o header Authorization num carregamento de recurso. Em vez disso buscamos
// o arquivo via axios (que já anexa o token) e criamos uma URL local a
// partir do blob.
export function useAuthedMediaUrl(messageId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!messageId) {
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    api
      .get(`/media/${messageId}`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
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
