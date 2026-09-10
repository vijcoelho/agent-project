import express from "express";
import { execucaoDoPapel, validarPoliticaIA } from "./politica-ia.ts";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { config, salvarConfig, type Elenco } from "./config.ts";
import { join } from "node:path";
import { Continuity, detectLimit, type LimitSignal } from "./continuity.ts";
import { readCodexQuota, type Quota } from "./codex-quota.ts";
import {
  getPane,
  killPty,
  stopPane,
  resolveCli,
  listPanes,
  resizePty,
  spawnPane,
  tick,
  writePty,
  type PaneState,
} from "./pty.ts";
import { archiveMission, createMission } from "./missions.ts";
import {
  addProject,
  CASA,
  anotar,
  attachPane,
  closeProject,
  detachPane,
  esquecer,
  getMission,
  getProject,
  lerMemoria,
  listMissions,
  listProjects,
  marcarGit,
  persistir,
} from "./state.ts";
import { branchStatus, prepararGit, temCommit } from "./git.ts";
import { readUsage, somaUsage } from "./usage.ts";
import { criarFsApi } from "./fs-api.ts";
import { observar, parar } from "./watcher.ts";
import { avancarFase, encerrarRun, getRun, iniciarSquad } from "./squad.ts";
import { transcrever } from "./voz.ts";
import { lerConsumo } from "./consumo.ts";
import { aplicarSinal, esquecerCotas, lerCotas } from "./cotas.ts";
import { escolherPasta } from "./pasta.ts";
import { resolverHarness, tiposDeTarefa, type Pedido } from "./harness.ts";
import { esquecerCache, listarProviders } from "./providers.ts";
import {
  guardarChaveDaPonte,
  listarPontes,
  sincronizarModelos,
  statusPonte,
  testarPonte,
} from "./ponte.ts";
import { conectar, criarAgente, desconectar, testar, PRESETS, type Conexao } from "./conectar.ts";
import { acharSkill, apagarSkill, listarSkills, salvarSkill, skillsDoAgente } from "./skills.ts";
import { aplicarReceita, apagarReceita, listarReceitas, salvarReceita } from "./receitas.ts";
import { adicionarFonte, atualizarFonte, baixarPlugin, catalogo, esquecerCatalogo, instalarPlugin, instalarSkill, listarFontes, resumoDoAcervo } from "./marketplace.ts";
import { definirModelo, esquecerMedia, gerar, guardarChave, instalarProvedor, listarMedia } from "./media.ts";

type ClientMessage =
  | { type: "spawn"; agent: string; missionId: string; tipo?: string }
  | { type: "input"; paneId: string; data: string }
  | { type: "resize"; paneId: string; cols: number; rows: number }
  | { type: "kill"; paneId: string };

/**
 * A porta em uso nesta execução.
 *
 * `COCKPIT_PORTA` completa o par que já existia: `COCKPIT_CONFIG` e
 * `COCKPIT_HOME` isolam configuração e estado, mas sem uma porta própria uma
 * segunda instância morria em cima da primeira. O nome não é COCKPIT_PORT de
 * propósito — essa variável já significa outra coisa dentro de um painel
 * (a porta do cockpit que abriu o painel), e um cockpit iniciado de dentro de
 * outro herdaria justamente a porta que não pode usar.
 */
const porta = Number(process.env.COCKPIT_PORTA) || config.port;

