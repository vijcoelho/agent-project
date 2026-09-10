import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Cada CLI pergunta "você confia nesta pasta?" antes de aceitar qualquer
 * coisa. Como toda missão cria um worktree novo, isso reapareceria em cada
 * painel de cada missão e travaria o briefing. Aqui registramos a resposta
 * que você daria, no formato de cada um.
 *
 * Só é chamado para pastas que você mesmo abriu no cockpit, e desliga com
 * "confiarNasPastasQueEuAbrir": false no cockpit.json.
 */

const CLAUDE_JSON = join(homedir(), ".claude.json");
const AGY_JSON = join(homedir(), ".gemini", "antigravity-cli", "settings.json");

function lerJson<T>(caminho: string, vazio: T): T | null {
  if (!existsSync(caminho)) return vazio;
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as T;
  } catch {
    return null; // arquivo do usuário ilegível: não é nosso lugar de reescrever
  }
}

/** O Claude Code guarda a confiança por pasta, com barras normais. */
function confiarClaude(pasta: string): void {
  type Json = { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> };
  const c = lerJson<Json>(CLAUDE_JSON, {});
  if (!c) return;
  const chave = resolve(pasta).replace(/\\/g, "/");
  if (c.projects?.[chave]?.hasTrustDialogAccepted === true) return;
  c.projects ??= {};
  c.projects[chave] = { ...c.projects[chave], hasTrustDialogAccepted: true };
  writeFileSync(CLAUDE_JSON, JSON.stringify(c, null, 2));
}

/** A Antigravity guarda uma lista, com barras invertidas do Windows. */
function confiarAgy(pasta: string): void {
  type Json = { trustedWorkspaces?: string[] };
  const c = lerJson<Json>(AGY_JSON, {});
  if (!c) return;
  const chave = resolve(pasta);
  c.trustedWorkspaces ??= [];
  if (c.trustedWorkspaces.includes(chave)) return;
  c.trustedWorkspaces.push(chave);
  mkdirSync(dirname(AGY_JSON), { recursive: true });
  writeFileSync(AGY_JSON, JSON.stringify(c, null, 2));
}

export function confiar(cli: string, pasta: string): void {
  if (cli === "claude") confiarClaude(pasta);
  else if (cli === "agy") confiarAgy(pasta);
}
