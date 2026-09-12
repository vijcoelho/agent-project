import { spawn, type IPty } from "node-pty";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { config, type AgentSpec, type Elenco } from "./config.ts";
import { CASA, lerMemoria, type Nota } from "./state.ts";
import { confiar } from "./confianca.ts";
import { definirModelo } from "./agy.ts";
import { resolverHarness, type Pedido } from "./harness.ts";
import { argsDaPonte, envDaPonte, pontede } from "./ponte.ts";
import { indiceParaPrompt, skillsDoAgente } from "./skills.ts";
import { argsDePermissao } from "./permissoes.ts";

export type PaneStatus = "run" | "idle" | "dead";

export type PaneState = {
  paneId: string;
  agent: string;
  label: string;
  cor: string;
  cli: string;
  /** O que o harness resolveu de verdade, não o padrão do catálogo. */
  model: string | null;
  effort: string | null;
  tipo: string | null;
  cwd: string;
  projectId: string | null;
  missionId: string | null;
  sessionId: string | null;
  maestro: boolean;
  status: PaneStatus;
  bytesIn: number;
  bytesOut: number;
  iniciadoEm: number;
  /** Bytes emitidos por segundo, um slot por segundo, mais novo por último. */
  atividade: number[];
};

type Entry = { pty: IPty; state: PaneState; lastData: number; acumulado: number };

const ptys = new Map<string, Entry>();
let counter = 0;

// Um agente sem stream por mais de 2s virou "ocioso" — esperando você digitar.
const OCIOSO_APOS = 2000;
const JANELA = 60;

const MCP_SCRIPT = fileURLToPath(new URL("./mcp-maestro.ts", import.meta.url));

/**
 * De que família é este provedor. "openrouter" roda pelo binário do codex e
 * por isso recebe os mesmos argumentos que ele — sandbox, MCP, modelo. Sem
 * esta indireção cada ponte nova exigiria copiar o bloco inteiro do codex.
 */
export const familiaDo = (cli: string): string => config.clis[cli]?.familia ?? cli;

function agentSpec(agent: string): AgentSpec {
  const spec = config.agents[agent];
  // Um nome inventado tem que virar erro: o maestro precisa saber que errou,
  // não ganhar um painel rodando um comando que não existe.
  if (!spec) {
    throw new Error(
      `não existe agente "${agent}". Disponíveis: ${Object.keys(config.agents).join(", ")}`,
    );
  }
  return spec;
}

const executaveis = new Map<string, string | null>();

/**
 * No Windows, passar por `cmd.exe /c` faz o processador de comandos reparsear
 * os argumentos — aspas e JSON chegam despedaçados no CLI. Quando existe um
 * .exe de verdade no PATH, lançamos ele direto e o problema some. O cmd fica
 * só como último recurso, para shims .cmd/.ps1.
 */
function acharExe(comando: string): string | null {
  if (!executaveis.has(comando)) {
    let achado: string | null = null;
    try {
      const linhas = execFileSync("where", [comando], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).split(/\r?\n/);
      achado = linhas.find((l) => l.trim().toLowerCase().endsWith(".exe"))?.trim() ?? null;

      // O pacote npm do Codex põe apenas um shim .cmd no PATH, mas traz o
      // executável nativo dentro da dependência de plataforma. Usar o shim
      // nos faria cair no limite de ~8 KB do cmd.exe e cortaria justamente o
      // fim dos prompts longos — onde fica a tarefa depois do papel/skills.
      if (!achado && comando.toLowerCase() === "codex") {
        const shim = linhas.find((l) => l.trim().toLowerCase().endsWith("codex.cmd"))?.trim();
        const plataforma = process.arch === "arm64" ? "codex-win32-arm64" : "codex-win32-x64";
        const alvo = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
        const nativo = shim && join(
          dirname(shim), "node_modules", "@openai", "codex", "node_modules", "@openai",
          plataforma, "vendor", alvo, "bin", "codex.exe",
        );
        if (nativo && existsSync(nativo)) achado = nativo;
      }
    } catch {
      achado = null;
    }
    executaveis.set(comando, achado);
  }
  return executaveis.get(comando) ?? null;
}

