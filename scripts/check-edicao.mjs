// As três correções: reconexão, edição pendente, skills na delegação.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);

const root = resolve("web/dist");
const server = createServer(async (req, res) => {
  try {
    const file = resolve(root, "." + (req.url === "/" ? "/index.html" : req.url));
    if (!file.startsWith(root)) throw Error("path");
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html" })[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((d) => server.listen(0, "127.0.0.1", d));

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));
let falhas = 0;
const ok = (c, m) => { console.log(c ? "  ok  " : " FALHA", m); if (!c) falhas++; };

let salvos = [];
const usage = { in: 0, out: 0, cacheWrite: 0, cacheRead: 0, custo: 0, turnos: 0, model: null };
const projects = [{ id: "p1", nome: "Meu projeto", root: "C:/x", git: true }];
const missions = [{ id: "m1", projectId: "p1", nome: "teste", objetivo: "o", branch: "b", git: { dirty: 0, head: "a" }, usage, panes: [], squad: null }];

await page.route("**/api/**", (route) => {
  const p = new URL(route.request().url()).pathname;
  if (p === "/api/file" && route.request().method() === "POST") {
    salvos.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  }
  const data = p === "/api/config" ? { agents: { maestro: { label: "Maestro", cli: "claude", cor: "#4195ff" } }, squads: {}, tarefas: {}, providers: [], receitas: {} }
    : p === "/api/projects" ? { projects } : p === "/api/missions" ? { missions }
    : p === "/api/panes" ? { panes: [] } : p === "/api/file" ? { content: "conteudo original" }
    : p === "/api/tree" ? { tree: [{ nome: "a.ts", caminho: "a.ts", dir: false }, { nome: "b.ts", caminho: "b.ts", dir: false }] }
    : p === "/api/providers" ? { providers: [], presets: [] } : [];
  return route.fulfill({ json: data });
});

// --- reconexão ---
let sockets = 0;
let ultimo;
await page.routeWebSocket("**/ws", (ws) => { sockets++; ultimo = ws; });
const url = `http://127.0.0.1:${server.address().port}`;
await page.goto(url);
await page.waitForTimeout(800);
ok(sockets === 1, `uma conexão ao abrir (${sockets})`);

ultimo.close();
await page.waitForTimeout(2500);
ok(sockets >= 2, `reconectou sozinho sem recarregar a página (${sockets} conexões)`);
const estado = await page.locator(".connection").getAttribute("class");
ok(/connected/.test(estado ?? ""), `voltou a "conectado" (${estado})`);

// --- edição pendente ---
// A árvore mora na página Arquivos da lateral, irmã da página Missões.
await page.getByRole("tablist", { name: "Páginas da lateral" }).getByRole("tab", { name: "Arquivos", exact: true }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "a.ts", exact: true }).click();
await page.locator(".editor-host").waitFor();
await page.locator(".editor-host .cm-content").click();
await page.keyboard.type("mudanca nao salva");
await page.waitForTimeout(400);

await page.getByRole("button", { name: "b.ts", exact: true }).click();
await page.waitForTimeout(500);
ok(await page.getByRole("dialog", { name: "Edição não salva" }).isVisible(), "trocar de arquivo pergunta antes de descartar");

await page.getByRole("button", { name: "Ficar aqui", exact: true }).click();
await page.waitForTimeout(400);
ok((await page.locator(".editor-head").textContent()).includes("a.ts"), "'Ficar aqui' mantém o arquivo aberto");

await page.getByRole("button", { name: "b.ts", exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Salvar e continuar", exact: true }).click();
await page.waitForTimeout(800);
ok(salvos.length === 1, `'Salvar e continuar' gravou antes de trocar (${salvos.length} salvamento)`);
ok(salvos[0]?.content?.includes("mudanca nao salva"), "gravou o texto editado, não o original");
ok((await page.locator(".editor-head").textContent()).includes("b.ts"), "e seguiu para o outro arquivo");

// descartar de verdade descarta
await page.locator(".editor-host .cm-content").click();
await page.keyboard.type("outra mudanca");
await page.waitForTimeout(300);
await page.getByRole("button", { name: "a.ts", exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Descartar", exact: true }).click();
await page.waitForTimeout(600);
ok(salvos.length === 1, "'Descartar' não grava nada");
ok((await page.locator(".editor-head").textContent()).includes("a.ts"), "e troca mesmo assim");

console.log("\nerros de página:", erros.length ? erros : "nenhum");
if (erros.length) falhas++;
await browser.close();
server.close();
console.log(falhas === 0 ? "PASS" : `FALHOU: ${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
