import { useState } from "react";
import { Microfone } from "./Microfone.tsx";
import type { EstadoVoz } from "./voz.ts";
import type { Mission, SquadSpec } from "./api.ts";

export function SquadBar({
  mission,
  squads,
  busy,
  voz,
  vozAqui,
  onDitar,
  onRun,
  onAvancar,
}: {
  mission: Mission;
  squads: Record<string, SquadSpec>;
  busy: boolean;
  voz: EstadoVoz;
  vozAqui: boolean;
  onDitar: (aplicar: (texto: string) => void) => void;
  onRun: (squad: string, brief: string) => void;
  onAvancar: () => void;
}) {
  const nomes = Object.keys(squads);
  const [squad, setSquad] = useState(nomes[0] ?? "");
  const [brief, setBrief] = useState("");

  const run = mission.squad;

  if (run) {
    const ultima = run.faseAtual >= run.fases.length - 1;
    return (
      <div className="brief">
        <span className="phases">
          {run.fases.map((f, i) => (
            <span
              key={f.nome}
              className={`phase${i === run.faseAtual ? " atual" : ""}${
                i < run.faseAtual ? " feita" : ""
              }`}
              title={f.agentes.join(", ")}
            >
              <span className="n">{i + 1}</span>
              {f.nome}
            </span>
          ))}
        </span>
        <span className="brief-texto" title={run.brief}>
          {run.brief}
        </span>
        <button className="btn" onClick={onAvancar} disabled={busy || ultima}>
          {ultima ? "Última fase" : "Liberar próxima fase"}
        </button>
      </div>
    );
  }

  return (
    <div className="brief">
      <select className="picker" value={squad} onChange={(e) => setSquad(e.target.value)}>
        {nomes.map((n) => (
          <option key={n} value={n}>
            {squads[n]!.label}
          </option>
        ))}
      </select>
      <input
        className="brief-input"
        placeholder={squads[squad]?.descricao ?? "O que o time precisa fazer?"}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && brief.trim()) onRun(squad, brief.trim());
        }}
      />
      <Microfone
        estado={voz}
        ativo={vozAqui}
        compacto
        onClick={() =>
          onDitar((texto) => setBrief((antes) => (antes ? `${antes} ${texto}` : texto)))
        }
      />
      <button
        className="btn"
        onClick={() => onRun(squad, brief.trim())}
        disabled={busy || !brief.trim()}
      >
        Lançar time
      </button>
    </div>
  );
}