export function resolveCli(cli: string, extra: string[]): { file: string; args: string[] } {
  const spec = config.clis[cli] ?? { command: cli };
  const args = [...(spec.args ?? []), ...extra];
  if (process.platform !== "win32") return { file: spec.command, args };
  if (/[\\/]/.test(spec.command) || spec.command.toLowerCase().endsWith(".exe")) {
    return { file: spec.command, args };
  }
  const exe = acharExe(spec.command);
  if (exe) return { file: exe, args };
  const comspec = process.env.ComSpec ?? "cmd.exe";
  return { file: comspec, args: ["/c", spec.command, ...args] };
}

const memoriaDo = (projectId: string | null): Nota[] =>
  projectId ? lerMemoria(projectId) : [];

/**
 * O elenco vira texto: o agente precisa saber que não adianta pedir para o
 * Gemini escrever a página, porque o cockpit não vai abrir esse painel.
 */
export function notaDoElenco(elenco: Elenco | undefined): string {
  if (!elenco || elenco.clis.length === 0) return "";
  const nome = (cli: string) =>
    ({ claude: "Claude", codex: "GPT (Codex)", agy: "Gemini (Antigravity)", bash: "terminal", openrouter: "OpenRouter (modelos grátis)" })[cli] ?? cli;
  const soVisual = new Set(elenco.soVisual ?? []);
  const linhas = elenco.clis.map((cli) => {
    const fixo = elenco.porCli?.[cli];
    const fixado = fixo?.model ? ` — fixado em ${fixo.model}${fixo.effort ? `/${fixo.effort}` : ""}` : "";
    const escopo = soVisual.has(cli)
      ? " — SÓ para produzir arquivos de imagem, vídeo e áudio que vão dentro do produto"
      : "";
    return `- ${nome(cli)}${fixado}${escopo}`;
  });
  const barrados = elenco.clis.filter((c) => soVisual.has(c)).map(nome);
  const regra = barrados.length
    ? `\n${barrados.join(" e ")} entrega ARQUIVO, não desenho de tela: foto, ilustração, ícone, textura, render de objeto. Layout, tipografia, hierarquia e aparência da interface são decididos e escritos em código por quem constrói — não peça mockup de tela para copiar depois. Peça a imagem com o uso e o tamanho, e siga você mesmo com o código.`
    : "";
  const cabecalho = "IAs liberadas nesta missão — o cockpit não abre painel fora desta lista:";
  return `${cabecalho}\n${linhas.join("\n")}${regra}`;
}

/** Papel + skills + objetivo da missão + o que o projeto já aprendeu. */
function systemPrompt(
  agentId: string,
  spec: AgentSpec,
  objetivo: string,
  memoria: Nota[],
  skillsDaMissao: string[] = [],
  elenco?: Elenco,
): string {
  const solo = config.politicaIA?.modo === "unica";
  const papel = solo && spec.maestro
    ? "Você é o maestro e executor desta missão. Planeje, implemente, revise e teste pessoalmente de ponta a ponta. Só delegue se o usuário pedir divisão; todos os papéis usam a mesma IA. Salve checkpoints e decisões com as ferramentas do cockpit."
    : spec.papel ?? "";
  const partes = [papel, config.instrucoesGerais ?? ""];
  const indice = indiceParaPrompt(skillsDoAgente(agentId, spec, skillsDaMissao));
  if (indice) partes.push(indice);
  partes.push(`Execução atual: CLI ${spec.cli}, modelo ${spec.model ?? "padrão"}, esforço ${spec.effort ?? "padrão"}. Esta configuração prevalece sobre referências a provedores no texto do papel. Preserve a responsabilidade do agente mesmo em uma troca de provedor.`);
  const nota = notaDoElenco(config.politicaIA?.modo === "unica" ? undefined : elenco);
  if (nota) partes.push(nota);
  if (objetivo) partes.push(`Objetivo desta missão: ${objetivo}`);
  if (memoria.length > 0) {
    const recentes = memoria.slice(-20).map((n) => `- (${n.quem}) ${n.texto}`);
    partes.push(
      `Memória compartilhada do projeto — o que os agentes anteriores registraram:\n${recentes.join("\n")}`,
    );
  }
  return partes.filter(Boolean).join("\n\n");
}

export type SpawnOpts = {
  agent: string;
  /** Tipo da tarefa e overrides: o harness resolve cli, modelo e effort. */
  harness?: Omit<Pedido, "agent">;
  cwd: string;
  projectId: string | null;
  missionId: string | null;
  objetivo?: string;
  /** Skills que a missão pediu, além das do agente. */
  skills?: string[];
  /** Primeira mensagem do painel. Vai como argumento, não digitada. */
  tarefa?: string;
  porta: number;
};

