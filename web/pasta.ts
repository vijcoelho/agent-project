import { escolherPasta as pelaApi } from "./api.ts";

/**
 * Escolher a pasta do projeto.
 *
 * Dentro do Cockpit.exe quem abre o diálogo é a janela nativa: assim ele nasce
 * com dono e fica modal, na frente. Pelo servidor ele nascia órfão e ia parar
 * atrás da aplicação — parecia que o clique não fazia nada.
 *
 * No navegador comum não existe essa ponte, então cai no servidor. O
 * showDirectoryPicker do navegador não serve: devolve um handle, não o caminho
 * absoluto que o servidor precisa.
 */

type PonteApp = {
  postMessage: (mensagem: string) => void;
  addEventListener: (tipo: "message", ouvinte: (e: { data: string }) => void) => void;
  removeEventListener: (tipo: "message", ouvinte: (e: { data: string }) => void) => void;
};

const ponte = (): PonteApp | null =>
  (globalThis as { chrome?: { webview?: PonteApp } }).chrome?.webview ?? null;

export const dentroDoApp = (): boolean => ponte() !== null;

export function escolherPasta(): Promise<{ caminho: string | null }> {
  const app = ponte();
  if (!app) return pelaApi();

  return new Promise((resolve) => {
    const ouvinte = (e: { data: string }) => {
      if (typeof e.data !== "string" || !e.data.startsWith("pasta:")) return;
      app.removeEventListener("message", ouvinte);
      resolve({ caminho: e.data.slice(6) || null });
    };
    app.addEventListener("message", ouvinte);
    app.postMessage("escolher-pasta");
  });
}
