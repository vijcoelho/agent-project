import { spawn, type IPty } from "node-pty";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { config, ROOT, type AgentSpec } from "./config.ts";

export type PaneStatus = "run" | "idle" | "dead";

export type PaneState = {
  paneId: string;
  agent: string;
  label: string;
  cor: string;
  cli: string;
  cwd: string;
  missionId: string | null;
  sessionId: string | null;
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

function agentSpec(agent: string): AgentSpec {
  return (
    config.agents[agent] ?? { label: agent.toUpperCase(), cor: "#6b7280", cli: agent }
  );
}

// No Windows um CLI costuma ser um shim .cmd/.ps1, que o conpty só consegue
// lançar através do processador de comandos.
function resolveCli(cli: string, extra: string[]): { file: string; args: string[] } {
  const spec = config.clis[cli] ?? { command: cli };
  const args = [...(spec.args ?? []), ...extra];
  if (process.platform !== "win32") return { file: spec.command, args };
  if (/[\\/]/.test(spec.command) || spec.command.toLowerCase().endsWith(".exe")) {
    return { file: spec.command, args };
  }
  const comspec = process.env.ComSpec ?? "cmd.exe";
  return { file: comspec, args: ["/c", spec.command, ...args] };
}

/** Monta os argumentos do harness a partir do perfil do agente. */
function harness(spec: AgentSpec): { args: string[]; sessionId: string | null } {
  const args = [...(spec.args ?? [])];
  let sessionId: string | null = null;
  if (spec.cli === "claude") {
    sessionId = randomUUID();
    args.push("--session-id", sessionId);
    if (spec.model) args.push("--model", spec.model);
    if (spec.effort) args.push("--effort", spec.effort);
  }
  return { args, sessionId };
}

export function spawnPane(
  agent: string,
  cwd: string,
  missionId: string | null,
  onOutput: (data: string) => void,
  onExit: (code: number) => void,
): PaneState {
  const spec = agentSpec(agent);
  const { args, sessionId } = harness(spec);
  const { file, args: argv } = resolveCli(spec.cli, args);
  const paneId = `p${++counter}`;

  const pty = spawn(file, argv, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: cwd || ROOT,
    env: { ...process.env, TERM: "xterm-256color" },
  });

  const state: PaneState = {
    paneId,
    agent,
    label: spec.label,
    cor: spec.cor,
    cli: spec.cli,
    cwd: cwd || ROOT,
    missionId,
    sessionId,
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
  return state;
}

/** Digita o papel do agente e o briefing da missão dentro do PTY. */
export function primePane(paneId: string, texto: string): void {
  const entry = ptys.get(paneId);
  if (!entry) return;
  // O CLI precisa terminar de subir antes de receber o prompt.
  setTimeout(() => entry.pty.write(texto + "\r"), 2500);
}

export function writePty(paneId: string, data: string): void {
  const entry = ptys.get(paneId);
  if (!entry) return;
  entry.state.bytesIn += data.length;
  entry.pty.write(data);
}

export function resizePty(paneId: string, cols: number, rows: number): void {
  ptys.get(paneId)?.pty.resize(cols, rows);
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
