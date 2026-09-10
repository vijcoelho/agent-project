import { Router } from "express";
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

export const IGNORADOS = new Set(["node_modules", ".git", "dist", ".cockpit", ".next"]);

export type No = { nome: string; caminho: string; dir: boolean; filhos?: No[] };

/** Resolve contra a raiz e recusa qualquer caminho que escape dela. */
export function dentroDaRaiz(base: string, relativo: string): string {
  const alvo = resolve(base, relativo || ".");
  const rel = relative(base, alvo);
  if (rel.startsWith("..") || (rel !== "" && resolve(base, rel) !== alvo)) {
    throw new Error("caminho fora da raiz");
  }
  return alvo;
}

function arvore(dir: string, base: string): No[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !IGNORADOS.has(e.name))
    .sort((a, b) =>
      a.isDirectory() === b.isDirectory()
        ? a.name.localeCompare(b.name)
        : a.isDirectory()
          ? -1
          : 1,
    )
    .map((e) => {
      const caminho = join(dir, e.name);
      const rel = relative(base, caminho).split(sep).join("/");
      return e.isDirectory()
        ? { nome: e.name, caminho: rel, dir: true, filhos: arvore(caminho, base) }
        : { nome: e.name, caminho: rel, dir: false };
    });
}

/** `raizDe` resolve o escopo pedido: missão, projeto, ou nada. */
export function criarFsApi(
  raizDe: (missionId: string | null, projectId: string | null) => string | null,
): Router {
  const router = Router();

  const raiz = (q: Record<string, unknown>): string => {
    const base = raizDe(
      typeof q.missionId === "string" && q.missionId ? q.missionId : null,
      typeof q.projectId === "string" && q.projectId ? q.projectId : null,
    );
    if (!base) throw new Error("abra um projeto primeiro");
    return base;
  };

  router.get("/tree", (req, res) => {
    const base = raiz(req.query);
    res.json({ base, tree: existsSync(base) ? arvore(base, base) : [] });
  });

  router.get("/file", (req, res) => {
    const base = raiz(req.query);
    const alvo = dentroDaRaiz(base, String(req.query.path ?? ""));
    if (statSync(alvo).size > 2_000_000) {
      res.status(413).json({ error: "arquivo grande demais para o editor" });
      return;
    }
    res.json({ path: req.query.path, content: readFileSync(alvo, "utf8") });
  });

  router.post("/file", (req, res) => {
    const body = req.body as { path?: string; content?: string; missionId?: string; projectId?: string };
    const base = raiz(body as Record<string, unknown>);
    const alvo = dentroDaRaiz(base, String(body.path ?? ""));
    writeFileSync(alvo, String(body.content ?? ""), "utf8");
    res.json({ ok: true });
  });

  return router;
}
