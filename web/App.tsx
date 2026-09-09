import { useCallback, useEffect, useRef, useState } from "react";
import { onMessage, send } from "./socket.ts";
import { Sidebar } from "./Sidebar.tsx";
import { PaneGrid } from "./PaneGrid.tsx";
import { Editor } from "./Editor.tsx";
import { SquadBar } from "./SquadBar.tsx";
import {
  deleteMission,
  fetchConfig,
  fetchFile,
  fetchMissions,
  fetchPanes,
  fetchTree,
  postAvancarFase,
  postMission,
  postSquad,
  saveFile,
  type AgentSpec,
  type Mission,
  type No,
  type PaneState,
  type SquadSpec,
  type Usage,
} from "./api.ts";

export function App() {
  const [root, setRoot] = useState("");
  const [agents, setAgents] = useState<Record<string, AgentSpec>>({});
  const [squads, setSquads] = useState<Record<string, SquadSpec>>({});
  const [missions, setMissions] = useState<Mission[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panes, setPanes] = useState<PaneState[]>([]);
  const [usos, setUsos] = useState<Record<string, Usage>>({});
  const [agent, setAgent] = useState("piloto");
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tree, setTree] = useState<No[]>([]);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [conteudo, setConteudo] = useState("");
  const [sujo, setSujo] = useState(false);
  const [tocado, setTocado] = useState<Set<string>>(new Set());

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const arquivoRef = useRef<string | null>(null);
  arquivoRef.current = arquivo;
  const sujoRef = useRef(false);
  sujoRef.current = sujo;

  const refresh = useCallback(async () => {
    const data = await fetchMissions();
    setRoot(data.root);
    setMissions(data.missions);
    setActiveId((id) => id ?? data.missions[0]?.id ?? null);
  }, []);

  const recarregarArvore = useCallback(async (missionId: string | null) => {
    setTree((await fetchTree(missionId)).tree);
  }, []);

  useEffect(() => {
    void fetchConfig().then((c) => {
      setAgents(c.agents);
      setSquads(c.squads);
      setAgent((a) => (c.agents[a] ? a : (Object.keys(c.agents)[0] ?? a)));
    });
    void refresh();
    void fetchPanes().then(({ panes: lista }) => {
      setPanes(lista);
      setUsos(Object.fromEntries(lista.map((p) => [p.paneId, p.usage])));
    });

    return onMessage((msg) => {
      switch (msg.type) {
        case "panes":
          setPanes(msg.panes);
          break;
        case "spawned":
          setPanes((prev) =>
            prev.some((p) => p.paneId === msg.pane.paneId) ? prev : [...prev, msg.pane],
          );
          void refresh();
          break;
        case "exit":
          setPanes((prev) => prev.filter((p) => p.paneId !== msg.paneId));
          void refresh();
          break;
        case "pulse":
          setPanes((prev) =>
            prev.map((p) => {
              const pulso = msg.pulsos.find((x) => x.paneId === p.paneId);
              return pulso ? { ...p, status: pulso.status, atividade: pulso.atividade } : p;
            }),
          );
          break;
        case "usage":
          setUsos((prev) => {
            const proximo = { ...prev };
            for (const u of msg.usos) proximo[u.paneId] = u.usage;
            return proximo;
          });
          break;
        case "fs-change":
          setTocado((prev) => new Set(prev).add(msg.path));
          void recarregarArvore(activeIdRef.current);
          // Recarrega o editor só se o arquivo aberto mudou por fora e não há
          // edição pendente — trabalho local nunca é sobrescrito.
          if (msg.path === arquivoRef.current && !sujoRef.current) {
            void fetchFile(activeIdRef.current, msg.path).then((f) => setConteudo(f.content));
          }
          break;
      }
    });
  }, [refresh, recarregarArvore]);

  // Trocar de missão troca a raiz dos arquivos e fecha o editor.
  useEffect(() => {
    setArquivo(null);
    setConteudo("");
    setSujo(false);
    setTocado(new Set());
    void recarregarArvore(activeId);
  }, [activeId, recarregarArvore]);

  const active = missions.find((m) => m.id === activeId) ?? null;
  const visible = panes.filter((p) => p.missionId === activeId);
  const custoTotal = missions.reduce((n, m) => n + m.usage.custo, 0);

  const guarded = async (fn: () => Promise<void>) => {
    setBusy(true);
    setAviso(null);
    try {
      await fn();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const criar = (nome: string) =>
    guarded(async () => {
      const mission = await postMission(nome);
      await refresh();
      setActiveId(mission.id);
    });

  const arquivar = () =>
    guarded(async () => {
      if (!active) return;
      await deleteMission(active.id);
      setActiveId(null);
      await refresh();
    });

  const abrirArquivo = (caminho: string) =>
    guarded(async () => {
      const f = await fetchFile(activeId, caminho);
      setArquivo(caminho);
      setConteudo(f.content);
      setSujo(false);
      setTocado((prev) => {
        const proximo = new Set(prev);
        proximo.delete(caminho);
        return proximo;
      });
    });

  const salvar = () =>
    guarded(async () => {
      if (!arquivo) return;
      await saveFile(activeId, arquivo, conteudo);
      setSujo(false);
    });

  const spec = agents[agent];

  return (
    <div className="cockpit">
      <div className="deck">
        <Sidebar
          missions={missions}
          activeId={activeId}
          panes={panes}
          agents={agents}
          tree={tree}
          arquivoAberto={arquivo}
          tocado={tocado}
          busy={busy}
          onSelect={setActiveId}
          onCreate={criar}
          onOpenFile={abrirArquivo}
        />

        <div className="bench">
          <div className="headline">
            {active ? (
              <>
                <h1>{active.nome}</h1>
                <span className="branch">{active.branch}</span>
                <span className="spacer" />
                <select
                  className="picker"
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  title={spec?.papel ?? ""}
                >
                  {Object.entries(agents).map(([id, a]) => (
                    <option key={id} value={id}>
                      {a.label}
                      {a.model ? ` · ${a.model}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="btn solid"
                  style={spec ? ({ ["--pane" as string]: spec.cor } as object) : undefined}
                  onClick={() => send({ type: "spawn", agent, missionId: active.id })}
                >
                  Abrir painel
                </button>
                <button className="btn quiet" onClick={arquivar} disabled={busy}>
                  Arquivar missão
                </button>
              </>
            ) : (
              <>
                <h1 className="mudo">Nenhuma missão aberta</h1>
                <span className="spacer" />
              </>
            )}
          </div>

          {active && (
            <SquadBar
              mission={active}
              squads={squads}
              busy={busy}
              onRun={(squad, brief) =>
                guarded(async () => {
                  await postSquad(active.id, squad, brief);
                  await refresh();
                })
              }
              onAvancar={() =>
                guarded(async () => {
                  await postAvancarFase(active.id);
                  await refresh();
                })
              }
            />
          )}

          {aviso && (
            <div className="aviso">
              {aviso}
              <button onClick={() => setAviso(null)}>✕</button>
            </div>
          )}

          <div className={`work${arquivo ? " dividido" : ""}`}>
            <div className="panes-wrap">
              {!active ? (
                <div className="blank">
                  <h2>Comece por uma missão</h2>
                  <p className="sub">
                    Cada missão ganha um worktree próprio no branch <code>cockpit/nome</code>, para
                    que dois agentes nunca escrevam no mesmo arquivo ao mesmo tempo.
                  </p>
                  <p className="como">Use o + ao lado de Missões, na barra da esquerda.</p>
                </div>
              ) : visible.length === 0 ? (
                <div className="blank">
                  <h2>Missão pronta, sem ninguém dentro</h2>
                  <p className="sub">
                    Abra um painel para colocar um agente em <code>{active.branch}</code>, ou
                    escreva um briefing acima para lançar um time inteiro de uma vez.
                  </p>
                </div>
              ) : (
                <PaneGrid
                  panes={visible}
                  agents={agents}
                  usos={usos}
                  onClose={(paneId) => send({ type: "kill", paneId })}
                />
              )}
            </div>

            {arquivo && (
              <Editor
                caminho={arquivo}
                conteudo={conteudo}
                sujo={sujo}
                onChange={(texto) => {
                  setConteudo(texto);
                  setSujo(true);
                }}
                onSave={salvar}
                onClose={() => {
                  setArquivo(null);
                  setSujo(false);
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="gauges">
        <span className="gauge">
          painéis <b>{panes.length}</b>
        </span>
        <span className="gauge">
          missões <b>{missions.length}</b>
        </span>
        {active && (
          <>
            <span className="gauge">
              head <b>{active.git.head}</b>
            </span>
            <span className={`gauge${active.git.dirty > 0 ? " alerta" : ""}`}>
              alterados <b>{active.git.dirty}</b>
            </span>
          </>
        )}
        <span className="gauge" title="preço de lista da API, não o que você paga na assinatura">
          custo estimado <b>${custoTotal.toFixed(2)}</b>
        </span>
        <span className="gauge raiz" title={root}>
          {root}
        </span>
      </div>
    </div>
  );
}
