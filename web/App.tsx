import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getConnection, onMessage, onReconnect, send, subscribeConnection } from "./socket.ts";
import { Icon } from "./Icon.tsx";
import { Modal } from "./Modal.tsx";
import { Maestro } from "./Maestro.tsx";
import { Workspace } from "./Workspace.tsx";
import { Arquivos } from "./Arquivos.tsx";
import { PaneGrid } from "./PaneGrid.tsx";
import { SquadBar } from "./SquadBar.tsx";
import { gravar, type EstadoVoz, type Gravacao } from "./voz.ts";
import { Microfone } from "./Microfone.tsx";
import { Consumo } from "./Consumo.tsx";
import { Redline } from "./Redline.tsx";
import { escolherPasta } from "./pasta.ts";
import { NovaMissao, type Plano } from "./NovaMissao.tsx";
import { Ajustes } from "./Ajustes.tsx";
import {
  closeProject,
  deleteMission,
  deleteNota,
  fetchConfig,
  fetchFile,
  fetchMemoria,
  fetchMissions,
  fetchPanes,
  fetchProjects,
  fetchTree,
  postAvancarFase,
  postMission,
  postNota,
  postProject,
  postSquad,
  prepararGit,
  saveFile,
  type AgentSpec,
  type Mission,
  type No,
  type Nota,
  type PaneState,
  type Project,
  type Provider,
  type Receita,
  type SquadSpec,
  type TipoTarefa,
  type Usage,
} from "./api.ts";

const Editor = lazy(() => import("./Editor.tsx").then((module) => ({ default: module.Editor })));

