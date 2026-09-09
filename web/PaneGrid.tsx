import { Pane } from "./Pane.tsx";
import type { AgentSpec, PaneState, Usage } from "./api.ts";

function columns(count: number): string {
  if (count <= 1) return "1fr";
  if (count <= 4) return "1fr 1fr";
  return "1fr 1fr 1fr";
}

export function PaneGrid({
  panes,
  agents,
  usos,
  onClose,
}: {
  panes: PaneState[];
  agents: Record<string, AgentSpec>;
  usos: Record<string, Usage>;
  onClose: (paneId: string) => void;
}) {
  return (
    <div className="panes" style={{ gridTemplateColumns: columns(panes.length) }}>
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
