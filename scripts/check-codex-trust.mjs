import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const codexHome = mkdtempSync(join(tmpdir(), "cockpit-codex-trust-"));
const project = join(tmpdir(), "Projeto Novo");
process.env.CODEX_HOME = codexHome;

try {
  const { confiar } = await import("../servidor/confianca.ts");
  confiar("codex", project);
  const config = readFileSync(join(codexHome, "config.toml"), "utf8");
  assert.match(config, /\[projects\.".*projeto novo"\]/i);
  assert.match(config, /trust_level = "trusted"/);
  console.log("PASS: uma pasta nova é registrada como confiável para o Codex.");
} finally {
  if (!codexHome.startsWith(tmpdir()) || !codexHome.includes("cockpit-codex-trust-")) throw new Error("limpeza insegura recusada");
  rmSync(codexHome, { recursive: true, force: true });
}
