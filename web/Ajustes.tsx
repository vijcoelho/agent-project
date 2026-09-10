import { useState } from "react";
import { Config } from "./Config.tsx";
import { Skills } from "./Skills.tsx";
import { Marketplace } from "./Marketplace.tsx";
import { Receitas } from "./Receitas.tsx";
import { Media } from "./Media.tsx";
import type { AgentSpec, SquadSpec, TipoTarefa } from "./api.ts";

/**
 * Tudo o que se configura mora atrás de uma engrenagem só.
 *
 * A ordem das abas segue o caminho de quem chega: primeiro conecto os
 * provedores, depois pego skills no marketplace, olho o acervo, guardo as
 * formações que funcionaram e por fim ligo o que gera imagem e vídeo.
 */

type Aba = "provedores" | "marketplace" | "skills" | "receitas" | "media";

const ABAS: { id: Aba; label: string }[] = [
  { id: "provedores", label: "Provedores" },
  { id: "marketplace", label: "Marketplace" },
  { id: "skills", label: "Skills" },
  { id: "receitas", label: "Receitas" },
  { id: "media", label: "Media" },
];

export function Ajustes({
  inicial,
  agents,
  squads,
  tarefas,
  onFechar,
  onMudou,
}: {
  inicial?: Aba;
  agents: Record<string, AgentSpec>;
  squads: Record<string, SquadSpec>;
  tarefas: Record<string, TipoTarefa>;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [aba, setAba] = useState<Aba>(inicial ?? "provedores");

  return (
    <div className="ajustes">
      <nav className="abas" role="tablist" aria-label="Ajustes">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            className={`aba${aba === a.id ? " on" : ""}`}
            onClick={() => setAba(a.id)}
          >
            {a.label}
          </button>
        ))}
        <span className="spacer" />
        <button className="icon-btn" onClick={onFechar} aria-label="Fechar ajustes" title="Fechar">
          ✕
        </button>
      </nav>

      <div className="aba-corpo" role="tabpanel">
        {aba === "provedores" && <Config onFechar={onFechar} onMudou={onMudou} />}
        {aba === "marketplace" && <Marketplace onMudou={onMudou} />}
        {aba === "skills" && <Skills agents={agents} />}
        {aba === "receitas" && (
          <Receitas agents={agents} squads={squads} tarefas={tarefas} onMudou={onMudou} />
        )}
        {aba === "media" && <Media />}
      </div>
    </div>
  );
}
