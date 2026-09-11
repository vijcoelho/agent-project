import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { onOutput, send } from "./socket.ts";
import type { AgentSpec, PaneState, Usage } from "./api.ts";
import { Icon } from "./Icon.tsx";
import { Mascote } from "./Mascote.tsx";

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
  visible = true,
  label,
  selecionado = false,
}: {
  pane: PaneState;
  spec: AgentSpec | undefined;
  usage: Usage | undefined;
  onClose: () => void;
  visible?: boolean;
  label?: string;
  selecionado?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitter = useRef<FitAddon | null>(null);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        background: "#141414",
        foreground: "#e5e5e5",
        cursor: pane.cor,
        selectionBackground: "#ffffff30",
      },
    });
    const fit = new FitAddon();
    terminal.current = term;
    fitter.current = fit;
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
      if (area.clientHeight > 0 && area.clientWidth > 0) fit.fit();
    });
    observer.observe(area);
    if (area.clientHeight > 0 && area.clientWidth > 0) fit.fit();

    return () => {
      observer.disconnect();
      offOutput();
      term.dispose();
      terminal.current = null;
      fitter.current = null;
    };
  }, [pane.paneId]);

  useEffect(() => {
    if (terminal.current) terminal.current.options.theme = {
      background: "#141414", foreground: "#e5e5e5", cursor: pane.cor, selectionBackground: "#ffffff30",
    };
  }, [pane.cor]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      if (host.current && host.current.clientWidth > 0 && host.current.clientHeight > 0) {
        fitter.current?.fit();
        if (selecionado) terminal.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, selecionado]);

  const parado = pane.status === "idle";

  return (
    <section className={`pane${selecionado ? " selecionado" : ""}`} hidden={!visible} data-pane-id={pane.paneId} aria-label={`Terminal de ${label ?? spec?.label ?? pane.label}`} style={{ ["--pane" as string]: pane.cor }}>
      {/* Uma linha só. O que é detalhe vive no title; o cabeçalho carrega o
          que se lê de relance com doze painéis abertos: quem, com quê,
          fazendo algo ou não, e quanto custou. */}
      <header className="pane-head">
        {/* O mascote diz o que a luz dizia — trabalhando ou parado — com a
            identidade do agente junto. */}
        <Mascote semente={pane.agent} cor={pane.cor} estado={pane.status} tamanho={24} />
        <span className="who" title={`${spec?.label ?? pane.label} · ${pane.cli}`}>
          {label ?? spec?.label ?? pane.label}
        </span>
        <span className="pane-state">{pane.status === "dead" ? "Encerrado" : parado ? "Sem atividade recente" : "Em atividade"}</span>
        <span className="spacer" />
        <details className="pane-details">
          <summary>Detalhes <Icon name="chevron" size={14} /></summary>
          <div className="pane-details-content">
        {(pane.model ?? spec?.model) && (
          <span className="model" title={pane.tipo ? `tarefa: ${pane.tipo}` : "modelo do catálogo"}>
            {pane.model ?? spec?.model}
            {pane.effort ? `·${pane.effort}` : ""}
          </span>
        )}
        <Spark atividade={pane.atividade} />
        {usage && usage.turnos > 0 ? (
          <span className="meter" title={`${compacto(usage.in + usage.cacheWrite + usage.cacheRead)} entrada · ${compacto(usage.out)} saída · ${usage.turnos} turnos em ${usage.model ?? "—"}`}>
            ${usage.custo.toFixed(2)}
          </span>
        ) : (
          <span className="meter" title="tempo desde que o painel abriu">
            {desdeQuando(Date.now() - pane.iniciadoEm)}
          </span>
        )}
        <span className="dica">{pane.cli} · {pane.tipo || "Tarefa padrão"}</span>
        <button className="btn perigo" onClick={onClose}>Encerrar agente</button>
          </div>
        </details>
      </header>
      <div className="pane-term" ref={host} />
    </section>
  );
}
