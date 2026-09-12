import assert from "node:assert/strict";
import { argsDePermissao } from "../servidor/permissoes.ts";
import { familiaDo } from "../servidor/pty.ts";

for (const cli of ["codex", "openrouter"]) {
  assert.deepEqual(argsDePermissao(familiaDo(cli)), ["--dangerously-bypass-approvals-and-sandbox"]);
}
for (const cli of ["claude", "agy"]) {
  assert.deepEqual(argsDePermissao(familiaDo(cli)), ["--dangerously-skip-permissions"]);
}
assert.deepEqual(argsDePermissao("bash"), []);
console.log("PASS: permissões de execução para todas as famílias e a ponte Codex.");