const app = express();
app.use(express.json({ limit: "8mb" }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const continuity = new Continuity(join(CASA, "continuity"));
const limits = new Map<string, LimitSignal>();
const outputTails = new Map<string, string>();
const seenSignals = new Map<string, string>();
const switching = new Set<string>();
let codexQuota: Quota | null = null;
let quotaError: string | null = null;
let quotaPromise: Promise<void> | null = null;
let lastQuotaCheck = 0;
const maestroFixos: Record<string, { model: string; effort: string }> = {
  codex: { model: "gpt-6-astra", effort: "high" },
  claude: { model: "opus", effort: "high" },
  agy: { model: "gemini-3.1-pro-high", effort: "high" },
};

/**
 * Quem pode reger, e em que configuração.
 *
 * As pontes entram calculadas: o modelo grátis de hoje não é o de amanhã, e
 * escrever o id aqui garantiria um preset morto na primeira sincronização.
 * Com isto, quando todas as assinaturas estouram, ainda sobra para onde ir —
 * antes disso a missão simplesmente parava.
 */
function presetsDoMaestro(): Record<string, { model: string; effort: string }> {
  const presets = { ...maestroFixos };
  for (const { id } of listarPontes()) {
    const model = config.modelos?.[id]?.[0];
    const effort = config.efforts?.[id]?.includes("high") ? "high" : config.efforts?.[id]?.[0];
    if (model && effort) presets[id] = { model, effort };
  }
  return presets;
}
function maestroStatus() {
  const presets = presetsDoMaestro();
  return { agent: config.agents.maestro, auto: config.maestroAutoSwitch === true, limits: Object.fromEntries(limits), codexQuota, quotaError, providers: listarProviders().filter(p => p.id in presets) };
}
function notifyMaestro() { broadcast({ type: "maestro", ...maestroStatus() }); }

function refreshQuota(): Promise<void> {
  if (quotaPromise) return quotaPromise;
  if (Date.now() - lastQuotaCheck < 60000) return Promise.resolve();
  lastQuotaCheck = Date.now();
  const command = resolveCli("codex", []);
  quotaPromise = readCodexQuota(command.file, command.args).then(quota => {
    codexQuota = quota; quotaError = quota ? null : "A conta não informou a cota.";
    if (quota) {
      if (quota.remaining <= 10) {
        const signal: LimitSignal = { state: quota.remaining <= 0 ? "blocked" : "warning", remaining: quota.remaining, detail: `Codex: ${quota.remaining}% de cota restante (consulta da conta).` };
        limits.set("codex", signal);
        // At zero, keep the current turn intact until the CLI emits its own
        // blocking error. Below 10%, switch cooperatively at a checkpoint.
      } else limits.delete("codex");
    }
  }).catch(err => { codexQuota = null; quotaError = String(err); }).finally(() => { quotaPromise = null; notifyMaestro(); });
  return quotaPromise;
}

/**
 * Para onde a missão migra quando uma cota estoura. As assinaturas primeiro,
 * porque são melhores; a ponte grátis por último, porque é o colete: pior que
 * um modelo pago, e muito melhor que a missão parar no meio.
 */
const ordemDeTroca = (): string[] => ["codex", "agy", "claude", ...listarPontes().map(p => p.id)];

function saveCheckpoint(missionId: string, value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 40000) throw Error("Checkpoint vazio ou muito grande.");
  const mission = getMission(missionId);
  if (!mission || !getProject(mission.projectId)) throw Error("Missão indisponível.");
  continuity.checkpoint(missionId, text);
  const maestro = listPanes().find(p => p.missionId === missionId && p.maestro);
  if (maestro && config.maestroAutoSwitch && limits.has(maestro.cli) && !switching.has(missionId)) {
    const cli = clisDaMissao(missionId, ordemDeTroca()).find(cli => cli !== maestro.cli && !limits.has(cli) && listarProviders().some(p => p.id === cli && p.disponivel));
    if (cli) {
      setTimeout(() => {
        if (getPane(maestro.paneId) && config.maestroAutoSwitch) void switchMaestro(missionId, cli).catch(err => broadcast({ type: "error", message: String(err) }));
      }, 1500);
      return { ok: true, instruction: "Checkpoint salvo. O cockpit vai transferir a coordenação agora por cota baixa. Encerre este turno sem executar mais ações." };
    }
  }
  return { ok: true };
}

async function switchMaestro(missionId: string, cli: string) {
  const fixo = execucaoDoPapel("maestro");
  if (fixo && fixo.cli !== cli) throw Error("Altere a distribuição de IA antes de trocar este papel de provedor.");
  if (switching.has(missionId)) throw Error("Troca de maestro já em andamento.");
  if (!presetsDoMaestro()[cli] || !listarProviders().some(p => p.id === cli && p.disponivel)) throw Error("Provedor não disponível nesta máquina.");
  if (!fixo && !clisDaMissao(missionId, [cli]).includes(cli)) throw Error("Este provedor não está no elenco da missão.");
  const mission = getMission(missionId);
  if (!mission || !getProject(mission.projectId)) throw Error("Abra o projeto antes de continuar.");
  switching.add(missionId);
  try {
    const previous = listPanes().filter(p => p.missionId === missionId && p.maestro);
    const task = continuity.handoff(missionId, mission.objetivo, listPanes().filter(p => p.missionId === missionId && !p.maestro));
    for (const pane of previous) { await stopPane(pane.paneId); detachPane(pane.paneId); broadcast({ type: "exit", paneId: pane.paneId, code: 0 }); }
    const configured = config.agents.maestro;
    return abrirPainel("maestro", missionId, task, { invoke: { cli, ...(configured?.cli === cli ? { model: configured.model, effort: configured.effort } : presetsDoMaestro()[cli]) } });
  } finally { switching.delete(missionId); }
}

async function switchSpecialist(pane: PaneState, cli: string) {
  if (execucaoDoPapel(pane.agent)) throw Error("Este papel tem uma IA fixa. Altere a distribuição de IA para trocar de provedor.");
  if (!pane.missionId || switching.has(pane.paneId) || !getPane(pane.paneId)) return;
  const mission = getMission(pane.missionId);
  if (!mission || !getProject(mission.projectId)) return;
  switching.add(pane.paneId);
  try {
    const task = `Continue somente a responsabilidade do painel ${pane.paneId} (${pane.label}). Consulte a entrada start desse painel no histórico para recuperar a tarefa original. Não assuma as tarefas dos outros agentes.\n\n${continuity.handoff(mission.id, mission.objetivo, listPanes().filter(p => p.missionId === mission.id && p.paneId !== pane.paneId))}`;
    await stopPane(pane.paneId); detachPane(pane.paneId); broadcast({ type: "exit", paneId: pane.paneId, code: 0 });
    abrirPainel(pane.agent, mission.id, task, { invoke: { cli, ...presetsDoMaestro()[cli] } });
  } finally { switching.delete(pane.paneId); }
}

function observeOutput(pane: PaneState, data: string) {
  if (!pane.missionId) return;
  continuity.record(pane.missionId, pane.paneId, "output", data);
  const tail = ((outputTails.get(pane.paneId) ?? "") + data).slice(-4000);
  outputTails.set(pane.paneId, tail);
  const signal = detectLimit(data) ?? detectLimit(tail);
  if (!signal || seenSignals.get(pane.paneId) === signal.detail) return;
  seenSignals.set(pane.paneId, signal.detail);
  limits.set(pane.cli, signal);
  notifyMaestro();
  if (signal.state === "warning" && pane.maestro) {
    broadcast({ type: "error", message: `${pane.cli}: cota próxima do limite. Salve um checkpoint e use Trocar maestro para continuar em outro provedor.` });
  }
  if (signal.state === "blocked" && config.maestroAutoSwitch && !switching.has(pane.maestro ? pane.missionId : pane.paneId)) {
    const target = clisDaMissao(pane.missionId, ordemDeTroca()).find(cli => cli !== pane.cli && !limits.has(cli) && listarProviders().some(p => p.id === cli && p.disponivel));
    if (target) void (pane.maestro ? switchMaestro(pane.missionId, target) : switchSpecialist(pane, target)).catch(err => broadcast({ type: "error", message: `Falha na continuidade: ${String(err)}` }));
    else broadcast({ type: "error", message: "Nenhum provedor alternativo disponível sem aviso de limite. Missão preservada; escolha um provedor após a renovação da cota." });
  }
}

function broadcast(msg: unknown): void {
  const raw = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(raw);
  }
}

