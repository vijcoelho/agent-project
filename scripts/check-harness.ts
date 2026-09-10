import assert from "node:assert/strict";
import { resolverHarness } from "../servidor/harness.ts";
import { config } from "../servidor/config.ts";

// Regression: the Visual task must never turn Codex specialists into Gemini.
for (const agent of ["luna", "terra", "astra"]) {
  const result = resolverHarness({ agent, tipo: "visual" });
  assert.equal(result.cli, "codex");
  assert.equal(result.model, config.agents[agent]!.model);
  assert.equal(result.effort, config.agents[agent]!.effort);
  assert.equal(result.origem.cli, "catálogo");
}
assert.equal(resolverHarness({ agent: "artista", tipo: "visual" }).cli, "agy");
assert.equal(resolverHarness({ agent: "builder", tipo: "visual" }).cli, "claude");
assert.equal(resolverHarness({ agent: "astra", tipo: "implementar" }).model, "gpt-5.6-terra");
assert.equal(resolverHarness({ agent: "astra", tipo: "visual", invoke: { cli: "agy" } }).cli, "agy");
assert.equal(resolverHarness({ agent: "astra", tipo: "visual", invoke: { cli: "agy" }, roster: { cli: "codex" } }).cli, "codex");
assert.throws(() => resolverHarness({ agent: "inexistente" }));
console.log("PASS: Visual preserves agent providers and defaults; compatible task models and explicit overrides still work.");
