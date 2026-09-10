import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./style.css";
import { App } from "./App.tsx";

/**
 * Um erro de render derrubava a tela inteira para o preto, sem uma palavra —
 * e a causa mais comum é banal: a página está uma versão à frente do servidor
 * que a serve, e um campo novo chega vazio. Preto não se depura; a mensagem e
 * o "recarregar" sim.
 */
class Rede extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="tombo">
        <h1>A tela quebrou</h1>
        <p className="dica">
          Se o cockpit foi atualizado com o servidor rodando, reinicie o servidor: a página nova
          espera dados que o servidor antigo não manda.
        </p>
        <pre>{this.state.erro.message}</pre>
        <button className="btn solid" onClick={() => location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <Rede>
    <App />
  </Rede>,
);
