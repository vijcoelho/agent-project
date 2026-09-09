import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { config, ROOT } from "./config.ts";
import {
  getPane,
  killPty,
  listPanes,
  primePane,
  resizePty,
  spawnPane,
  tick,
  writePty,
  type PaneState,
} from "./pty.ts";
import {
  archiveMission,
  attachPane,
  createMission,
  detachPane,
  getMission,
  listMissions,
} from "./missions.ts";
import { branchStatus } from "./git.ts";
import { readUsage, somaUsage } from "./usage.ts";
import { criarFsApi } from "./fs-api.ts";
import { observar, parar } from "./watcher.ts";
import { avancarFase, encerrarRun, getRun, iniciarSquad } from "./squad.ts";

type ClientMessage =
  | { type: "spawn"; agent: string; missionId?: string }
  | { type: "input"; paneId: string; data: string }
  | { type: "resize"; paneId: string; cols: number; rows: number }
  | { type: "kill"; paneId: string };

const app = express();
app.use(express.json({ limit: "8mb" }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(msg: unknown): void {
  const raw = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(raw);
  }
}

const raizDe = (missionId: string | null): string =>
  (missionId && getMission(missionId)?.worktree) || ROOT;

/** Sobe um painel e conecta seu stream ao broadcast. */
function abrirPainel(agent: string, missionId: string | null): PaneState {
  const state = spawnPane(
    agent,
    raizDe(missionId),
    missionId,
    (data) => broadcast({ type: "output", paneId: state.paneId, data }),
    (code) => {
      detachPane(state.paneId);
      broadcast({ type: "exit", paneId: state.paneId, code });
    },
  );
  if (missionId) attachPane(missionId, state.paneId);
  broadcast({ type: "spawned", pane: state });
  return state;
}

const fail = (res: express.Response, err: unknown) =>
  res.status(400).json({ error: err instanceof Error ? err.message : String(err) });

// ---------- catálogo ----------

app.get("/api/config", (_req, res) => {
  res.json({ root: ROOT, agents: config.agents, squads: config.squads });
});

// ---------- missões ----------

app.get("/api/missions", async (_req, res) => {
  const panes = listPanes();
  const missions = await Promise.all(
    listMissions().map(async (m) => {
      const meus = panes.filter((p) => p.missionId === m.id);
      return {
        ...m,
        git: await branchStatus(m.worktree),
        usage: somaUsage(meus.map((p) => readUsage(p.sessionId))),
        squad: getRun(m.id) ?? null,
      };
    }),
  );
  res.json({ root: ROOT, missions });
});

app.post("/api/missions", async (req, res) => {
  try {
    const mission = await createMission(String(req.body.nome ?? ""));
    observar(mission.worktree, (path, base) => broadcast({ type: "fs-change", path, base }));
    res.json(mission);
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

app.get("/api/panes", (_req, res) => {
  res.json({
    panes: listPanes().map((p) => ({ ...p, usage: readUsage(p.sessionId) })),
  });
});

// ---------- squad ----------

app.post("/api/missions/:id/squad", (req, res) => {
  try {
    const mission = getMission(req.params.id);
    if (!mission) throw new Error("missão não encontrada");
    const { run, panes } = iniciarSquad(
      mission,
      String(req.body.squad ?? ""),
      String(req.body.brief ?? ""),
      (agent) => abrirPainel(agent, mission.id),
    );
    res.json({ run, panes });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/missions/:id/squad/avancar", (req, res) => {
  try {
    const mission = getMission(req.params.id);
    if (!mission) throw new Error("missão não encontrada");
    const { run, panes } = avancarFase(mission, (agent) => abrirPainel(agent, mission.id));
    res.json({ run, panes });
  } catch (err) {
    fail(res, err);
  }
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
      case "spawn": {
        const missionId = msg.missionId ?? null;
        const state = abrirPainel(msg.agent, missionId);
        const papel = config.agents[msg.agent]?.papel;
        if (papel && config.agents[msg.agent]?.cli === "claude") {
          primePane(state.paneId, papel);
        }
        break;
      }
      case "input":
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

observar(ROOT, (path, base) => broadcast({ type: "fs-change", path, base }));
for (const mission of listMissions()) {
  observar(mission.worktree, (path, base) => broadcast({ type: "fs-change", path, base }));
}

server.listen(config.port, () => {
  console.log(`cockpit → http://localhost:${config.port}  (root: ${ROOT})`);
});
