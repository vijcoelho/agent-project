import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";

function linguagem(caminho: string): Extension[] {
  const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)) {
    return [javascript({ typescript: ext.startsWith("ts"), jsx: ext.endsWith("x") })];
  }
  if (ext === "json") return [json()];
  if (ext === "css") return [css()];
  if (ext === "html") return [html()];
  if (["md", "markdown"].includes(ext)) return [markdown()];
  return [];
}

export function Editor({
  caminho,
  conteudo,
  sujo,
  onChange,
  onSave,
  onClose,
}: {
  caminho: string;
  conteudo: string;
  sujo: boolean;
  onChange: (texto: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const salvar = useRef(onSave);
  salvar.current = onSave;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: conteudo,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              salvar.current();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        oneDark,
        EditorView.theme({
          "&": { height: "100%", fontSize: "12px", background: "#171e26" },
          ".cm-content": { fontFamily: '"Cascadia Mono", Consolas, monospace' },
          ".cm-gutters": {
            background: "#171e26",
            color: "#4a5561",
            border: "none",
            borderRight: "1px solid #1e262f",
          },
          ".cm-activeLine": { background: "#ffffff08" },
          ".cm-activeLineGutter": { background: "#ffffff08", color: "#9aa7b5" },
        }),
        ...linguagem(caminho),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Recria ao trocar de arquivo; recarga externa é tratada no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho]);

  // Recarga vinda do watcher: troca o documento sem destruir o editor.
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === conteudo) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: conteudo } });
  }, [conteudo]);

  return (
    <div className="editor">
      <div className="editor-head">
        <span className={`editor-path${sujo ? " sujo" : ""}`} title={caminho}>
          {caminho}
        </span>
        <button className="btn" onClick={onSave} disabled={!sujo}>
          {sujo ? "Salvar" : "Salvo"}
        </button>
        <button className="btn quiet" onClick={onClose} title="fechar editor">
          ✕
        </button>
      </div>
      <div className="editor-host" ref={host} />
    </div>
  );
}