/**
 * O cockpit pode ter sido iniciado de dentro de outra sessão do Claude Code.
 * Esses marcadores herdados desligam a gravação de sessão do filho — e sem
 * gravação não há como medir tokens nem custo.
 */
function ambienteLimpo(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TERM: "xterm-256color" };
  for (const chave of Object.keys(env)) {
    if (chave.startsWith("CLAUDE_CODE_") || chave === "CLAUDECODE") delete env[chave];
  }
  return env;
}

/** MCPs pessoais não pertencem aos painéis isolados do cockpit. */
function mcpsPessoaisDoCodex(): string[] {
  const arquivo = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "config.toml");
  if (!existsSync(arquivo)) return [];
  const nomes = new Set<string>();
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*\[mcp_servers\.(?:"((?:\\.|[^"])*)"|'([^']*)'|([A-Za-z0-9_-]+))(?:\.|\])?/);
    if (!m) continue;
    try { nomes.add(m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : (m[2] ?? m[3])!); }
    catch { /* seção ilegível: o Codex dará o erro normal dele */ }
  }
  return [...nomes];
}

export function spawnPane(
  opts: SpawnOpts,
  onOutput: (data: string) => void,
  onExit: (code: number) => void,
): PaneState {
  const perfil = agentSpec(opts.agent);
  // O tipo da tarefa manda no modelo e no effort; o agente entra com papel e cor.
  const bundle = resolverHarness({ agent: opts.agent, ...(opts.harness ?? {}) });
  const spec: AgentSpec = { ...perfil, cli: bundle.cli, model: bundle.model, effort: bundle.effort };
  const args: string[] = [...(spec.args ?? [])];
  const familia = familiaDo(spec.cli);
  args.push(...argsDePermissao(familia));
  let sessionId: string | null = null;
  const maestro = spec.maestro === true;

  // Uma ponte sem chave sobe o CLI, gasta a espera da subida e morre num erro
  // de autenticação que não explica nada. Recusar aqui devolve a instrução.
  const ponte = pontede(spec.cli);
  if (ponte && !envDaPonte(spec.cli)[ponte.spec.chaveEnv]) {
    throw new Error(
      `${spec.cli} precisa de uma chave antes de abrir painel — ponha em Ajustes → Grátis, ou exporte ${ponte.spec.chaveEnv}`,
    );
  }

  // Sem isto, cada worktree novo trava o painel no diálogo de confiança do CLI.
  // A confiança é do binário que vai rodar, então segue a família.
  if (config.confiarNasPastasQueEuAbrir !== false) confiar(familiaDo(spec.cli), opts.cwd);

  if (familia === "claude") {
    sessionId = randomUUID();
    if (spec.model) args.push("--model", spec.model);
    if (spec.effort) args.push("--effort", spec.effort);

    // Só o maestro ganha as alavancas do cockpit; os especialistas trabalham.
    // --strict-mcp-config deixa de fora os servidores MCP pessoais: sem
    // pedidos de autenticação e sem a demora que eles somam na subida.
    // A configuração vai em arquivo: JSON em linha de comando não sobrevive
    // ao caminho do Windows.
    if (maestro && opts.missionId) {
      const caminho = join(CASA, "mcp", `${opts.missionId}.json`);
      mkdirSync(dirname(caminho), { recursive: true });
      writeFileSync(
        caminho,
        JSON.stringify({
          mcpServers: {
            cockpit: {
              command: process.execPath,
              args: [MCP_SCRIPT],
              env: {
                COCKPIT_PORT: String(opts.porta),
                COCKPIT_MISSION: opts.missionId,
                COCKPIT_PROJECT: opts.projectId ?? "",
                COCKPIT_AGENT: spec.label,
              },
            },
          },
        }),
      );
      args.push("--strict-mcp-config", "--mcp-config", caminho);
    }

    // --mcp-config é variádico: engole tudo até a próxima flag, inclusive o
    // prompt posicional. Estas duas opções, de valor único, fecham a lista e
    // por isso ficam sempre por último.
    const prompt = systemPrompt(opts.agent, spec, opts.objetivo ?? "", memoriaDo(opts.projectId), opts.skills, opts.harness?.elenco);
    if (prompt) args.push("--append-system-prompt", prompt);
    args.push("--session-id", sessionId);
  }

  // A Antigravity não tem system prompt por flag, então papel, objetivo e
  // memória entram no começo da própria tarefa.
  let tarefa = opts.tarefa;
  if (familia === "agy") {
    // A flag só vale em modo print; a sessão interativa lê as preferências.
    definirModelo(spec.model);
    if (spec.model) args.push("--model", spec.model);
    if (spec.effort) args.push("--effort", spec.effort);
    const prompt = systemPrompt(opts.agent, spec, opts.objetivo ?? "", memoriaDo(opts.projectId), opts.skills, opts.harness?.elenco);
    if (prompt) tarefa = tarefa ? `${prompt}\n\n---\n\n${tarefa}` : prompt;
  }

  if (familia === "codex") {
    // Um provedor de ponte é o mesmo binário apontado para outro servidor.
    // Os `-c` da ponte vêm antes dos demais para que qualquer ajuste dela
    // possa ser sobreposto pelo que o painel decidir depois.
    args.push(...argsDaPonte(spec.cli));

    // Assim como --strict-mcp-config no Claude, não carregue os MCPs pessoais
    // em todo especialista. Além do custo de subida, um MCP sem login deixa o
    // Codex parado em avisos antes de começar a tarefa.
    args.push("--disable", "plugins");
    for (const nome of mcpsPessoaisDoCodex()) {
      const segmento = /^[A-Za-z0-9_-]+$/.test(nome) ? nome : JSON.stringify(nome);
      args.push("-c", `mcp_servers.${segmento}.enabled=false`);
    }
    if (spec.model) args.push("--model", spec.model);
    if (spec.effort) args.push("-c", `model_reasoning_effort=${JSON.stringify(spec.effort)}`);
    if (maestro && opts.missionId) {
      args.push("-c", `mcp_servers.cockpit.command=${JSON.stringify(process.execPath.replaceAll("\\", "/"))}`);
      args.push("-c", `mcp_servers.cockpit.args=${JSON.stringify([MCP_SCRIPT.replaceAll("\\", "/")])}`);
      for (const [key, value] of Object.entries({ COCKPIT_PORT: String(opts.porta), COCKPIT_MISSION: opts.missionId, COCKPIT_PROJECT: opts.projectId ?? "", COCKPIT_AGENT: spec.label })) {
        args.push("-c", `mcp_servers.cockpit.env.${key}=${JSON.stringify(value)}`);
      }
    }
    const prompt = systemPrompt(opts.agent, spec, opts.objetivo ?? "", memoriaDo(opts.projectId), opts.skills, opts.harness?.elenco);
    if (prompt) tarefa = tarefa ? `${prompt}\n\n${tarefa}` : prompt;
  }
  if (maestro) {
    const bridge = fileURLToPath(new URL("./maestro-cli.ts", import.meta.url));
    const instructions = `Você coordena a missão com listar_especialistas, delegar, situacao, anotar, lembrar e checkpoint. Grave checkpoint após cada etapa: decisões, progresso, arquivos, tarefas delegadas, testes e próximos passos. Se MCP não estiver disponível, use o terminal: node "${bridge}" <ferramenta> '<JSON dos argumentos>'. checkpoint recebe {"texto":"resumo"}; delegar recebe {"agente":"id","tarefa":"instrução","tipo":"implementar"}; anotar recebe {"texto":"fato"}; as demais recebem {}. Não abra um segundo maestro.`;
    tarefa = `${instructions}\n\n${tarefa ?? "Aguarde o objetivo do usuário."}`;
  }

  // A tarefa vai como argumento: o CLI já sobe com ela enviada. Digitar no PTY
  // depois de um atraso fixo é uma corrida que se perde quando a subida demora
  // — foi o que engoliu o primeiro briefing.
  const porArgumento = Boolean(tarefa) && ["claude", "agy", "codex"].includes(familia);
  if (porArgumento) {
    if (familia === "agy") args.push("--prompt-interactive", tarefa!);
    else args.push(tarefa!);
  }

  const { file, args: argv } = resolveCli(spec.cli, args);
  const paneId = `p${++counter}-${randomUUID().slice(0, 8)}`;

  const pty = spawn(file, argv, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: opts.cwd,
    env: {
      ...ambienteLimpo(),
      ...envDaPonte(spec.cli),
      COCKPIT_PORT: String(opts.porta),
      COCKPIT_MISSION: opts.missionId ?? "",
      COCKPIT_PROJECT: opts.projectId ?? "",
      COCKPIT_AGENT: spec.label,
    },
  });

  const state: PaneState = {
    paneId,
    agent: opts.agent,
    label: spec.label,
    cor: spec.cor,
    cli: spec.cli,
    model: bundle.model ?? null,
    effort: bundle.effort ?? null,
    tipo: opts.harness?.tipo ?? null,
    cwd: opts.cwd,
    projectId: opts.projectId,
    missionId: opts.missionId,
    sessionId,
    maestro,
    status: "run",
    bytesIn: 0,
    bytesOut: 0,
    iniciadoEm: Date.now(),
    atividade: new Array<number>(JANELA).fill(0),
  };
  const entry: Entry = { pty, state, lastData: Date.now(), acumulado: 0 };

  pty.onData((data) => {
    entry.lastData = Date.now();
    state.status = "run";
    state.bytesOut += data.length;
    entry.acumulado += data.length;
    onOutput(data);
  });
  pty.onExit(({ exitCode }) => {
    state.status = "dead";
    ptys.delete(paneId);
    onExit(exitCode);
  });

  ptys.set(paneId, entry);
  // Quem não aceita prompt por argumento ainda precisa recebê-lo digitado.
  if (opts.tarefa && !porArgumento) {
    setTimeout(() => entry.pty.write(opts.tarefa! + "\r"), 4000);
  }
  return state;
}

