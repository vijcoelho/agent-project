import { useEffect, useState } from "react";
import { fetchCotas, type Cota } from "./api.ts";

/**
 * Redline: quanto resta de cada assinatura, no rodapé.
 *
 * Cada provedor conta diferente e a régua mostra isso em vez de fingir um
 * número só. Onde não há número, o estado é "?" — que é honesto e diferente
 * de "livre". Um painel que inventa cota é pior que painel nenhum: você
 * confia nele e leva o bloqueio no meio do trabalho.
 */

const ROTULO: Record<string, string> = { codex: "GPT", claude: "Claude", agy: "Gemini" };

function daqui(ms: number): string {
  const min = Math.round((ms - Date.now()) / 60_000);
  if (min <= 0) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${Math.round(h / 24)}d`;
}

export function Redline({ compact = false }: { compact?: boolean }) {
  const [cotas, setCotas] = useState<Cota[]>([]);

  useEffect(() => {
    const puxar = () => void fetchCotas().then((d) => setCotas(d.cotas ?? []), () => {});
    puxar();
    // A leitura do Codex sobe um processo; um minuto é o passo certo.
    const t = setInterval(puxar, 60_000);
    return () => clearInterval(t);
  }, []);

  if (cotas.length === 0) return null;

  return (
    <span className="redline" role="status" aria-label="Cota das assinaturas">
      {cotas.filter(c => !compact || c.estado === "bloqueado" || c.estado === "apertado").map((c) => {
        // A janela mais apertada é a que manda: é ela que te bloqueia.
        const pior = c.janelas.length
          ? c.janelas.reduce((a, b) => (a.usadoPct >= b.usadoPct ? a : b))
          : null;
        const titulo = [
          c.plano ? `plano ${c.plano}` : null,
          ...c.janelas.map(
            (j) =>
              `${j.rotulo}: ${100 - j.usadoPct}% livre${j.voltaEm ? ` · volta em ${daqui(j.voltaEm)}` : ""}`,
          ),
          c.detalhe,
          `fonte: ${c.fonte}`,
        ]
          .filter(Boolean)
          .join("\n");

        return (
          <span key={c.cli} className={`cota ${c.estado}`} title={titulo}>
            <i />
            {ROTULO[c.cli] ?? c.cli}
            <b>
              {pior ? `${100 - pior.usadoPct}%` : "?"}
            </b>
            {c.estado === "bloqueado" && pior?.voltaEm && (
              <em>{daqui(pior.voltaEm)}</em>
            )}
          </span>
        );
      })}
    </span>
  );
}
