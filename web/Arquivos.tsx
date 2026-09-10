import { useState } from "react";
import { Icon } from "./Icon.tsx";
import type { No, Nota } from "./api.ts";

/**
 * Arquivos e memória do projeto.
 *
 * Só aparece quando você pede. Os dois moram juntos porque são a mesma
 * pergunta — o que este projeto tem — em dois formatos: o que está em disco e
 * o que os agentes aprenderam.
 */

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

export function Arquivos({
  tree,
  memoria,
  arquivoAberto,
  tocado,
  onOpenFile,
  onEsquecer,
  onFechar,
}: {
  tree: No[];
  memoria: Nota[];
  arquivoAberto: string | null;
  tocado: Set<string>;
  onOpenFile: (caminho: string) => void;
  onEsquecer: (quando: number) => void;
  onFechar: () => void;
}) {
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const [aba, setAba] = useState<"arquivos" | "memoria">("arquivos");

  const toggle = (caminho: string) =>
    setAberto((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(caminho)) proximo.delete(caminho);
      else proximo.add(caminho);
      return proximo;
    });

  return (
    <aside className="lateral">
      <nav className="abas" role="tablist" aria-label="Arquivos e memória">
        <button
          role="tab"
          aria-selected={aba === "arquivos"}
          className={`aba${aba === "arquivos" ? " on" : ""}`}
          onClick={() => setAba("arquivos")}
        >
          Arquivos
        </button>
        <button
          role="tab"
          aria-selected={aba === "memoria"}
          className={`aba${aba === "memoria" ? " on" : ""}`}
          onClick={() => setAba("memoria")}
        >
          Memória
          {memoria.length > 0 && <span className="count">{memoria.length}</span>}
        </button>
        <span className="spacer" />
        <button className="icon-btn" onClick={onFechar} aria-label="Fechar arquivos" title="Fechar">
          ✕
        </button>
      </nav>

      <div className="lateral-corpo" role="tabpanel">
        {aba === "arquivos" ? (
          tree.length === 0 ? (
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
          )
        ) : memoria.length === 0 ? (
          <p className="vazio-nota">
            Vazia. Os agentes anotam aqui o que descobrem, e todo agente novo do projeto começa
            sabendo.
          </p>
        ) : (
          [...memoria].reverse().map((n) => (
            <div key={n.quando} className="nota">
              <span className="quem">{n.quem}</span>
              <span className="texto">{n.texto}</span>
              <button className="icon-btn" onClick={() => onEsquecer(n.quando)} title="Esquecer">
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
