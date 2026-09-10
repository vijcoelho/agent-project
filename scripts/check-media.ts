// Verifica a camada de media sem gastar crédito nem chamar provedor nenhum.
// Uso: node scripts/check-media.ts
import assert from "node:assert/strict";
import { acharUrl, listarMedia } from "../servidor/media.ts";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(cond ? "  ok  " : " FALHA", msg);
  if (!cond) falhas++;
};

// ---- extração da URL de resultado do higgsfield ----
// O CLI devolve o objeto do job com --wait --json, mas a forma varia por
// modelo; e sem --json ele imprime a URL em texto. Os dois têm que servir.
const casos: [string, string, string | null][] = [
  [
    "array de jobs com results",
    JSON.stringify([{ id: "j1", status: "completed", results: [{ url: "https://cdn.hf.ai/out/abc.png" }] }]),
    "https://cdn.hf.ai/out/abc.png",
  ],
  [
    "objeto único",
    JSON.stringify({ id: "j1", output: { url: "https://cdn.hf.ai/v/xyz.mp4" } }),
    "https://cdn.hf.ai/v/xyz.mp4",
  ],
  [
    // A referência de entrada também é uma URL: o resultado é o último.
    "entrada e saída juntas",
    JSON.stringify([{ params: { image: "https://cdn.hf.ai/in/ref.png" }, results: [{ url: "https://cdn.hf.ai/out/final.png" }] }]),
    "https://cdn.hf.ai/out/final.png",
  ],
  ["texto puro", "Job completed.\nResult: https://cdn.hf.ai/out/plain.png", "https://cdn.hf.ai/out/plain.png"],
  ["texto com pontuação", "Done (https://cdn.hf.ai/out/paren.mp4).", "https://cdn.hf.ai/out/paren.mp4"],
  ["job que falhou", JSON.stringify([{ id: "j1", status: "failed" }]), null],
];
for (const [nome, entrada, esperado] of casos) {
  ok(acharUrl(entrada) === esperado, `URL de resultado — ${nome}`);
}

// ---- catálogo de provedores ----
const provedores = listarMedia();
const porId = new Map(provedores.map((p) => [p.id, p]));

ok(provedores.length > 0, `${provedores.length} provedores cadastrados`);
ok(
  provedores[0]!.pagamento === "assinatura" || provedores[0]!.pronto,
  "o de assinatura vem primeiro enquanto ninguém está pronto",
);
ok(porId.has("higgsfield"), "higgsfield está no catálogo");

const hf = porId.get("higgsfield")!;
ok(hf.pagamento === "assinatura", "higgsfield cobra da assinatura, não de chave");
ok(hf.via === "cli", "higgsfield é CLI local");
ok(hf.instalavel, "o cockpit sabe instalar o higgsfield");
for (const tipo of ["image", "video", "audio"]) {
  ok(!!hf.modeloPorTipo[tipo], `higgsfield tem modelo padrão para ${tipo}: ${hf.modeloPorTipo[tipo]}`);
  ok(hf.faz.includes(tipo), `higgsfield faz ${tipo}`);
}

// Todo provedor precisa dizer o que falta, senão você fica sem saber o passo.
for (const p of provedores) {
  ok(p.pronto || !!p.falta, `${p.id} explica o que falta`);
}

// Nenhuma chave pode vazar pela listagem.
ok(!JSON.stringify(provedores).includes("sk-"), "nenhuma chave aparece na listagem");

console.log(falhas === 0 ? "\nPASS: media" : `\nFALHOU: ${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