/**
 * O onExit do node-pty é assíncrono: existe uma janela em que o processo já
 * morreu mas o painel ainda está no mapa. Escrever ou redimensionar aí dentro
 * lança — e um throw aqui derrubava o servidor com todos os outros agentes
 * junto. O ResizeObserver do navegador acerta essa janela com facilidade.
 */
export function writePty(paneId: string, data: string): void {
  const entry = ptys.get(paneId);
  if (!entry || entry.state.status === "dead") return;
  try {
    entry.pty.write(data);
    entry.state.bytesIn += data.length;
  } catch {
    entry.state.status = "dead";
  }
}

export function resizePty(paneId: string, cols: number, rows: number): void {
  const entry = ptys.get(paneId);
  if (!entry || entry.state.status === "dead") return;
  try {
    entry.pty.resize(cols, rows);
  } catch {
    entry.state.status = "dead";
  }
}

export function listPanes(): PaneState[] {
  return [...ptys.values()].map((e) => e.state);
}

export function getPane(paneId: string): PaneState | undefined {
  return ptys.get(paneId)?.state;
}

/**
 * O kill() do conpty no node-pty forka um auxiliar de lista de console que
 * falha com "AttachConsole failed" no Windows e depois trava por 5s. Matar a
 * árvore de processos direto faz o pty sair pelo caminho normal.
 */