const avisarMudanca = (path: string, base: string) =>
  broadcast({ type: "fs-change", path, base });

/** Escopo de arquivos: worktree da missão, ou raiz do projeto. */
function raizDe(missionId: string | null, projectId: string | null): string | null {
  if (missionId) {
    const mission = getMission(missionId);
    if (!mission || !getProject(mission.projectId) || (projectId && mission.projectId !== projectId)) return null;
    return mission.worktree;
  }
  if (projectId) return getProject(projectId)?.root ?? null;
  return null;
}

/** Sobe um painel na missão e conecta seu stream ao broadcast. */
function abrirPainel(
  agent: string,
  missionId: string,
  tarefa?: string,
  harness?: Omit<Pedido, "agent">,
  /** Skills pedidas na delegação, além das do agente e da missão. */
  skills: string[] = [],
): PaneState {
  const mission = getMission(missionId);
  if (!mission) throw new Error("missão não encontrada");
  if (!getProject(mission.projectId)) throw new Error("projeto fechado");
  if (config.agents[agent]?.maestro && listPanes().some(p => p.missionId === missionId && p.maestro)) throw new Error("Já existe um maestro nesta missão. Use Trocar maestro.");
  if (config.agents[agent]?.maestro && !harness?.invoke?.cli && !harness?.roster?.cli) {
    const profile = config.agents[agent]!;
    harness = { ...harness, invoke: { cli: profile.cli, model: profile.model, effort: profile.effort, ...harness?.invoke } };
  }
  // O elenco da missão entra em toda abertura de painel: pela tela, pelo time
  // e pela delegação do maestro. É o único ponto por onde todos passam.
  harness = { ...harness, elenco: mission.elenco };

  const state = spawnPane(
    {
      agent,
      harness,
      cwd: mission.worktree,
      projectId: mission.projectId,
      missionId: mission.id,
      objetivo: mission.objetivo,
      skills: [...(mission.skills ?? []), ...skills],
      tarefa,
      porta,
    },
    (data) => {
      broadcast({ type: "output", paneId: state.paneId, data });
      try { observeOutput(state, data); } catch (err) { broadcast({ type: "error", message: `Não foi possível salvar continuidade: ${String(err)}` }); }
    },
    (code) => {
      detachPane(state.paneId);
      outputTails.delete(state.paneId);
      seenSignals.delete(state.paneId);
      broadcast({ type: "exit", paneId: state.paneId, code });
    },
  );
  attachPane(mission.id, state.paneId);
  continuity.record(mission.id, state.paneId, "start", JSON.stringify({ agent, tarefa, objetivo: mission.objetivo, cli: state.cli }));
  broadcast({ type: "spawned", pane: state });
  return state;
}

/**
 * Limpa o elenco que veio da tela: provedor que não existe nesta máquina,
 * modelo de outro CLI e esforço inventado saem fora. Elenco inválido salvo
 * seria pior do que elenco nenhum — barraria painel por engano.
 */
