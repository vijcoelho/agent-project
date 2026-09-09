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
        background: "#171e26",
        foreground: "#c8d2dd",
        cursor: pane.cor,
        selectionBackground: "#31404f",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);

    term.onData((data) => send({ type: "input", paneId: pane.paneId, data }));
    term.onResize(({ cols, rows }) =>
      send({ type: "resize", paneId: pane.paneId, cols, rows }),
    );
    const offOutput = onOutput(pane.paneId, (data) => term.write(data));

    const observer = new ResizeObserver(() => {
      if (host.current!.clientHeight > 0) fit.fit();
    });
    observer.observe(host.current!);
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
      <header className="pane-head">
        <span className="who">{spec?.label ?? pane.label}</span>
        {spec?.model && <span className="model">{spec.model}</span>}
        <Spark atividade={pane.atividade} />
        {parado && <span className="parado">à sua espera</span>}
        {usage && usage.turnos > 0 && (
          <span className="meter" title={`${usage.turnos} turnos em ${usage.model ?? "—"}`}>
            <span>{compacto(usage.in + usage.cacheWrite + usage.cacheRead)}↓</span>
            <span>{compacto(usage.out)}↑</span>
            <span className="custo">${usage.custo.toFixed(2)}</span>
          </span>
        )}
        {!usage?.turnos && (
          <span className="meter">{desdeQuando(Date.now() - pane.iniciadoEm)}</span>
        )}
        <button className="btn quiet" onClick={onClose} title="fechar painel">
          ✕
        </button>
      </header>
      <div className="pane-term" ref={host} />
    </section>
  );
}
