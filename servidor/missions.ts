import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT } from "./config.ts";
import { addWorktree, assertCommittable, removeWorktree } from "./git.ts";

export type Mission = {
  id: string;
  nome: string;
  worktree: string;
  branch: string;
  panes: string[];
  criadaEm: number;
};

const STORE = join(ROOT, ".cockpit", "missions.json");

function load(): Mission[] {
  if (!existsSync(STORE)) return [];
  const saved = JSON.parse(readFileSync(STORE, "utf8")) as Mission[];
  // Panes are processes, not state: a restart leaves every mission empty.
  return saved.map((m) => ({ ...m, panes: [] }));
}

const missions: Mission[] = load();

function persist(): void {
  mkdirSync(dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(missions, null, 2));
}

export function listMissions(): Mission[] {
  return missions;
}

export function getMission(id: string): Mission | undefined {
  return missions.find((m) => m.id === id);
}

export function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createMission(nomeBruto: string): Promise<Mission> {
  const nome = slugify(nomeBruto);
  if (!nome) throw new Error("nome inválido");
  if (missions.some((m) => m.nome === nome)) throw new Error(`missão "${nome}" já existe`);
  await assertCommittable();
  const { worktree, branch } = await addWorktree(nome);
  const mission: Mission = {
    id: `m${Date.now().toString(36)}`,
    nome,
    worktree,
    branch,
    panes: [],
    criadaEm: Date.now(),
  };
  missions.push(mission);
  persist();
  return mission;
}

export async function archiveMission(
  id: string,
  killPane: (paneId: string) => void,
): Promise<void> {
  const index = missions.findIndex((m) => m.id === id);
  if (index === -1) throw new Error("missão não encontrada");
  const mission = missions[index]!;
  for (const paneId of mission.panes) killPane(paneId);
  await removeWorktree(mission.worktree, mission.branch);
  missions.splice(index, 1);
  persist();
}

export function attachPane(missionId: string, paneId: string): void {
  const mission = getMission(missionId);
  if (!mission || mission.panes.includes(paneId)) return;
  mission.panes.push(paneId);
  persist();
}

export function detachPane(paneId: string): void {
  for (const mission of missions) {
    const index = mission.panes.indexOf(paneId);
    if (index !== -1) mission.panes.splice(index, 1);
  }
}
