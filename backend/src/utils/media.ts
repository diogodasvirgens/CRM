import fs from "node:fs";
import path from "node:path";

// Mídia de mensagens (fotos, áudios, documentos) fica em disco local, no
// mesmo espírito de whatsapp-session/: essa aplicação roda num único
// servidor local, então não há motivo pra depender de um provedor de
// armazenamento externo (e de mais uma credencial pra gerenciar) só pra
// isso. O nome do arquivo é sempre o id da Message dona daquela mídia.
const mediaDir = path.join(__dirname, "../../media-storage");

export function mediaPathFor(messageId: string): string {
  return path.join(mediaDir, messageId);
}

export async function saveMedia(messageId: string, buffer: Buffer): Promise<void> {
  await fs.promises.mkdir(mediaDir, { recursive: true });
  await fs.promises.writeFile(mediaPathFor(messageId), buffer);
}

export function mediaExists(messageId: string): boolean {
  return fs.existsSync(mediaPathFor(messageId));
}

export async function deleteMedia(messageId: string): Promise<void> {
  await fs.promises.rm(mediaPathFor(messageId), { force: true });
}
