import { Pane } from "./Pane.tsx";
import type { CSSProperties } from "react";
import type { AgentSpec, PaneState, Usage } from "./api.ts";

/**
 * Quantas colunas cabem sem espremer. Doze terminais em uma coluna são
 * inúteis; um terminal em três colunas também. O último painel de uma
 * fileira ímpar se estica no CSS, então nunca sobra buraco preto.
 */
function automatico(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}

export function PaneGrid({
  panes,
  agents,
  usos,
  colunas,
  onClose,
}: {
  panes: PaneState[];
  agents: Record<string, AgentSpec>;
  usos: Record<string, Usage>;
  colunas: "auto" | "1" | "2" | "3";
  onClose: (paneId: string) => void;
}) {
  const n = colunas === "auto" ? automatico(panes.length) : Number(colunas);
  return (
    <div
      className="panes"
      data-colunas={n}
      style={{ "--columns": `repeat(${n}, minmax(0, 1fr))` } as CSSProperties}
    >
      {panes.map((pane) => (
        <Pane
          key={pane.paneId}
          pane={pane}
          spec={agents[pane.agent]}
          usage={usos[pane.paneId]}
          onClose={() => onClose(pane.paneId)}
        />
      ))}
    </div>
  );
}
