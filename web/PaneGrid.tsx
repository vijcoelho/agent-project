import { type CSSProperties } from "react";
import { Pane } from "./Pane.tsx";
import { nomeDoPainel } from "./rotulos.ts";
import type { AgentSpec, PaneState, Usage } from "./api.ts";

export type Colunas = "auto" | "1" | "2" | "3";

/**
 * O palco: terminais e nada mais.
 *
 * Todos os painéis ficam montados o tempo todo, de todas as missões. Trocar
 * de missão só muda quem está visível — a sessão xterm, o scrollback e a
 * saída que chega enquanto ninguém olha continuam intactos. Só encerrar de
 * verdade remove um Pane.
 *
 * A missão aberta mostra todos os seus terminais de uma vez, em grade
 * automática. Escolher um agente na lateral não esconde os outros: leva o
 * cursor para o terminal dele.
 */
export function PaneGrid({ panes, missionId, agents, usos, colunas, onClose, selectedId }: {
  panes: PaneState[];
  missionId: string | null;
  agents: Record<string, AgentSpec>;
  usos: Record<string, Usage>;
  colunas: Colunas;
  onClose: (id: string) => void;
  selectedId: string | null;
}) {
  const visible = panes.filter(p => missionId !== null && p.missionId === missionId);
  const n = colunas === "auto" ? (visible.length <= 1 ? 1 : visible.length <= 4 ? 2 : 3) : Number(colunas);

  return (
    <div className="panes" data-colunas={n} hidden={!visible.length}
      style={{ "--columns": `repeat(${n}, minmax(0, 1fr))` } as CSSProperties}>
      {panes.map(p => <Pane key={p.paneId} pane={p} spec={agents[p.agent]} usage={usos[p.paneId]}
        visible={p.missionId === missionId}
        selecionado={p.paneId === selectedId}
        label={nomeDoPainel(p, panes, agents)}
        onClose={() => onClose(p.paneId)} />)}
    </div>
  );
}
