import { Message } from "../types";
import { useAuthedMediaUrl } from "../utils/useAuthedMediaUrl";
import { downloadMessageMedia } from "../api/resources";

const MEDIA_PLACEHOLDER_LABELS: Record<string, string> = {
  image: "[Imagem]",
  audio: "[Áudio]",
  video: "[Vídeo]",
  document: "[Documento]",
  sticker: "[Figurinha]",
};

export function MessageMedia({ message }: { message: Message }) {
  const url = useAuthedMediaUrl(message.mediaType ? message.id : null);

  if (!message.mediaType) return null;

  if (message.mediaType === "image" || message.mediaType === "sticker") {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="" className="message-media-image" />
      </a>
    ) : (
      <div className="message-media-loading">Carregando imagem...</div>
    );
  }

  if (message.mediaType === "audio") {
    return url ? (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio controls src={url} className="message-media-audio" />
    ) : (
      <div className="message-media-loading">Carregando áudio...</div>
    );
  }

  if (message.mediaType === "video") {
    return url ? (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video controls src={url} className="message-media-video" />
    ) : (
      <div className="message-media-loading">Carregando vídeo...</div>
    );
  }

  return (
    <button
      type="button"
      className="message-media-document"
      onClick={() => downloadMessageMedia(message.id, message.mediaFileName ?? "arquivo")}
    >
      📄 {message.mediaFileName ?? "Documento"}
    </button>
  );
}

export function messageHasVisibleCaption(message: Message): boolean {
  if (!message.mediaType) return true;
  return Boolean(message.content) && message.content !== MEDIA_PLACEHOLDER_LABELS[message.mediaType];
}
