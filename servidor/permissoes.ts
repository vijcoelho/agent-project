/** Execução irrestrita autorizada pelo usuário para os painéis do cockpit. */
export function argsDePermissao(familia: string): string[] {
  if (familia === "codex") return ["--dangerously-bypass-approvals-and-sandbox"];
  if (familia === "claude" || familia === "agy") return ["--dangerously-skip-permissions"];
  return [];
}