function limparElenco(bruto: unknown): Elenco | undefined {
  if (!bruto || typeof bruto !== "object") return undefined;
  const e = bruto as Partial<Elenco>;
  const clis = (Array.isArray(e.clis) ? e.clis : []).filter((c) => typeof c === "string" && config.clis[c]);
  if (clis.length === 0) return undefined;

  const porCli: Record<string, { model?: string; effort?: string }> = {};
  for (const [cli, fixo] of Object.entries(e.porCli ?? {})) {
    if (!clis.includes(cli) || !fixo) continue;
    const model = config.modelos?.[cli]?.includes(String(fixo.model)) ? String(fixo.model) : undefined;
    const effort = config.efforts?.[cli]?.includes(String(fixo.effort)) ? String(fixo.effort) : undefined;
    if (model || effort) porCli[cli] = { ...(model && { model }), ...(effort && { effort }) };
  }

  const soVisual = (Array.isArray(e.soVisual) ? e.soVisual : []).filter((c) => clis.includes(c));
  // Um elenco só de provedores visuais não constrói nada: seria uma missão
  // sem ninguém para escrever código.
  if (soVisual.length === clis.length) return { clis, ...(Object.keys(porCli).length && { porCli }) };
  return {
    clis,
    ...(Object.keys(porCli).length > 0 && { porCli }),
    ...(soVisual.length > 0 && { soVisual }),
  };
}

const elencoDa = (missionId: string | null): Elenco | undefined =>
  (missionId ? getMission(missionId)?.elenco : undefined) ?? undefined;

/** Provedores que a missão libera para trabalho de verdade, em ordem. */
function clisDaMissao(missionId: string | null, padrao: string[]): string[] {
  if (config.politicaIA?.modo === "unica") return [config.politicaIA.unica!.cli];
  const elenco = elencoDa(missionId);
  if (!elenco || elenco.clis.length === 0) return padrao;
  const soVisual = new Set(elenco.soVisual ?? []);
  const uteis = elenco.clis.filter((c) => !soVisual.has(c));
  return uteis.length > 0 ? uteis : elenco.clis;
}

/**
 * Os especialistas como esta missão os enxerga: cada um já resolvido pelo
 * elenco, com o provedor em que vai realmente rodar. Sem isto o maestro pede
 * o ARTISTA para escrever código e só descobre a troca depois do painel aberto.
 */
function especialistasDaMissao(missionId: string) {
  const elenco = elencoDa(missionId);
  const soVisual = new Set(elenco?.soVisual ?? []);
  return Object.entries(config.agents)
    .filter(([, a]) => !a.maestro)
    .map(([id, a]) => {
      const bundle = resolverHarness({ agent: id, elenco });
      return {
        id,
        label: a.label,
        papel: a.papel,
        cli: bundle.cli,
        modelo: bundle.model,
        effort: bundle.effort,
        ...(soVisual.has(a.cli) && {
          escopo:
            "só produz arquivos de imagem, vídeo e áudio que vão dentro do produto — foto, ilustração, ícone, textura, render. Não desenha telas, layout nem mockup de interface.",
        }),
        ...(bundle.trocado && {
          nota: `o catálogo diz ${bundle.trocado.de}, mas nesta missão roda em ${bundle.cli}: ${bundle.trocado.porque}`,
        }),
      };
    });
}

const fail = (res: express.Response, err: unknown) =>
  res.status(400).json({ error: err instanceof Error ? err.message : String(err) });

// ---------- catálogo ----------

app.get("/api/maestro", (_req, res) => res.json(maestroStatus()));
app.get("/api/politica-ia", (_req, res) => res.json({ politica: config.politicaIA ?? { modo: "padrao" }, agents: config.agents, providers: listarProviders() }));
app.post("/api/politica-ia", (req, res) => {
  try {
    config.politicaIA = validarPoliticaIA(req.body);
    salvarConfig(); notifyMaestro();
    res.json(config.politicaIA);
  } catch (err) { fail(res, err); }
});
app.post("/api/maestro/refresh", async (_req, res) => { await refreshQuota(); res.json(maestroStatus()); });
app.post("/api/maestro", (req, res) => {
  try {
    const cli = String(req.body.cli);
    if (!presetsDoMaestro()[cli]) throw Error("Provedor inválido.");
    const model = String(req.body.model ?? presetsDoMaestro()[cli].model);
    const effort = String(req.body.effort ?? presetsDoMaestro()[cli].effort);
    if (!config.modelos?.[cli]?.includes(model) || !config.efforts?.[cli]?.includes(effort)) throw Error("Modelo ou esforço inválido para o provedor.");
    config.agents.maestro = { ...config.agents.maestro!, cli, model, effort, maestro: true };
    config.maestroAutoSwitch = req.body.auto === true;
    salvarConfig(); notifyMaestro(); res.json(maestroStatus());
  } catch (err) { fail(res, err); }
});
app.post("/api/maestro/reset-limit", (req, res) => { limits.delete(String(req.body.cli)); notifyMaestro(); res.json(maestroStatus()); });
app.post("/api/missions/:id/maestro", async (req, res) => {
  try { res.json(await switchMaestro(req.params.id, String(req.body.cli))); } catch (err) { fail(res, err); }
});
app.post("/api/missions/:id/checkpoint", (req, res) => {
  try {
    if (!getMission(req.params.id)) throw Error("Missão não encontrada.");
    res.json(saveCheckpoint(req.params.id, req.body.texto));
  } catch (err) { fail(res, err); }
});
app.post("/api/missions/:id/tools", (req, res) => {
  try {
    const mission = getMission(req.params.id);
    if (!mission || !getProject(mission.projectId)) throw Error("Missão indisponível.");
    const args = req.body.args ?? {};
    switch (req.body.tool) {
      case "listar_especialistas": res.json(especialistasDaMissao(mission.id)); break;
      case "situacao": res.json(listPanes().filter(p => p.missionId === mission.id)); break;
      case "tipos_de_tarefa": res.json(tiposDeTarefa()); break;
      case "lembrar": res.json(lerMemoria(mission.projectId)); break;
      case "anotar": anotar(mission.projectId, "maestro", String(args.texto)); res.json({ ok: true }); break;
      case "checkpoint": res.json(saveCheckpoint(mission.id, args.texto)); break;
      case "delegar": res.json(abrirPainel(String(args.agente), mission.id, String(args.tarefa), { tipo: args.tipo })); break;
      default: throw Error("Ferramenta desconhecida.");
    }
  } catch (err) { fail(res, err); }
});

