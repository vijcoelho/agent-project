import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASA } from "./state.ts";

/**
 * Cofre de chaves de API.
 *
 * Nasceu dentro de media.ts, para Higgsfield e ElevenLabs. Saiu de lá quando
 * a ponte de OpenRouter passou a precisar da mesma coisa: um lugar só para a
 * chave, com um formato só, em vez de dois cofres com dois bugs.
 *
 * A chave que cifra o cofre fica em arquivo separado no seu perfil. Isto
 * protege contra leitura casual do JSON — backup, sincronização de pasta, um
 * agente varrendo o disco. NÃO protege contra quem já está logado como você:
 * esse alguém lê os dois arquivos. Para localhost é o nível certo; não trate
 * como cofre de verdade.
 */

const COFRE = join(CASA, "chaves.json");
const MESTRA = join(CASA, "chave-mestra");

function chaveMestra(): Buffer {
  mkdirSync(CASA, { recursive: true });
  if (!existsSync(MESTRA)) writeFileSync(MESTRA, randomBytes(32), { mode: 0o600 });
  return readFileSync(MESTRA);
}

type Cofre = Record<string, { iv: string; tag: string; dado: string }>;

const lerCofre = (): Cofre =>
  existsSync(COFRE) ? (JSON.parse(readFileSync(COFRE, "utf8")) as Cofre) : {};

export function guardarChave(provedor: string, valor: string): void {
  const cofre = lerCofre();
  if (!valor) delete cofre[provedor];
  else {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", chaveMestra(), iv);
    const dado = Buffer.concat([c.update(valor, "utf8"), c.final()]);
    cofre[provedor] = {
      iv: iv.toString("base64"),
      tag: c.getAuthTag().toString("base64"),
      dado: dado.toString("base64"),
    };
  }
  mkdirSync(CASA, { recursive: true });
  writeFileSync(COFRE, JSON.stringify(cofre, null, 2), { mode: 0o600 });
}

export function lerChave(provedor: string): string | null {
  const guardada = lerCofre()[provedor];
  if (!guardada) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", chaveMestra(), Buffer.from(guardada.iv, "base64"));
    d.setAuthTag(Buffer.from(guardada.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(guardada.dado, "base64")), d.final()]).toString("utf8");
  } catch {
    // Chave-mestra trocada ou arquivo corrompido: a chave se perdeu.
    return null;
  }
}

/**
 * A chave em uso e de onde ela veio: o cofre ganha do ambiente, porque foi a
 * última coisa que você digitou de propósito.
 */
export function chaveDe(id: string, variavel?: string): { valor: string | null; onde: string } {
  const guardada = lerChave(id);
  if (guardada) return { valor: guardada, onde: "cofre do cockpit" };
  const doAmbiente = variavel ? process.env[variavel] : undefined;
  if (doAmbiente) return { valor: doAmbiente, onde: variavel! };
  return { valor: null, onde: "" };
}