export function killPty(paneId: string): void {
  const entry = ptys.get(paneId);
  if (!entry || entry.state.status === "dead") return;
  ptys.delete(paneId);
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(entry.pty.pid), "/T", "/F"], () => {});
  } else {
    entry.pty.kill();
  }
}

/** Wait for the previous process tree to stop before handing over its files. */
export async function stopPane(paneId: string): Promise<void> {
  const entry = ptys.get(paneId);
  if (!entry) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => execFile("taskkill", ["/pid", String(entry.pty.pid), "/T", "/F"], (err) => {
      if (err && ptys.has(paneId)) reject(err); else resolve();
    }));
  } else {
    entry.pty.kill();
    for (let i = 0; i < 50 && ptys.has(paneId); i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (ptys.has(paneId)) throw Error("O painel anterior não encerrou; troca cancelada.");
  }
  ptys.delete(paneId);
}

/**
 * Um pulso por segundo: fecha o slot de atividade e reavalia o status.
 * Conta bytes e instantes, nunca o conteúdo do stream.
 */
export function tick(onPulse: (state: PaneState) => void): void {
  const agora = Date.now();
  for (const entry of ptys.values()) {
    entry.state.atividade.push(entry.acumulado);
    entry.state.atividade.shift();
    entry.acumulado = 0;
    entry.state.status = agora - entry.lastData > OCIOSO_APOS ? "idle" : "run";
    onPulse(entry.state);
  }
}
