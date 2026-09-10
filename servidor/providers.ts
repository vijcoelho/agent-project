import { execFileSync } from "node:child_process";
import { config } from "./config.ts";

/**
 * Quais CLIs existem de verdade nesta máquina.
 *
 * Sem isto o cockpit oferece agentes que falham ao abrir — o `codex` estava
 * no catálogo e nunca esteve instalado. Melhor mostrar apagado e dizer como
 * instalar do que deixar você descobrir com um painel morto.
 */

export type Provider = {
  id: string;
  comando: string;
  disponivel: boolean;
  caminho: string | null;
  modelos: string[];
  /** Níveis de esforço aceitos — a tela precisa para fixar um. */
  efforts: string[];
  agentes: string[];
  /** Como instalar, quando não está. */
  instalar?: string;
};

const COMO_INSTALAR: Record<string, string> = {
  claude: "npm i -g @anthropic-ai/claude-code",
  agy: "baixe a Antigravity CLI em antigravity.google",
  codex: "npm i -g @openai/codex",
  gemini: "npm i -g @google/gemini-cli",
};

/**
 * O PATH muda quando você instala um CLI com o cockpit aberto, então a
 * detecção tem validade curta. Sem isso a tela seguia dizendo "não
 * encontrado" para algo que acabou de ser instalado.
 */
const VALIDADE = 10_000;
const cache = new Map<string, { caminho: string | null; quando: number }>();

function achar(comando: string): string | null {
  const guardado = cache.get(comando);
  if (guardado && Date.now() - guardado.quando < VALIDADE) return guardado.caminho;
  let caminho: string | null = null;
  if (/[\\/]/.test(comando)) {
    caminho = comando;
  } else {
    try {
      const linhas = execFileSync(process.platform === "win32" ? "where" : "which", [comando], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).split(/\r?\n/);
      caminho = linhas.find((l) => l.trim())?.trim() ?? null;
    } catch {
      caminho = null;
    }
  }
  cache.set(comando, { caminho, quando: Date.now() });
  return caminho;
}

/** Força uma varredura nova, sem esperar a validade. */
export function esquecerCache(): void {
  cache.clear();
}

export function listarProviders(): Provider[] {
  return Object.entries(config.clis).map(([id, spec]) => {
    const caminho = achar(spec.command);
    return {
      id,
      comando: spec.command,
      disponivel: caminho !== null,
      caminho,
      modelos: config.modelos?.[id] ?? [],
      efforts: config.efforts?.[id] ?? [],
      agentes: Object.entries(config.agents)
        .filter(([, a]) => a.cli === id)
        .map(([chave]) => chave),
      instalar: caminho ? undefined : COMO_INSTALAR[id],
    };
  });
}

export const providerDisponivel = (id: string): boolean =>
  achar(config.clis[id]?.command ?? id) !== null;
