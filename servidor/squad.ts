import { config } from "./config.ts";
import type { Mission } from "./missions.ts";
import { primePane, type PaneState } from "./pty.ts";

export type Fase = { nome: string; agentes: string[] };

export type SquadRun = {
  missionId: string;
  squad: string;
  brief: string;
  fases: Fase[];
  faseAtual: number;
  iniciadaEm: number;
};

const runs = new Map<string, SquadRun>();

export function getRun(missionId: string): SquadRun | undefined {
  return runs.get(missionId);
}

export function encerrarRun(missionId: string): void {
  runs.delete(missionId);
}

function briefingPara(agent: string, brief: string, fase: string): string {
  const spec = config.agents[agent];
  const papel = spec?.papel ?? "";
  return [
    papel,
    `Fase da missão: ${fase}.`,
    `Briefing: ${brief}`,
    "Trabalhe só no worktree atual. Quando terminar sua parte, resuma o que fez em até 5 linhas.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Sobe os painéis de uma fase e injeta papel + briefing em cada um. */
function dispararFase(
  run: SquadRun,
  mission: Mission,
  spawn: (agent: string) => PaneState,
): PaneState[] {
  const fase = run.fases[run.faseAtual];
  if (!fase) return [];
  return fase.agentes.map((agent) => {
    const state = spawn(agent);
    primePane(state.paneId, briefingPara(agent, run.brief, fase.nome));
    return state;
  });
}

export function iniciarSquad(
  mission: Mission,
  squadNome: string,
  brief: string,
  spawn: (agent: string) => PaneState,
): { run: SquadRun; panes: PaneState[] } {
  const spec = config.squads[squadNome];
  if (!spec) throw new Error(`squad "${squadNome}" não existe`);
  if (!brief.trim()) throw new Error("briefing vazio");

  const run: SquadRun = {
    missionId: mission.id,
    squad: squadNome,
    brief: brief.trim(),
    fases: spec.fases,
    faseAtual: 0,
    iniciadaEm: Date.now(),
  };
  runs.set(mission.id, run);
  return { run, panes: dispararFase(run, mission, spawn) };
}

/** O gate: você decide quando a próxima fase entra. */
export function avancarFase(
  mission: Mission,
  spawn: (agent: string) => PaneState,
): { run: SquadRun; panes: PaneState[] } {
  const run = runs.get(mission.id);
  if (!run) throw new Error("nenhum squad em andamento nessa missão");
  if (run.faseAtual >= run.fases.length - 1) throw new Error("squad já está na última fase");
  run.faseAtual += 1;
  return { run, panes: dispararFase(run, mission, spawn) };
}
