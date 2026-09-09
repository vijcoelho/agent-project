import { Router } from "express";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { ROOT } from "./config.ts";

export const IGNORADOS = new Set(["node_modules", ".git", "dist", ".cockpit"]);

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
  const entradas = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !IGNORADOS.has(e.name))
    .sort((a, b) =>
      a.isDirectory() === b.isDirectory()
        ? a.name.localeCompare(b.name)
        : a.isDirectory()
          ? -1
          : 1,
    );

  return entradas.map((e) => {
    const caminho = join(dir, e.name);
    const rel = relative(base, caminho).split(sep).join("/");
    return e.isDirectory()
      ? { nome: e.name, caminho: rel, dir: true, filhos: arvore(caminho, base) }
      : { nome: e.name, caminho: rel, dir: false };
  });
}

export function criarFsApi(raizDe: (missionId: string | null) => string): Router {
  const router = Router();

  const raiz = (req: { query: Record<string, unknown> }) =>
    raizDe(typeof req.query.missionId === "string" ? req.query.missionId : null);

  router.get("/tree", (req, res) => {
    const base = raiz(req);
    res.json({ base, tree: arvore(base, base) });
  });

  router.get("/file", (req, res) => {
    const base = raiz(req);
    const alvo = dentroDaRaiz(base, String(req.query.path ?? ""));
    const info = statSync(alvo);
    if (info.size > 2_000_000) {
      res.status(413).json({ error: "arquivo grande demais para o editor" });
      return;
    }
    res.json({ path: req.query.path, content: readFileSync(alvo, "utf8") });
  });

  router.post("/file", (req, res) => {
    const body = req.body as { path?: string; content?: string; missionId?: string | null };
    const base = raizDe(body.missionId ?? null);
    const alvo = dentroDaRaiz(base, String(body.path ?? ""));
    writeFileSync(alvo, String(body.content ?? ""), "utf8");
    res.json({ ok: true });
  });

  return router;
}
