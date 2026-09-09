import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { ROOT } from "./config.ts";

const run = promisify(execFile);

export const WORKTREES_DIR = resolve(ROOT, "..", ".cockpit-worktrees");

async function git(args: string[], cwd = ROOT): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

/** git worktree add needs a real HEAD; a repo with no commits cannot branch. */
export async function assertCommittable(): Promise<void> {
  try {
    await git(["rev-parse", "HEAD"]);
  } catch {
    throw new Error(
      "o repositório ainda não tem nenhum commit — rode `git add -A && git commit -m init` na raiz antes de criar missões",
    );
  }
}

export async function addWorktree(nome: string): Promise<{ worktree: string; branch: string }> {
  const worktree = join(WORKTREES_DIR, nome);
  const branch = `cockpit/${nome}`;
  await git(["worktree", "add", worktree, "-b", branch]);
  return { worktree, branch };
}

export async function removeWorktree(worktree: string, branch: string): Promise<void> {
  await git(["worktree", "remove", "--force", worktree]).catch(() => {});
  await git(["worktree", "prune"]).catch(() => {});
  await git(["branch", "-D", branch]).catch(() => {});
}

export async function branchStatus(worktree: string): Promise<{ dirty: number; head: string }> {
  const [status, head] = await Promise.all([
    git(["status", "--porcelain"], worktree).catch(() => ""),
    git(["rev-parse", "--short", "HEAD"], worktree).catch(() => "—"),
  ]);
  return { dirty: status ? status.split("\n").length : 0, head };
}
