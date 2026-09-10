import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { onOutput, send } from "./socket.ts";
import type { AgentSpec, PaneState, Usage } from "./api.ts";

const BARRAS = 40;

function compacto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/**
 * Volume de saída dos últimos 40 segundos. Escala logarítmica: rajadas de
 * milhares de bytes não achatam o resto da faixa.
 */
function Spark({ atividade }: { atividade: number[] }) {
  const janela = atividade.slice(-BARRAS);
  const pico = Math.max(...janela, 1);
  return (
    <span className="spark" aria-hidden>
      {janela.map((v, i) => (
        <i
          key={i}
          className={v === 0 ? "zero" : undefined}
          style={{ height: `${v === 0 ? 8 : 12 + 88 * (Math.log1p(v) / Math.log1p(pico))}%` }}
        />
      ))}
    </span>
  );
}

function desdeQuando(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  return `${Math.round(s / 3600)}h`;
}

export function Pane({
  pane,
  spec,
  usage,
  onClose,
}: {
  pane: PaneState;
  spec: AgentSpec | undefined;
  usage: Usage | undefined;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        background: "#060708",
        foreground: "#c9d3de",
        cursor: pane.cor,
        selectionBackground: "#00b4ff33",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // O elemento é guardado numa constante: durante a desmontagem o React
    // zera a ref, e o ResizeObserver ainda podia disparar uma vez depois
    // disso — era o "Cannot read properties of null" que aparecia ao fechar
    // um projeto com painéis abertos.
    const area = host.current!;
    term.open(area);

    term.onData((data) => send({ type: "input", paneId: pane.paneId, data }));
    term.onResize(({ cols, rows }) =>
      send({ type: "resize", paneId: pane.paneId, cols, rows }),
    );
    const offOutput = onOutput(pane.paneId, (data) => term.write(data));

    const observer = new ResizeObserver(() => {
      // Fora da árvore a altura é zero, e caber num espaço que não existe
      // deixa o xterm com dimensões inválidas na próxima montagem.
      if (area.clientHeight > 0) fit.fit();
    });
    observer.observe(area);
    fit.fit();

    return () => {
      observer.disconnect();
      offOutput();
      term.dispose();
    };
  }, [pane.paneId, pane.cor]);

  const parado = pane.status === "idle";

  return (
    <section className="pane" style={{ ["--pane" as string]: pane.cor }}>
      {/* Uma linha só. O que é detalhe vive no title; o cabeçalho carrega o
          que se lê de relance com doze painéis abertos: quem, com quê,
          fazendo algo ou não, e quanto custou. */}
      <header className="pane-head">
        <span
          className={`luz${parado ? " parada" : ""}`}
          title={parado ? "à sua espera" : "trabalhando"}
        />
        <span className="who" title={`${spec?.label ?? pane.label} · ${pane.cli}`}>
          {spec?.label ?? pane.label}
        </span>
        {(pane.model ?? spec?.model) && (
          <span className="model" title={pane.tipo ? `tarefa: ${pane.tipo}` : "modelo do catálogo"}>
            {pane.model ?? spec?.model}
            {pane.effort ? `·${pane.effort}` : ""}
          </span>
        )}
        <Spark atividade={pane.atividade} />
        <span className="spacer" />
        {usage && usage.turnos > 0 ? (
          <span className="meter" title={`${compacto(usage.in + usage.cacheWrite + usage.cacheRead)} entrada · ${compacto(usage.out)} saída · ${usage.turnos} turnos em ${usage.model ?? "—"}`}>
            ${usage.custo.toFixed(2)}
          </span>
        ) : (
          <span className="meter" title="tempo desde que o painel abriu">
            {desdeQuando(Date.now() - pane.iniciadoEm)}
          </span>
        )}
        <button className="icon-btn fechar" onClick={onClose} title="fechar painel">
          ✕
        </button>
      </header>
      <div className="pane-term" ref={host} />
    </section>
  );
}
