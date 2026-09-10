import { readCodexQuota } from "../servidor/codex-quota.ts";
import { resolveCli } from "../servidor/pty.ts";
const command = resolveCli("codex", []);
const result = await readCodexQuota(command.file, command.args);
console.log(JSON.stringify(result));
