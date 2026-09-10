import assert from "node:assert/strict";
import { basename } from "node:path";
import { resolveCli } from "../servidor/pty.ts";

const command = resolveCli("codex", []);
assert.equal(
  basename(command.file).toLowerCase(),
  "codex.exe",
  `Codex voltou a passar por ${command.file}; no Windows isso corta prompts longos no limite do cmd.exe.`,
);
assert.equal(command.args[0], undefined);
console.log("PASS: o cockpit lança o binário nativo do Codex, sem o limite de prompt do cmd.exe.");
