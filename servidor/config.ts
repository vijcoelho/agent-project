import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type CliSpec = { command: string; args?: string[] };

export type AgentSpec = {
  label: string;
  cor: string;
  cli: string;
  model?: string;
  effort?: string;
  args?: string[];
  papel?: string;
};

export type SquadSpec = {
  label: string;
  descricao: string;
  fases: { nome: string; agentes: string[] }[];
};

export type Preco = { in: number; out: number; cacheWrite: number; cacheRead: number };

type CockpitConfig = {
  root: string;
  port: number;
  clis: Record<string, CliSpec>;
  agents: Record<string, AgentSpec>;
  squads: Record<string, SquadSpec>;
  precos: Record<string, Preco>;
};

const raw = JSON.parse(
  readFileSync(new URL("../cockpit.json", import.meta.url), "utf8"),
) as CockpitConfig;

export const config = raw;
export const ROOT = resolve(process.cwd(), raw.root);