app.get("/api/config", (_req, res) => {
  res.json({
    agents: config.agents,
    squads: config.squads,
    tarefas: tiposDeTarefa(),
    providers: listarProviders(),
    receitas: listarReceitas(),
  });
});

// ---------- skills ----------

app.get("/api/skills", (_req, res) => {
  // O corpo não vai na listagem: são 45 arquivos e a tela só precisa da linha.
  const skills = listarSkills().map(({ corpo, ...resto }) => ({ ...resto, tamanho: corpo.length }));
  res.json({ skills, acervo: resumoDoAcervo() });
});

app.get("/api/skills/:nome", (req, res) => {
  const s = acharSkill(req.params.nome);
  if (!s) return fail(res, new Error(`não existe skill "${req.params.nome}"`));
  res.json(s);
});

app.post("/api/skills", (req, res) => {
  try {
    res.json(
      salvarSkill({
        nome: String(req.body.nome ?? ""),
        descricao: String(req.body.descricao ?? ""),
        papeis: Array.isArray(req.body.papeis) ? (req.body.papeis as string[]) : [],
        corpo: String(req.body.corpo ?? ""),
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

app.delete("/api/skills/:nome", (req, res) => {
  try {
    apagarSkill(req.params.nome);
    esquecerCatalogo();
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

/** Quais skills um agente carrega, e por quê — o "explique" desta tela. */
app.get("/api/agents/:id/skills", (req, res) => {
  const spec = config.agents[req.params.id];
  if (!spec) return fail(res, new Error(`não existe agente "${req.params.id}"`));
  res.json({
    skills: skillsDoAgente(req.params.id, spec).map((s) => ({ nome: s.nome, descricao: s.descricao })),
    fixas: spec.skills ?? [],
    allowedSkills: spec.allowedSkills ?? null,
    papel_id: spec.papel_id ?? req.params.id,
  });
});

app.post("/api/agents/:id/skills", (req, res) => {
  try {
    const spec = config.agents[req.params.id];
    if (!spec) throw new Error(`não existe agente "${req.params.id}"`);
    if (Array.isArray(req.body.skills)) spec.skills = req.body.skills as string[];
    // null tira a trava; array vazio é "nenhuma skill", que é diferente.
    if (req.body.allowedSkills === null) delete spec.allowedSkills;
    else if (Array.isArray(req.body.allowedSkills)) spec.allowedSkills = req.body.allowedSkills as string[];
    salvarConfig();
    res.json({ ok: true, skills: skillsDoAgente(req.params.id, spec).map((s) => s.nome) });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- receitas ----------

app.get("/api/receitas", (_req, res) => res.json({ receitas: listarReceitas() }));

app.post("/api/receitas", (req, res) => {
  try {
    const { id, ...resto } = req.body as { id: string } & Record<string, unknown>;
    res.json(salvarReceita(String(id ?? ""), resto as never));
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/receitas/:id/aplicar", (req, res) => {
  try {
    res.json(aplicarReceita(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

app.delete("/api/receitas/:id", (req, res) => {
  try {
    apagarReceita(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- marketplace ----------

app.get("/api/marketplace", (req, res) => {
  if (req.query.rescan === "1") esquecerCatalogo();
  res.json({ fontes: listarFontes(), plugins: catalogo() });
});

app.post("/api/marketplace/fonte", (req, res) => {
  try {
    res.json(adicionarFonte(String(req.body.url ?? "")));
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/marketplace/fonte/:id/atualizar", (req, res) => {
  try {
    atualizarFonte(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/marketplace/baixar", (req, res) => {
  try {
    res.json(baixarPlugin(String(req.body.plugin ?? "")));
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/marketplace/instalar", (req, res) => {
  try {
    const plugin = String(req.body.plugin ?? "");
    // Sem `skill` instala o plugin inteiro — é o botão "instalar tudo".
    res.json(req.body.skill ? instalarSkill(plugin, String(req.body.skill)) : instalarPlugin(plugin));
  } catch (err) {
    fail(res, err);
  }
});

// ---------- media ----------

app.get("/api/media", (req, res) => {
  if (req.query.rescan === "1") esquecerMedia();
  res.json({ provedores: listarMedia() });
});

app.post("/api/media/:id/chave", (req, res) => {
  try {
    // A chave entra e não sai: nenhuma rota devolve o valor, só se está posta.
    guardarChave(req.params.id, String(req.body.chave ?? ""));
    esquecerMedia();
    res.json({ ok: true, provedores: listarMedia() });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/media/:id/instalar", (req, res) => {
  try {
    res.json({ ...instalarProvedor(req.params.id), provedores: listarMedia() });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/media/:id/modelo", (req, res) => {
  try {
    definirModelo(req.params.id, String(req.body.modelo ?? ""));
    res.json({ ok: true, provedores: listarMedia() });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/missions/:id/media", async (req, res) => {
  try {
    const mission = getMission(req.params.id);
    if (!mission) throw new Error("missão não encontrada");
    const tipo = String(req.body.tipo ?? "image");
    if (!["image", "video", "audio"].includes(tipo)) throw new Error(`tipo "${tipo}" não existe`);
    const feito = await gerar({
      tipo: tipo as "image" | "video" | "audio",
      prompt: String(req.body.prompt ?? ""),
      destino: mission.worktree,
      provedor: req.body.provedor ? String(req.body.provedor) : undefined,
      modelo: req.body.modelo ? String(req.body.modelo) : undefined,
      referencia: req.body.referencia ? String(req.body.referencia) : undefined,
    });
    res.json(feito);
  } catch (err) {
    fail(res, err);
  }
});

/** Mostra o bundle que o harness escolheria, sem abrir painel nenhum. */
app.post("/api/harness", (req, res) => {
  try {
    res.json(resolverHarness(req.body as Pedido));
  } catch (err) {
    fail(res, err);
  }
});

// ---------- provedores ----------

app.get("/api/providers", (req, res) => {
  // ?rescan=1 ignora a validade do cache: é o "procurar de novo" da tela,
  // para quando você acabou de instalar um CLI.
  if (req.query.rescan === "1") esquecerCache();
  res.json({ providers: listarProviders(), presets: PRESETS });
});

app.post("/api/providers", (req, res) => {
  try {
    res.json(conectar(req.body as Conexao));
  } catch (err) {
    fail(res, err);
  }
});

app.delete("/api/providers/:id", (req, res) => {
  try {
    desconectar(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/providers/:id/agente", (req, res) => {
  try {
    res.json(criarAgente(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/providers/:id/testar", (req, res) => {
  testar(req.params.id).then(
    (r) => res.json(r),
    (err: Error) => fail(res, err),
  );
});

// ---------- pontes (OpenRouter e outras APIs sem CLI) ----------

/** O PATH é assunto de providers.ts; a ponte só pergunta se o binário existe. */
const temNoPath = (comando: string): boolean =>
  listarProviders().some((p) => p.comando === comando && p.caminho !== null);

app.get("/api/pontes", async (_req, res) => {
  try {
    res.json({ pontes: await Promise.all(listarPontes().map((p) => statusPonte(p.id, temNoPath))) });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/pontes/:id/chave", (req, res) => {
  try {
    // A chave entra e não sai: nenhuma rota devolve o valor, só de onde veio.
    guardarChaveDaPonte(req.params.id, String(req.body.chave ?? "").trim());
    esquecerCache();
    esquecerCotas();
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

/** Relê o catálogo do provedor e passa a lista viva para o cockpit.json. */
app.post("/api/pontes/:id/modelos", async (req, res) => {
  try {
    const modelos = await sincronizarModelos(req.params.id);
    res.json({ modelos, status: await statusPonte(req.params.id, temNoPath) });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/pontes/:id/testar", async (req, res) => {
  try {
    res.json(await testarPonte(req.params.id, req.body?.modelo ? String(req.body.modelo) : undefined));
  } catch (err) {
    fail(res, err);
  }
});

/** Fixa o modelo padrão da ponte: é o que o agente dela usa por omissão. */
app.post("/api/pontes/:id/modelo", (req, res) => {
  try {
    const id = req.params.id;
    const modelo = String(req.body.modelo ?? "");
    const lista = config.modelos?.[id] ?? [];
    if (!lista.includes(modelo)) throw Error(`"${modelo}" não está no catálogo de ${id}.`);
    config.modelos![id] = [modelo, ...lista.filter((m) => m !== modelo)];
    for (const agente of Object.values(config.agents)) {
      if (agente.cli === id) agente.model = modelo;
    }
    salvarConfig();
    notifyMaestro();
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- consumo ----------

app.get("/api/cotas", async (req, res) => {
  if (req.query.rescan === "1") esquecerCotas();
  // O aviso vindo do painel sobrepõe a leitura da conta: ele é mais novo.
  res.json({ cotas: aplicarSinal(await lerCotas(), limits) });
});

app.get("/api/consumo", (req, res) => {
  const dias = Number(req.query.dias) || 30;
  try {
    res.json(lerConsumo(dias));
  } catch (err) {
    fail(res, err);
  }
});

// ---------- projetos ----------

app.get("/api/projects", (_req, res) => res.json({ projects: listProjects() }));

/** Abre o seletor nativo do Windows e devolve o caminho escolhido. */
app.post("/api/escolher-pasta", (_req, res) => {
  escolherPasta().then(
    (caminho) => res.json({ caminho }),
    (err: Error) => fail(res, err),
  );
});

app.post("/api/projects", (req, res) => {
  try {
    const project = addProject(String(req.body.root ?? ""));
    observar(project.root, avisarMudanca);
    res.json(project);
  } catch (err) {
    fail(res, err);
  }
});

/** Liga o isolamento por missão numa pasta que ainda não tem git. Só a pedido. */
app.post("/api/projects/:id/git", async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) throw new Error("projeto não encontrado");
    await prepararGit(project.root);
    marcarGit(project.id, true);
    res.json({ ok: true, pronto: await temCommit(project.root) });
  } catch (err) {
    fail(res, err);
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) throw new Error("projeto não encontrado");
    // Fechar é tirar da lista, não destruir: os worktrees e branches ficam
    // no disco e voltam quando você reabrir a mesma pasta. Só os painéis
    // morrem, porque são processos.
    parar(project.root);
    for (const mission of listMissions(project.id)) {
      parar(mission.worktree);
      encerrarRun(mission.id);
      for (const paneId of mission.panes) {
        killPty(paneId);
        broadcast({ type: "exit", paneId, code: 0 });
      }
    }
    closeProject(project.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- memória compartilhada ----------

app.get("/api/projects/:id/memoria", (req, res) => res.json(lerMemoria(req.params.id)));

app.post("/api/projects/:id/memoria", (req, res) => {
  const nota = anotar(req.params.id, String(req.body.quem ?? "você"), String(req.body.texto ?? ""));
  broadcast({ type: "memoria", projectId: req.params.id });
  res.json(nota);
});

app.delete("/api/projects/:id/memoria/:quando", (req, res) => {
  esquecer(req.params.id, Number(req.params.quando));
  broadcast({ type: "memoria", projectId: req.params.id });
  res.json({ ok: true });
});

// ---------- missões ----------

app.get("/api/missions", async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const panes = listPanes();
  const missions = await Promise.all(
    listMissions(projectId).map(async (m) => ({
      ...m,
      git: await branchStatus(m.worktree),
      usage: somaUsage(
        panes.filter((p) => p.missionId === m.id).map((p) => readUsage(p.sessionId)),
      ),
      squad: getRun(m.id) ?? null,
    })),
  );
  res.json({ missions });
});

app.post("/api/missions", async (req, res) => {
  try {
    const mission = await createMission(
      String(req.body.projectId ?? ""),
      String(req.body.nome ?? ""),
      String(req.body.objetivo ?? ""),
      {
        skills: Array.isArray(req.body.skills) ? (req.body.skills as string[]) : undefined,
        receita: req.body.receita ? String(req.body.receita) : undefined,
        elenco: limparElenco(req.body.elenco),
      },
    );
    observar(mission.worktree, avisarMudanca);
    res.json(mission);
  } catch (err) {
    fail(res, err);
  }
});

/** O elenco da missão, para a tela e para o maestro. */
app.get("/api/missions/:id/elenco", (req, res) => {
  const mission = getMission(req.params.id);
  if (!mission) return fail(res, new Error("missão não encontrada"));
  res.json({
    elenco: mission.elenco ?? null,
    especialistas: especialistasDaMissao(mission.id),
    tarefas: tiposDeTarefa(),
  });
});

/** Trocar de ideia no meio da missão vale para os próximos painéis. */
app.post("/api/missions/:id/elenco", (req, res) => {
  try {
    const mission = getMission(req.params.id);
    if (!mission) throw new Error("missão não encontrada");
    mission.elenco = limparElenco(req.body.elenco);
    persistir();
    res.json({ elenco: mission.elenco ?? null });
  } catch (err) {
    fail(res, err);
  }
});

app.delete("/api/missions/:id", async (req, res) => {
  try {
    const mission = getMission(req.params.id);
    if (mission) parar(mission.worktree);
    encerrarRun(req.params.id);
    await archiveMission(req.params.id, (paneId) => {
      killPty(paneId);
      broadcast({ type: "exit", paneId, code: 0 });
    });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- painéis ----------

app.get("/api/panes", (req, res) => {
  const missionId = typeof req.query.missionId === "string" ? req.query.missionId : null;
  res.json({
    panes: listPanes()
      .filter((p) => !missionId || p.missionId === missionId)
      .map((p) => ({ ...p, usage: readUsage(p.sessionId) })),
  });
});

/** Chamado pelo MCP quando o maestro delega. */
app.post("/api/missions/:id/delegar", (req, res) => {
  try {
    const state = abrirPainel(
      String(req.body.agent ?? ""),
      req.params.id,
      String(req.body.tarefa ?? ""),
      {
        tipo: typeof req.body.tipo === "string" ? req.body.tipo : undefined,
        // O maestro pode pedir o provedor por nome — é assim que ele alterna
        // Claude e GPT no mesmo trabalho. O elenco ainda manda: pedido fora
        // dele é trocado pelo harness, não obedecido.
        ...(typeof req.body.provedor === "string" && req.body.provedor
          ? { invoke: { cli: String(req.body.provedor) } }
          : {}),
      },
      Array.isArray(req.body.skills) ? (req.body.skills as string[]) : [],
    );
    res.json({
      paneId: state.paneId,
      label: state.label,
      cli: state.cli,
      skills: skillsDoAgente(state.agent, config.agents[state.agent]!, [
        ...(getMission(req.params.id)?.skills ?? []),
        ...(Array.isArray(req.body.skills) ? (req.body.skills as string[]) : []),
      ]).map((s) => s.nome),
    });
  } catch (err) {
    fail(res, err);
  }
});

// ---------- times ----------

app.post("/api/missions/:id/squad", (req, res) => {
  try {
    const mission = getMission(req.params.id);
    if (!mission) throw new Error("missão não encontrada");
    const r = iniciarSquad(
      mission,
      String(req.body.squad ?? ""),
      String(req.body.brief ?? ""),
      (a, tarefa, h) => abrirPainel(a, mission.id, tarefa, h),
    );
    res.json(r);
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/missions/:id/squad/avancar", (req, res) => {
  try {
    const mission = getMission(req.params.id);
    if (!mission) throw new Error("missão não encontrada");
    res.json(
      avancarFase(mission, (a, tarefa, h) => abrirPainel(a, mission.id, tarefa, h)),
    );
  } catch (err) {
    fail(res, err);
  }
});

// ---------- voz ----------

// PCM cru: o navegador já decodificou para mono 16kHz, então aqui não é
// preciso codec nenhum. 30s de fala dão ~2MB.
app.post("/api/voz", express.raw({ type: "application/octet-stream", limit: "40mb" }), (req, res) => {
  const bytes = req.body as Buffer;
  const pcm = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  transcrever(pcm, req.query.traduzir === "1").then(
    (texto) => res.json({ texto }),
    (err: Error) => fail(res, err),
  );
});

// ---------- arquivos ----------

app.use("/api", criarFsApi(raizDe));

app.use(express.static(fileURLToPath(new URL("../web/dist", import.meta.url))));

app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: err.message });
  },
);

// ---------- websocket ----------

wss.on("connection", (ws: WebSocket) => {
  ws.send(JSON.stringify({ type: "panes", panes: listPanes() }));

  ws.on("message", (buf) => {
    const msg = JSON.parse(String(buf)) as ClientMessage;
    switch (msg.type) {
      case "spawn":
        // O papel, o objetivo e a memória já viajam no system prompt.
        try {
          abrirPainel(msg.agent, msg.missionId, undefined, { tipo: msg.tipo });
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : String(err) }));
        }
        break;
      case "input":
        { const pane = getPane(msg.paneId); if (pane?.missionId) continuity.record(pane.missionId, pane.paneId, "input", msg.data); }
        writePty(msg.paneId, msg.data);
        break;
      case "resize":
        resizePty(msg.paneId, msg.cols, msg.rows);
        break;
      case "kill":
        if (getPane(msg.paneId)) {
          killPty(msg.paneId);
          detachPane(msg.paneId);
          broadcast({ type: "exit", paneId: msg.paneId, code: 0 });
        }
        break;
    }
  });
});

// Painéis vivem no servidor, não na aba: fechar o navegador não mata agente.
setInterval(() => {
  if (listPanes().some(p => p.cli === "codex")) void refreshQuota();
}, 60000);
setInterval(() => {
  const pulsos: { paneId: string; status: string; atividade: number[] }[] = [];
  tick((s) => pulsos.push({ paneId: s.paneId, status: s.status, atividade: s.atividade }));
  if (pulsos.length > 0) broadcast({ type: "pulse", pulsos });
}, 1000);

// Custo e tokens são lidos do disco, então basta um pulso periódico.
setInterval(() => {
  const panes = listPanes().filter((p) => p.sessionId);
  if (panes.length === 0) return;
  broadcast({
    type: "usage",
    usos: panes.map((p) => ({ paneId: p.paneId, usage: readUsage(p.sessionId) })),
  });
}, 4000);

for (const project of listProjects()) observar(project.root, avisarMudanca);
// Missões de projeto fechado ficam guardadas, mas não são observadas.
for (const mission of listMissions()) {
  if (getProject(mission.projectId)) observar(mission.worktree, avisarMudanca);
}

// Os painéis são processos longos: uma exceção solta em qualquer caminho não
// pode levar junto todo agente que está rodando. Fica no log para eu achar.
// Falha ao abrir a porta é exceção: um segundo servidor que sobrevivesse sem
// porta continuaria gravando estado vazio por cima do estado real.
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE" || err.syscall === "listen") {
    console.error(`[cockpit] a porta ${porta} já está em uso — saindo`);
    process.exit(1);
  }
  console.error("[cockpit] exceção ignorada:", err);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  console.error(`[cockpit] não consegui abrir a porta ${porta}: ${err.message}`);
  process.exit(1);
});

server.listen(porta, () => {
  console.log(`cockpit → http://localhost:${porta}`);
  console.log(`${listProjects().length} projeto(s) aberto(s)`);
});
