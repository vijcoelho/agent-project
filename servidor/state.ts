import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Elenco } from "./config.ts";

export type Project = {
  id: string;
  nome: string;
  root: string;
  /** Com git, cada missão ganha worktree próprio. Sem git, todas dividem a pasta. */
  git: boolean;
  abertoEm: number;
};

export type Mission = {
  id: string;
  projectId: string;
  nome: string;
  objetivo: string;
  /** Pasta onde os agentes desta missão trabalham. */
  worktree: string;
  /** null quando a missão não tem branch próprio. */
  branch: string | null;
  /** true = worktree separado; false = divide a pasta do projeto com as outras. */
  isolada: boolean;
  panes: string[];
  /** Skills que todo agente desta missão carrega, além das próprias. */
  skills?: string[];
  /** Receita que preencheu a missão, para a tela poder mostrar. */
  receita?: string;
  /** Quais IAs esta missão liberou, e em que configuração. */
  elenco?: Elenco;
  criadaEm: number;
};

export type Nota = { quando: number; quem: string; texto: string };

type Estado = { projects: Project[]; missions: Mission[] };

// O estado vive fora dos repositórios: um projeto não é dono do cockpit.
export const CASA = process.env.COCKPIT_HOME ?? join(homedir(), ".cockpit");
const ARQUIVO = join(CASA, "state.json");

function carregar(): Estado {
  if (!existsSync(ARQUIVO)) return { projects: [], missions: [] };
  const salvo = JSON.parse(readFileSync(ARQUIVO, "utf8")) as Estado;
  return {
    projects: salvo.projects ?? [],
    // Painéis são processos, não estado: um restart deixa toda missão vazia.
    missions: (salvo.missions ?? []).map((m) => ({ ...m, panes: [] })),
  };
}

const estado = carregar();

export function persistir(): void {
  mkdirSync(CASA, { recursive: true });
  writeFileSync(ARQUIVO, JSON.stringify(estado, null, 2));
}

export function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const id = (prefixo: string) =>
  `${prefixo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * O id do projeto sai do caminho, não de um sorteio.
 *
 * Com id sorteado, fechar e reabrir o mesmo projeto criava um id novo — e a
 * memória, que é arquivada por id, virava órfã. Derivando do caminho, reabrir
 * reencontra tudo. Minúsculas porque caminho no Windows não diferencia caixa.
 */
const idDoProjeto = (root: string): string =>
  "proj" + createHash("sha1").update(resolve(root).toLowerCase()).digest("hex").slice(0, 12);

// ---------- projetos ----------

export const listProjects = (): Project[] => estado.projects;

export const getProject = (projectId: string): Project | undefined =>
  estado.projects.find((p) => p.id === projectId);

export function addProject(caminho: string): Project {
  const root = resolve(caminho);
  if (!existsSync(root)) throw new Error(`pasta não encontrada: ${root}`);
  if (!statSync(root).isDirectory()) throw new Error(`${root} não é uma pasta`);
  const existente = estado.projects.find((p) => p.root === root);
  if (existente) return existente;
  const project: Project = {
    id: idDoProjeto(root),
    nome: basename(root),
    root,
    git: existsSync(join(root, ".git")),
    abertoEm: Date.now(),
  };
  estado.projects.push(project);
  persistir();
  return project;
}

/**
 * Tira o projeto da lista do cockpit. Não apaga nada no disco e guarda as
 * missões: como o id vem do caminho, reabrir a mesma pasta traz de volta as
 * missões e a memória, exatamente onde estavam.
 */
export function closeProject(projectId: string): Mission[] {
  const guardadas = estado.missions.filter((m) => m.projectId === projectId);
  estado.projects = estado.projects.filter((p) => p.id !== projectId);
  persistir();
  return guardadas;
}

// ---------- missões ----------

export const listMissions = (projectId?: string): Mission[] =>
  projectId ? estado.missions.filter((m) => m.projectId === projectId) : estado.missions;

export const getMission = (missionId: string): Mission | undefined =>
  estado.missions.find((m) => m.id === missionId);

export function addMission(m: Omit<Mission, "id" | "panes" | "criadaEm">): Mission {
  const mission: Mission = { ...m, id: id("m"), panes: [], criadaEm: Date.now() };
  estado.missions.push(mission);
  persistir();
  return mission;
}

export function removeMission(missionId: string): void {
  estado.missions = estado.missions.filter((m) => m.id !== missionId);
  persistir();
}

export function marcarGit(projectId: string, temGit: boolean): void {
  const project = getProject(projectId);
  if (!project) return;
  project.git = temGit;
  persistir();
}

export function attachPane(missionId: string, paneId: string): void {
  const mission = getMission(missionId);
  if (!mission || mission.panes.includes(paneId)) return;
  mission.panes.push(paneId);
  persistir();
}

export function detachPane(paneId: string): void {
  for (const mission of estado.missions) {
    const i = mission.panes.indexOf(paneId);
    if (i !== -1) mission.panes.splice(i, 1);
  }
}

// ---------- memória compartilhada ----------

/**
 * Um agente anota, todos lembram. A memória é do projeto, não da missão:
 * o que se aprende sobre o código sobrevive à missão que descobriu.
 */
function arquivoMemoria(projectId: string): string {
  return join(CASA, "memoria", `${projectId}.json`);
}

export function lerMemoria(projectId: string): Nota[] {
  const caminho = arquivoMemoria(projectId);
  if (!existsSync(caminho)) return [];
  return JSON.parse(readFileSync(caminho, "utf8")) as Nota[];
}

export function anotar(projectId: string, quem: string, texto: string): Nota {
  const nota: Nota = { quando: Date.now(), quem, texto: texto.trim() };
  const notas = lerMemoria(projectId);
  notas.push(nota);
  mkdirSync(join(CASA, "memoria"), { recursive: true });
  writeFileSync(arquivoMemoria(projectId), JSON.stringify(notas, null, 2));
  return nota;
}

export function esquecer(projectId: string, quando: number): void {
  const notas = lerMemoria(projectId).filter((n) => n.quando !== quando);
  writeFileSync(arquivoMemoria(projectId), JSON.stringify(notas, null, 2));
}
