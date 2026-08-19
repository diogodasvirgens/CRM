import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

/**
 * O WhatsApp exige o contêiner OGG (codec Opus) pra tratar um áudio como
 * mensagem de voz de verdade. O MediaRecorder do navegador grava em WebM
 * (mesmo codec Opus, contêiner diferente) — mandar isso direto faz o upload
 * "funcionar" (o Baileys recebe um id de mensagem válido), mas o áudio não
 * toca do outro lado. Transcodificamos com ffmpeg antes de enviar.
 *
 * Container certo (OGG) não bastou: a mensagem chegava reconhecida como
 * áudio mas muda. O perfil de mensagem de voz do WhatsApp espera mono a
 * 16kHz — o navegador grava a 48kHz (às vezes estéreo), e sem forçar essa
 * taxa de amostragem e o número de canais o áudio resultante não toca em
 * alguns clientes mesmo com o contêiner/codec corretos.
 */
export async function transcodeToOggOpus(buffer: Buffer): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg não está disponível neste servidor.");
  }

  const scratchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(os.tmpdir(), `${scratchId}-in`);
  const outputPath = path.join(os.tmpdir(), `${scratchId}-out.ogg`);

  await fs.promises.writeFile(inputPath, buffer);
  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-avoid_negative_ts",
      "make_zero",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-vn",
      "-f",
      "ogg",
      outputPath,
    ]);
    return await fs.promises.readFile(outputPath);
  } finally {
    await fs.promises.rm(inputPath, { force: true });
    await fs.promises.rm(outputPath, { force: true });
  }
}
