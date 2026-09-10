import { useEffect, useState } from "react";
import { fetchConsumo, type Consumo as Dados } from "./api.ts";

function k(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

const curto = (dia: string) => dia.slice(8) + "/" + dia.slice(5, 7);

export function Consumo({ onFechar }: { onFechar: () => void }) {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setDados(null);
    fetchConsumo(dias).then(setDados, (e: Error) => setErro(e.message));
  }, [dias]);

  const pico = Math.max(1, ...(dados?.claude.porDia.map((d) => d.tokens) ?? [1]));

  return (
    <div className="consumo">
      <header className="consumo-head">
        <h2>Consumo</h2>
        <div className="periodos">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className={`periodo${dias === d ? " on" : ""}`}
              onClick={() => setDias(d)}
            >
              {d}d
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn quiet" onClick={onFechar} aria-label="Fechar consumo">
          ✕
        </button>
      </header>

      {erro && <p className="vazio-nota">{erro}</p>}
      {!dados && !erro && <p className="vazio-nota">lendo os arquivos de sessão…</p>}

      {dados && (
        <div className="consumo-corpo">
          <section className="bloco">
            <div className="bloco-head">
              <h3>Claude</h3>
              <span className="fonte">medido turno a turno</span>
            </div>

            <div className="numerao">
              <b>${dados.claude.total.custo.toFixed(2)}</b>
              <span>
                {k(
                  dados.claude.total.in +
                    dados.claude.total.out +
                    dados.claude.total.cacheWrite +
                    dados.claude.total.cacheRead,
                )}{" "}
                tokens · {dados.claude.total.turnos.toLocaleString("pt-BR")} turnos ·{" "}
                {dados.claude.sessoes} sessões
              </span>
            </div>

            {dados.claude.porDia.length > 0 && (
              <div className="barras" aria-hidden>
                {dados.claude.porDia.map((d) => (
                  <span
                    key={d.dia}
                    className="barra"
                    style={{ height: `${Math.max(3, (d.tokens / pico) * 100)}%` }}
                    title={`${curto(d.dia)} · ${k(d.tokens)} tokens · $${d.custo.toFixed(2)}`}
                  />
                ))}
              </div>
            )}
            {dados.claude.porDia.length > 1 && (
              <div className="eixo">
                <span>{curto(dados.claude.porDia[0]!.dia)}</span>
                <span>{curto(dados.claude.porDia[dados.claude.porDia.length - 1]!.dia)}</span>
              </div>
            )}

            <table className="tabela">
              <thead>
                <tr>
                  <th>modelo</th>
                  <th>entrada</th>
                  <th>saída</th>
                  <th>cache</th>
                  <th>turnos</th>
                  <th>custo</th>
                </tr>
              </thead>
              <tbody>
                {dados.claude.porModelo.map((m) => (
                  <tr key={m.model}>
                    <td className="modelo">{m.model}</td>
                    <td>{k(m.in)}</td>
                    <td>{k(m.out)}</td>
                    <td>{k(m.cacheWrite + m.cacheRead)}</td>
                    <td>{m.turnos.toLocaleString("pt-BR")}</td>
                    <td className="custo">${m.custo.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bloco">
            <div className="bloco-head">
              <h3>Gemini · Antigravity</h3>
              <span className="fonte">atividade, não tokens</span>
            </div>

            <div className="numerao">
              <b>{dados.agy.pedidos}</b>
              <span>
                pedidos no período · {dados.agy.conversas} conversas ·{" "}
                {dados.agy.ultima ? `última em ${curto(dados.agy.ultima)}` : "sem uso"}
              </span>
            </div>

            <p className="ressalva">
              A Antigravity não grava contagem de tokens no disco — os passos ficam em protobuf sem
              schema público. Dá para contar o que você pediu, não o que foi consumido. Preferi
              mostrar menos a inventar número.
            </p>
          </section>

          <p className="ressalva rodape">
            Os valores do Claude são preço de lista da API, calculados a partir dos tokens reais de
            cada turno. Na assinatura Pro ou Max o custo marginal é zero — leia como "quanto isso
            teria custado na API".
            {dados.claude.desde && ` Primeiro turno registrado em ${curto(dados.claude.desde)}.`}
          </p>
        </div>
      )}
    </div>
  );
}
