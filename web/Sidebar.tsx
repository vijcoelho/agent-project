import { useState } from "react";
import type { AgentSpec, Mission, No, PaneState } from "./api.ts";

function Node({
  no,
  nivel,
  aberto,
  ativo,
  tocado,
  onToggle,
  onOpen,
}: {
  no: No;
  nivel: number;
  aberto: Set<string>;
  ativo: string | null;
  tocado: Set<string>;
  onToggle: (caminho: string) => void;
  onOpen: (caminho: string) => void;
}) {
  const expandido = aberto.has(no.caminho);
  return (
    <>
      <button
        className={`fnode${no.caminho === ativo ? " ativo" : ""}${
          tocado.has(no.caminho) ? " tocado" : ""
        }`}
        style={{ paddingLeft: 8 + nivel * 12 }}
        onClick={() => (no.dir ? onToggle(no.caminho) : onOpen(no.caminho))}
        title={no.caminho}
      >
        <span className="caret">{no.dir ? (expandido ? "▾" : "▸") : ""}</span>
        <span className="nome">{no.nome}</span>
      </button>
      {no.dir &&
        expandido &&
        no.filhos?.map((f) => (
          <Node
            key={f.caminho}
            no={f}
            nivel={nivel + 1}
            aberto={aberto}
            ativo={ativo}
            tocado={tocado}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
    </>
  );
}

export function Sidebar({
  missions,
  activeId,
  panes,
  agents,
  tree,
  arquivoAberto,
  tocado,
  busy,
  onSelect,
  onCreate,
  onOpenFile,
}: {
  missions: Mission[];
  activeId: string | null;
  panes: PaneState[];
  agents: Record<string, AgentSpec>;
  tree: No[];
  arquivoAberto: string | null;
  tocado: Set<string>;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: (nome: string) => void;
  onOpenFile: (caminho: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  const toggle = (caminho: string) =>
    setAberto((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(caminho)) proximo.delete(caminho);
      else proximo.add(caminho);
      return proximo;
    });

  return (
    <aside className="sidebar">
      <div className="brand">
        <strong>Cockpit</strong>
        <span>0.3</span>
      </div>

      <div className="zone missions">
        <div className="zone-head">
          <span>Missões</span>
          <span className="count">{missions.length}</span>
          <span className="spacer" />
          <button
            className="icon-btn"
            onClick={() => setDraft("")}
            disabled={busy}
            title="Nova missão"
          >
            +
          </button>
        </div>

        {draft !== null && (
          <input
            className="name-input"
            autoFocus
            placeholder="nome da missão"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onCreate(draft.trim());
                setDraft(null);
              }
              if (e.key === "Escape") setDraft(null);
            }}
          />
        )}

        <div className="zone-body">
          {missions.length === 0 && draft === null && (
            <p className="vazio-nota">Nenhuma ainda.</p>
          )}
          {missions.map((m) => {
            const tripulacao = panes.filter((p) => p.missionId === m.id);
            return (
              <button
                key={m.id}
                className={`mrow${m.id === activeId ? " active" : ""}`}
                onClick={() => onSelect(m.id)}
                title={m.worktree}
              >
                <span className="nome">{m.nome}</span>
                {m.squad && <span className="squad-flag">{m.squad.squad}</span>}
                <span className="crew">
                  {tripulacao.length === 0 ? (
                    <i className="nenhum">—</i>
                  ) : (
                    tripulacao.map((p) => (
                      <i
                        key={p.paneId}
                        style={{ background: agents[p.agent]?.cor ?? p.cor }}
                        title={p.label}
                      />
                    ))
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="zone files">
        <div className="zone-head">
          <span>Arquivos</span>
          <span className="spacer" />
        </div>
        <div className="zone-body">
          {tree.length === 0 ? (
            <p className="vazio-nota">Nada para mostrar.</p>
          ) : (
            tree.map((no) => (
              <Node
                key={no.caminho}
                no={no}
                nivel={0}
                aberto={aberto}
                ativo={arquivoAberto}
                tocado={tocado}
                onToggle={toggle}
                onOpen={onOpenFile}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