export function App() {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  const [verWorkspace, setVerWorkspace] = useState(false);
  const [verArquivos, setVerArquivos] = useState(false);
  const [colunas, setColunas] = useState<"auto" | "1" | "2" | "3">("auto");
  const [agents, setAgents] = useState<Record<string, AgentSpec>>({});
  const [squads, setSquads] = useState<Record<string, SquadSpec>>({});
  const [tarefas, setTarefas] = useState<Record<string, TipoTarefa>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [receitas, setReceitas] = useState<Record<string, Receita>>({});
  const [criandoMissao, setCriandoMissao] = useState(false);
  const [verConfig, setVerConfig] = useState(false);
  const [verMaestro, setVerMaestro] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panes, setPanes] = useState<PaneState[]>([]);
  const [usos, setUsos] = useState<Record<string, Usage>>({});
  const [memoria, setMemoria] = useState<Nota[]>([]);
  const [agent, setAgent] = useState("maestro");
  const [tipoManual, setTipoManual] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verConsumo, setVerConsumo] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);

  const [tree, setTree] = useState<No[]>([]);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [conteudo, setConteudo] = useState("");
  const [sujo, setSujo] = useState(false);
  const [tocado, setTocado] = useState<Set<string>>(new Set());

  const [voz, setVoz] = useState<EstadoVoz>("ocioso");
  const [traduzir, setTraduzir] = useState(
    () => localStorage.getItem("cockpit.traduzir") === "1",
  );
  // Qual microfone está gravando: "painel" ou "brief".
  const [vozOnde, setVozOnde] = useState<string | null>(null);
  const gravacao = useRef<Gravacao | null>(null);
  const destino = useRef<((texto: string) => void) | null>(null);

  /**
   * Uma edição pendente não some sozinha.
   *
   * Trocar de arquivo, de missão ou de projeto descartava o texto sem avisar.
   * Agora toda transição passa por aqui: com o editor sujo, a ação fica de
   * lado e você decide salvar, descartar ou ficar.
   */
  const [pendente, setPendente] = useState<(() => void) | null>(null);
  const trocar = (acao: () => void) => {
    if (sujoRef.current) setPendente(() => acao);
    else acao();
  };

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const projectIdRef = useRef<string | null>(null);
  projectIdRef.current = projectId;
  const arquivoRef = useRef<string | null>(null);
  arquivoRef.current = arquivo;
  const sujoRef = useRef(false);
  sujoRef.current = sujo;

  const recarregarProjetos = useCallback(async () => {
    const { projects: lista } = await fetchProjects();
    setProjects(lista);
    setProjectId((id) => (id && lista.some((p) => p.id === id) ? id : (lista[0]?.id ?? null)));
  }, []);

  const recarregarMissoes = useCallback(async (pid: string | null) => {
    if (!pid) {
      setMissions([]);
      setActiveId(null);
      return;
    }
    const { missions: lista } = await fetchMissions(pid);
    if (projectIdRef.current !== pid) return;
    setMissions(lista);
    setActiveId((id) => (id && lista.some((m) => m.id === id) ? id : (lista[0]?.id ?? null)));
  }, []);

  const recarregarArvore = useCallback(async (missionId: string | null, pid: string | null) => {
    if (!pid) {
      setTree([]);
      return;
    }
    const result = await fetchTree(missionId, pid);
    if (projectIdRef.current === pid && activeIdRef.current === missionId) setTree(result.tree);
  }, []);

  useEffect(() => {
    void fetchConfig().then((c) => {
      setAgents(c.agents);
      setSquads(c.squads);
      setTarefas(c.tarefas ?? {});
      setProviders(c.providers ?? []);
      setReceitas(c.receitas ?? {});
      setAgent((a) => (c.agents[a] ? a : (Object.keys(c.agents)[0] ?? a)));
    });
    const recarregarPaineis = () =>
      fetchPanes().then(({ panes: lista }) => {
        setPanes(lista);
        setUsos(Object.fromEntries(lista.map((p) => [p.paneId, p.usage])));
      });

    void recarregarProjetos();
    void recarregarPaineis();

    // Voltando de uma queda, o servidor é a verdade: painéis podem ter
    // nascido ou morrido enquanto estávamos mudos.
    const soltarReconexao = onReconnect(() => {
      void recarregarPaineis();
      void recarregarProjetos();
      void recarregarMissoes(projectIdRef.current);
      void recarregarArvore(activeIdRef.current, projectIdRef.current);
    });

    const soltarMensagens = onMessage((msg) => {
      switch (msg.type) {
        case "error": setAviso(msg.message); break;
        case "maestro":
          void fetchConfig().then(c => { setAgents(c.agents); setProviders(c.providers ?? []); });
          break;
        case "panes":
          setPanes(msg.panes);
          break;
        case "spawned":
          setPanes((prev) =>
            prev.some((p) => p.paneId === msg.pane.paneId) ? prev : [...prev, msg.pane],
          );
          void recarregarMissoes(projectIdRef.current);
          break;
        case "exit":
          setPanes((prev) => prev.filter((p) => p.paneId !== msg.paneId));
          void recarregarMissoes(projectIdRef.current);
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
        case "memoria":
          if (msg.projectId === projectIdRef.current) {
            void fetchMemoria(msg.projectId).then(notas => { if (msg.projectId === projectIdRef.current) setMemoria(notas); });
          }
          break;
        case "fs-change":
          setTocado((prev) => new Set(prev).add(msg.path));
          void recarregarArvore(activeIdRef.current, projectIdRef.current);
          // Recarrega o editor só se o arquivo aberto mudou por fora e não há
          // edição pendente — trabalho local nunca é sobrescrito.
          if (msg.path === arquivoRef.current && !sujoRef.current) {
            const pid = projectIdRef.current, mid = activeIdRef.current;
            void fetchFile(mid, pid, msg.path).then((f) => {
              if (projectIdRef.current === pid && activeIdRef.current === mid && arquivoRef.current === msg.path && !sujoRef.current) setConteudo(f.content);
            });
          }
          break;
      }
    });

    return () => {
      soltarMensagens();
      soltarReconexao();
    };
  }, [recarregarProjetos, recarregarMissoes, recarregarArvore]);

  useEffect(() => {
    setMissions([]);
    setActiveId(null);
    setTree([]);
    setArquivo(null);
    setConteudo("");
    setMemoria([]);
    void recarregarMissoes(projectId);
    if (projectId) void fetchMemoria(projectId).then((notas) => {
      if (projectIdRef.current === projectId) setMemoria(notas);
    });
    else setMemoria([]);
  }, [projectId, recarregarMissoes]);

  // Trocar de missão troca a raiz dos arquivos e fecha o editor.
  useEffect(() => {
    setArquivo(null);
    setConteudo("");
    setSujo(false);
    setTocado(new Set());
    void recarregarArvore(activeId, projectId);
  }, [activeId, projectId, recarregarArvore]);

  /** Cria a missão e já sobe o que o assistente escolheu. */
  const criarMissao = (plano: Plano) =>
    guarded(async () => {
      if (!projectId) return;
      const m = await postMission(
        projectId,
        plano.nome,
        plano.objetivo,
        plano.skills,
        plano.receita,
        plano.elenco,
      );
      await recarregarMissoes(projectId);
      setActiveId(m.id);
      setCriandoMissao(false);

      if (plano.modo === "squad" && plano.objetivo) {
        await postSquad(m.id, plano.squad, plano.objetivo);
        await recarregarMissoes(projectId);
        return;
      }
      // Escalonado: quatro CLIs subindo juntos brigam por CPU.
      plano.agentes.forEach((agent, i) => {
        setTimeout(
          () => send({ type: "spawn", agent, missionId: m.id, tipo: plano.tipo || undefined }),
          i * 1800,
        );
      });
    });

  const project = projects.find((p) => p.id === projectId) ?? null;
  const active = missions.find((m) => m.id === activeId && m.projectId === projectId) ?? null;
  const visible = panes.filter((p) => p.missionId === activeId);
  const maestroCli = visible.find(p => p.maestro)?.cli ?? agents.maestro?.cli;
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

  // ---------- voz: aperta, fala, solta ----------

  /** O mesmo ditado serve a vários campos; quem chama diz onde o texto cai. */
  const ditar = (onde: string, aplicar: (texto: string) => void) =>
    guarded(async () => {
      const emCurso = gravacao.current;
      if (emCurso) {
        // Solta a referência antes de esperar: se a transcrição falhar, o
        // botão não pode ficar preso em "ouvindo" para sempre.
        gravacao.current = null;
        const entregar = destino.current;
        destino.current = null;
        const texto = await emCurso.parar();
        if (texto) entregar?.(texto);
        else setAviso("não entendi nada no áudio");
        return;
      }
      destino.current = aplicar;
      setVozOnde(onde);
      gravacao.current = await gravar(traduzir, setVoz);
    }).finally(() => {
      if (!gravacao.current) {
        setVoz("ocioso");
        setVozOnde(null);
      }
    });

  const ditarNoPainel = () =>
    ditar("painel", (texto) => {
      const alvo = visible[0];
      if (alvo) send({ type: "input", paneId: alvo.paneId, data: texto });
      else setAviso("abra um painel antes de ditar");
    });

  return (
    <div className="cockpit">
      {connection === "disconnected" && <div className="aviso" role="alert">A conexão com o servidor foi interrompida. Reinicie o servidor e recarregue para continuar.<button onClick={() => window.location.reload()}>Recarregar</button></div>}
      <div className="deck">
        <div className="bench">
          {/* Uma barra só. Tudo o que não é terminal cabe aqui — cada linha a
              mais aqui em cima é uma linha a menos de terminal. */}
          <div className="headline">
            <button
              className="btn projeto"
              onClick={() => setVerWorkspace(true)}
              title="Projetos e missões"
            >
              <Icon name="grid" size={14} />
              {project ? project.nome : "Projetos"}
            </button>
            {active ? (
              <>
                <span className="fio-v" />
                <h1>{active.nome}</h1>
                {active.elenco && active.elenco.clis.length > 0 && (
                  <span
                    className="branch elenco-selo"
                    title="IAs liberadas nesta missão. O cockpit não abre painel fora desta lista; quem está marcado como só imagens não escreve nem desenha a tela."
                  >
                    {active.elenco.clis
                      .map((c) => {
                        const nome = { claude: "Claude", codex: "GPT", agy: "Gemini", bash: "Terminal" }[c] ?? c;
                        return active.elenco?.soVisual?.includes(c) ? `${nome} (só imagens)` : nome;
                      })
                      .join(" · ")}
                  </span>
                )}
                {active.branch ? (
                  <span className="branch">{active.branch}</span>
                ) : (
                  <button
                    className="branch avulsa"
                    title="As missões deste projeto dividem a mesma pasta. Clique para iniciar um git aqui — cada missão nova passa a ganhar um worktree próprio."
                    onClick={() =>
                      guarded(async () => {
                        if (!projectId) return;
                        await prepararGit(projectId);
                        await recarregarProjetos();
                        await recarregarMissoes(projectId);
                      })
                    }
                    disabled={busy}
                  >
                    sem isolamento · isolar
                  </button>
                )}
                {active.objetivo && (
                  <span className="objetivo" title={active.objetivo}>
                    {active.objetivo}
                  </span>
                )}
                <span className="spacer" />
                <select
                  className="picker"
                  aria-label="Agente do novo painel"
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  title={agents[agent]?.papel ?? ""}
                >
                  {Object.entries(agents).map(([id, a]) => (
                    <option key={id} value={id}>
                      {a.label} — {a.model ?? a.cli}
                      {a.effort ? ` · ${a.effort}` : ""}
                    </option>
                  ))}
                </select>
                <select
                  className="picker"
                  aria-label="Tipo de tarefa"
                  value={tipoManual}
                  onChange={(e) => setTipoManual(e.target.value)}
                  title="O tipo do trabalho decide modelo e esforço. Sem tipo, vale o padrão do agente."
                >
                  <option value="">sem tipo</option>
                  {Object.entries(tarefas).map(([id, t]) => (
                    <option key={id} value={id}>
                      {t.label}
                      {t.model ? ` · ${t.model}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="btn solid"
                  disabled={connection !== "connected"}
                  style={
                    agents[agent]
                      ? ({ ["--pane" as string]: agents[agent]!.cor } as object)
                      : undefined
                  }
                  onClick={() =>
                    send({
                      type: "spawn",
                      agent,
                      missionId: active.id,
                      tipo: tipoManual || undefined,
                    })
                  }
                >
                  Abrir painel
                </button>
              </>
            ) : (
              <span className="spacer" />
            )}

            {/* Colunas: só aparece quando há mais de um terminal para arrumar. */}
            {active && visible.length > 1 && (
              <span className="cols" role="group" aria-label="Colunas dos terminais">
                {(["auto", "1", "2", "3"] as const).map((c) => (
                  <button
                    key={c}
                    className={colunas === c ? "on" : undefined}
                    title={c === "auto" ? "Colunas automáticas" : `${c} coluna${c === "1" ? "" : "s"}`}
                    onClick={() => setColunas(c)}
                  >
                    {c === "auto" ? "A" : c}
                  </button>
                ))}
              </span>
            )}

            <span className="sep" />
            {/* Ditado e estado da conexão: as duas coisas que dizem se o
                cockpit está te ouvindo. Ficam juntas, no canto. */}
            {active && (
              <>
                <button
                  className={`btn idioma${traduzir ? " on" : ""}`}
                  onClick={() => {
                    const proximo = !traduzir;
                    setTraduzir(proximo);
                    localStorage.setItem("cockpit.traduzir", proximo ? "1" : "0");
                  }}
                  title={
                    traduzir
                      ? "Você fala português, o agente recebe em inglês."
                      : "O agente recebe exatamente o que você falar."
                  }
                >
                  {traduzir ? "PT→EN" : "PT"}
                </button>
                <Microfone estado={voz} ativo={vozOnde === "painel"} onClick={ditarNoPainel} />
              </>
            )}
            <span
              className={`connection ${connection}`}
              role="status"
              title={connection === "connected" ? "Conectado ao servidor" : connection === "connecting" ? "Conectando…" : "Sem conexão"}
            >
              <i />
              {connection !== "connected" && (connection === "connecting" ? "conectando" : "sem conexão")}
            </span>
            {project && (
              <button
                className={`icon-btn${verArquivos ? " on" : ""}`}
                aria-label="Arquivos e memória"
                aria-pressed={verArquivos}
                onClick={() => setVerArquivos((v) => !v)}
                title="Arquivos e memória"
              >
                <Icon name="folder" size={15} />
              </button>
            )}
            <button className="icon-btn" aria-label="Consumo" onClick={() => setVerConsumo(true)} title={`Consumo — $${custoTotal.toFixed(2)} estimados`}>
              <Icon name="chart" size={15} />
            </button>
            <button
              className="icon-btn"
              aria-label="Maestro"
              onClick={() => setVerMaestro(true)}
              title={`Maestro: ${maestroCli === "codex" ? "GPT" : (maestroCli ?? "escolher")}`}
            >
              <Icon name="team" size={15} />
            </button>
            <button className="icon-btn" aria-label="Configurações" onClick={() => setVerConfig(true)} title="Configurações">
              <Icon name="settings" size={15} />
            </button>
          </div>

          {active && (
            <SquadBar
              mission={active}
              squads={squads}
              busy={busy}
              voz={voz}
              vozAqui={vozOnde === "brief"}
              onDitar={(aplicar) => ditar("brief", aplicar)}
              onRun={(squad, brief) =>
                guarded(async () => {
                  await postSquad(active.id, squad, brief);
                  await recarregarMissoes(projectId);
                })
              }
              onAvancar={() =>
                guarded(async () => {
                  await postAvancarFase(active.id);
                  await recarregarMissoes(projectId);
                })
              }
            />
          )}

          {aviso && (
            <div className="aviso" role="alert">
              {aviso}
              <button onClick={() => setAviso(null)}>✕</button>
            </div>
          )}

          {criandoMissao && (
            <Modal title="Nova missão" onClose={() => setCriandoMissao(false)}>
            <NovaMissao
              agents={agents}
              squads={squads}
              tarefas={tarefas}
              providers={providers}
              receitas={receitas}
              onCriar={criarMissao}
              onCancelar={() => setCriandoMissao(false)}
            />
            </Modal>
          )}

          {verConfig && (
            <Modal title="Ajustes" onClose={() => setVerConfig(false)}>
            <Ajustes
              agents={agents}
              squads={squads}
              tarefas={tarefas}
              onFechar={() => setVerConfig(false)}
              onMudou={() => {
                void fetchConfig().then((c) => {
                  setAgents(c.agents);
                  setSquads(c.squads);
                  setTarefas(c.tarefas ?? {});
                  setProviders(c.providers ?? []);
                  setReceitas(c.receitas ?? {});
                });
              }}
            />
            </Modal>
          )}

          {verWorkspace && (
            <Modal title="Projetos e missões" onClose={() => setVerWorkspace(false)}>
              <Workspace
                projects={projects}
                projectId={projectId}
                missions={missions}
                activeId={activeId}
                panes={panes}
                agents={agents}
                busy={busy}
                escolhendo={escolhendo}
                onTrocarProjeto={(id) =>
                  trocar(() => {
                    projectIdRef.current = id;
                    activeIdRef.current = null;
                    setProjectId(id);
                    setActiveId(null);
                    setTree([]);
                    setArquivo(null);
                  })
                }
                onProcurarPasta={() =>
                  guarded(async () => {
                    setEscolhendo(true);
                    try {
                      const { caminho } = await escolherPasta();
                      if (!caminho) return; // você cancelou
                      const p = await postProject(caminho);
                      await recarregarProjetos();
                      setProjectId(p.id);
                    } finally {
                      setEscolhendo(false);
                    }
                  })
                }
                onFecharProjeto={(id) =>
                  trocar(() =>
                    guarded(async () => {
                      await closeProject(id);
                      projectIdRef.current = null;
                      activeIdRef.current = null;
                      setActiveId(null);
                      setTree([]);
                      setArquivo(null);
                      setProjectId(null);
                      await recarregarProjetos();
                    }),
                  )
                }
                onSelectMission={(id) => trocar(() => setActiveId(id))}
                onCreateMission={() => {
                  setVerWorkspace(false);
                  setCriandoMissao(true);
                }}
                onArquivarMissao={(id) =>
                  guarded(async () => {
                    await deleteMission(id);
                    if (activeId === id) setActiveId(null);
                    await recarregarMissoes(projectId);
                  })
                }
                onFechar={() => setVerWorkspace(false)}
              />
            </Modal>
          )}

          {pendente && (
            <Modal title="Edição não salva" onClose={() => setPendente(null)}>
              <div className="ajustes janela">
                <nav className="abas">
                  <span className="aba-titulo">Edição não salva</span>
                  <span className="spacer" />
                  <button className="icon-btn" onClick={() => setPendente(null)} aria-label="Cancelar troca" title="Ficar aqui">
                    ✕
                  </button>
                </nav>
                <div className="aba-corpo">
                  <div className="wizard-corpo">
                    <p className="dica sem-margem">
                      <code>{arquivo}</code> tem mudanças que ainda não foram para o disco.
                    </p>
                    <div className="form-acoes">
                      <button className="btn quiet" onClick={() => setPendente(null)}>
                        Ficar aqui
                      </button>
                      <button
                        className="btn perigo"
                        onClick={() => {
                          const seguir = pendente;
                          setSujo(false);
                          sujoRef.current = false;
                          setPendente(null);
                          seguir();
                        }}
                      >
                        Descartar
                      </button>
                      <button
                        className="btn solid"
                        disabled={busy}
                        onClick={() => {
                          const seguir = pendente;
                          void guarded(async () => {
                            await saveFile(activeId, projectId, arquivo!, conteudo);
                            setSujo(false);
                            sujoRef.current = false;
                            setPendente(null);
                            seguir();
                          });
                        }}
                      >
                        Salvar e continuar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {verConsumo && <Modal title="Consumo" onClose={() => setVerConsumo(false)}><Consumo onFechar={() => setVerConsumo(false)} /></Modal>}
          {verMaestro && <Modal title="Maestro e continuidade" onClose={() => setVerMaestro(false)}><Maestro missionId={active?.id ?? null} onClose={() => setVerMaestro(false)} onChanged={() => { void fetchConfig().then(c => setAgents(c.agents)); }} /></Modal>}

          <div className={`work${arquivo ? " dividido" : ""}`}>
            {verArquivos && project && (
              <Arquivos
                tree={tree}
                memoria={memoria}
                arquivoAberto={arquivo}
                tocado={tocado}
                onOpenFile={(caminho) =>
                  trocar(() =>
                    guarded(async () => {
                      const f = await fetchFile(activeId, projectId, caminho);
                      if (activeIdRef.current !== activeId || projectIdRef.current !== projectId) return;
                      setArquivo(caminho);
                      setConteudo(f.content);
                      setSujo(false);
                      setTocado((prev) => {
                        const proximo = new Set(prev);
                        proximo.delete(caminho);
                        return proximo;
                      });
                    }),
                  )
                }
                onEsquecer={(quando) =>
                  guarded(async () => {
                    if (!projectId) return;
                    await deleteNota(projectId, quando);
                    setMemoria(await fetchMemoria(projectId));
                  })
                }
                onFechar={() => setVerArquivos(false)}
              />
            )}
            <div className="panes-wrap">
              {!project ? (
                <div className="partida">
                  <h2>Abra uma pasta para começar.</h2>
                  <button
                    className="botao-grande"
                    onClick={() =>
                      guarded(async () => {
                        setEscolhendo(true);
                        try {
                          const { caminho } = await escolherPasta();
                          if (!caminho) return;
                          const p = await postProject(caminho);
                          await recarregarProjetos();
                          setProjectId(p.id);
                        } finally {
                          setEscolhendo(false);
                        }
                      })
                    }
                    disabled={busy}
                  >
                    <Icon name="folder" /> Abrir projeto <Icon name="arrow" size={16} />
                  </button>
                  <p className="rodape-partida">
                    Qualquer pasta serve. Com git, cada missão ganha um worktree próprio.
                  </p>
                </div>
              ) : !active ? (
                <div className="partida">
                  <h2>Qual é a próxima missão?</h2>
                  <button className="botao-grande" onClick={() => setCriandoMissao(true)}>
                    <Icon name="plus" /> Nova missão <Icon name="arrow" size={16} />
                  </button>
                  <p className="rodape-partida">
                    {project.git
                      ? "Cada missão ganha seu próprio worktree. Agentes da mesma missão compartilham os arquivos."
                      : "Sem git nesta pasta, as missões dividem os mesmos arquivos."}
                  </p>
                </div>
              ) : visible.length === 0 ? (
                <div className="partida">
                  <h2>Traga o primeiro agente.</h2>
                  <button className="botao-grande" disabled={connection !== "connected" || !agents[agent]} onClick={() => send({ type: "spawn", agent, missionId: active.id, tipo: tipoManual || undefined })}><Icon name="plus" size={16} /> Abrir {agents[agent]?.label ?? "agente"}<Icon name="arrow" size={16} /></button>
                  <p className="rodape-partida">
                    O <strong>maestro</strong> divide o trabalho e chama os especialistas sozinho.
                    Um especialista você comanda direto.
                  </p>
                </div>
              ) : (
                <PaneGrid
                  panes={visible}
                  agents={agents}
                  usos={usos}
                  colunas={colunas}
                  onClose={(paneId) => send({ type: "kill", paneId })}
                />
              )}
            </div>

            {arquivo && (
              <Suspense fallback={<div className="editor"><p className="vazio-nota" role="status">Carregando editor…</p></div>}>
              <Editor
                caminho={arquivo}
                conteudo={conteudo}
                sujo={sujo}
                onChange={(texto) => {
                  setConteudo(texto);
                  setSujo(true);
                }}
                onSave={() =>
                  guarded(async () => {
                    await saveFile(activeId, projectId, arquivo, conteudo);
                    setSujo(false);
                  })
                }
                onClose={() =>
                  trocar(() => {
                    setArquivo(null);
                    setSujo(false);
                  })
                }
              />
              </Suspense>
            )}
          </div>
        </div>
      </div>

      <div className="gauges">
        <Redline />
        <span className="gauge">
          painéis <b>{panes.length}</b>
        </span>
        <span className="gauge">
          missões <b>{missions.length}</b>
        </span>
        <span className="gauge">
          memória <b>{memoria.length}</b>
        </span>
        {active && (
          <>
            <span className="gauge">
              head <b>{active.git.head ?? "—"}</b>
            </span>
            <span className={`gauge${active.git.dirty > 0 ? " alerta" : ""}`}>
              alterados <b>{active.git.dirty}</b>
            </span>
          </>
        )}
        <button
          className="gauge clicavel"
          onClick={() => setVerConsumo(true)}
          title="Ver o consumo de Claude e Gemini"
        >
          custo estimado <b>${custoTotal.toFixed(2)}</b>
        </button>
        {project && (
          <span className="gauge raiz" title={project.root}>
            {project.root}
          </span>
        )}
      </div>
    </div>
  );
}
