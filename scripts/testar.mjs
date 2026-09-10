import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { argv, exit, platform } from "node:process";

/**
 * Roda a bateria inteira de uma vez.
 *
 * Antes disto os testes existiam mas ninguém sabia quais: era preciso ler a
 * pasta e lembrar quais precisavam de argumento. Um deles estava vermelho
 * havia tempo sem ninguém notar, porque nada rodava tudo junto.
 *
 * Os testes de navegador ficam de fora por padrão: eles precisam do Playwright
 * instalado, que não é dependência deste projeto. Passe o caminho e eles
 * entram na conta:
 *
 *   npm test -- <caminho-para-playwright-core/index.mjs>
 */

const BROWSER = new Set(["check-ui.mjs", "check-edicao.mjs"]);
const playwright = argv[2] ?? null;

const testes = readdirSync("scripts")
  .filter((n) => /^check-.*\.(ts|mjs)$/.test(n))
  .sort();

const npx = platform === "win32" ? "npx.cmd" : "npx";
const passos = [
  { nome: "tipos (tsc)", comando: npx, args: ["tsc", "--noEmit"] },
  { nome: "build (vite)", comando: npx, args: ["vite", "build", "--logLevel", "error"] },
  ...testes.map((n) => ({
    nome: n,
    comando: process.execPath,
    args: [`scripts/${n}`, ...(BROWSER.has(n) && playwright ? [playwright] : [])],
    pular: BROWSER.has(n) && !playwright ? "precisa do Playwright" : null,
  })),
];

let falhas = 0;
let pulados = 0;

for (const passo of passos) {
  if (passo.pular) {
    console.log(`PULADO  ${passo.nome} — ${passo.pular}`);
    pulados++;
    continue;
  }
  const comecou = Date.now();
  const r = spawnSync(passo.comando, passo.args, {
    encoding: "utf8",
    shell: platform === "win32" && passo.comando === npx,
    timeout: 5 * 60_000,
  });
  const seg = ((Date.now() - comecou) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`ok      ${passo.nome} (${seg}s)`);
    continue;
  }
  falhas++;
  console.log(`FALHOU  ${passo.nome} (${seg}s)`);
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  console.log(
    saida
      .split(/\r?\n/)
      .slice(-14)
      .map((l) => `        ${l}`)
      .join("\n"),
  );
}

const total = passos.length - pulados;
console.log(
  falhas === 0
    ? `\nPASS: ${total} verificações, nenhuma falha${pulados ? ` (${pulados} puladas)` : ""}.`
    : `\nFALHA: ${falhas} de ${total} verificações.`,
);
exit(falhas === 0 ? 0 : 1);
