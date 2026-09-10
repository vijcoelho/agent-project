/**
 * Ditado. O navegador grava e decodifica; o Whisper roda no servidor local.
 *
 * O áudio não sai da máquina: vai como PCM cru para o localhost. Decodificar
 * aqui evita precisar de codec no servidor — o navegador já sabe abrir o
 * formato que ele mesmo gravou.
 */

export type EstadoVoz = "ocioso" | "ouvindo" | "transcrevendo";

/** Whisper quer mono a 16kHz; a placa grava no que quiser. */
async function paraPCM(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buffer.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

async function enviar(pcm: Float32Array, traduzir: boolean): Promise<string> {
  const res = await fetch(`/api/voz?traduzir=${traduzir ? 1 : 0}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: pcm.buffer as ArrayBuffer,
  });
  const corpo = (await res.json()) as { texto?: string; error?: string };
  if (!res.ok) throw new Error(corpo.error ?? res.statusText);
  return corpo.texto ?? "";
}

export type Gravacao = { parar: () => Promise<string> };

export async function gravar(
  traduzir: boolean,
  onEstado: (estado: EstadoVoz) => void,
): Promise<Gravacao> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const pedacos: Blob[] = [];
  rec.ondataavailable = (e) => pedacos.push(e.data);
  rec.start();
  onEstado("ouvindo");

  return {
    parar: () =>
      new Promise<string>((resolve, reject) => {
        rec.onstop = async () => {
          for (const t of stream.getTracks()) t.stop();
          onEstado("transcrevendo");
          try {
            resolve(await enviar(await paraPCM(new Blob(pedacos)), traduzir));
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          } finally {
            onEstado("ocioso");
          }
        };
        rec.stop();
      }),
  };
}
