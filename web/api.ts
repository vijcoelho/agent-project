export type Usage = {
  in: number;
  out: number;
  cacheWrite: number;
  cacheRead: number;
  custo: number;
  turnos: number;
  model: string | null;
};

export type PaneState = {
  paneId: string;
  agent: string;
  label: string;
  cor: string;
  cli: string;
  cwd: string;
  missionId: string | null;
  sessionId: string | null;
  status: "run" | "idle" | "dead";
  bytesIn: number;
  bytesOut: number;
  iniciadoEm: number;
  atividade: number[];
};

export type SquadRun = {
  missionId: string;
  squad: string;
  brief: string;
  fases: { nome: string; agentes: string[] }[];
  faseAtual: number;
  iniciadaEm: number;
};

export type Mission = {
  id: string;
  nome: string;
  worktree: string;
  branch: string;
  panes: string[];
  criadaEm: number;
  git: { dirty: number; head: string };
  usage: Usage;
  squad: SquadRun | null;
};

export type AgentSpec = {
  label: string;
  cor: string;
  cli: string;
  model?: string;
  effort?: string;
  papel?: string;
};

export type SquadSpec = {
  label: string;
  descricao: string;
  fases: { nome: string; agentes: string[] }[];
};

export type No = { nome: string; caminho: string; dir: boolean; filhos?: No[] };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export const fetchConfig = () =>
  fetch("/api/config").then(
    json<{ root: string; agents: Record<string, AgentSpec>; squads: Record<string, SquadSpec> }>,
  );

export const fetchMissions = () =>
  fetch("/api/missions").then(json<{ root: string; missions: Mission[] }>);

export const fetchPanes = () =>
  fetch("/api/panes").then(json<{ panes: (PaneState & { usage: Usage })[] }>);

export const postMission = (nome: string) => post("/api/missions", { nome }).then(json<Mission>);

export const deleteMission = (id: string) =>
  fetch(`/api/missions/${id}`, { method: "DELETE" }).then(json<{ ok: true }>);

export const postSquad = (id: string, squad: string, brief: string) =>
  post(`/api/missions/${id}/squad`, { squad, brief }).then(json<{ run: SquadRun }>);

export const postAvancarFase = (id: string) =>
  post(`/api/missions/${id}/squad/avancar`, {}).then(json<{ run: SquadRun }>);

export const fetchTree = (missionId: string | null) =>
  fetch(`/api/tree?missionId=${missionId ?? ""}`).then(json<{ base: string; tree: No[] }>);

export const fetchFile = (missionId: string | null, path: string) =>
  fetch(`/api/file?missionId=${missionId ?? ""}&path=${encodeURIComponent(path)}`).then(
    json<{ path: string; content: string }>,
  );

export const saveFile = (missionId: string | null, path: string, content: string) =>
  post("/api/file", { missionId, path, content }).then(json<{ ok: true }>);
