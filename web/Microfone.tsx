import type { EstadoVoz } from "./voz.ts";

/**
 * Um botão de ditado. Existe em mais de um lugar — no cabeçalho, mirando o
 * painel, e dentro do briefing, mirando o campo de texto — mas só um pode
 * estar gravando por vez, então o estado vive lá em cima.
 */
export function Microfone({
  estado,
  ativo,
  compacto,
  onClick,
}: {
  estado: EstadoVoz;
  /** true quando é este botão que está gravando. */
  ativo: boolean;
  compacto?: boolean;
  onClick: () => void;
}) {
  const ocupado = estado !== "ocioso";
  const rotulo = ativo
    ? estado === "transcrevendo"
      ? "transcrevendo…"
      : "ouvindo — clique para parar"
    : "Ditar";

  return (
    <button
      className={`btn mic${ativo ? " gravando" : ""}`}
      onClick={onClick}
      disabled={ocupado && !ativo}
      title={compacto ? rotulo : "O áudio não sai da sua máquina."}
    >
      {ativo && estado === "ouvindo" ? "◉" : "🎙"}
      {!compacto && ` ${rotulo}`}
    </button>
  );
}
