import type { PaneState, Usage } from "./api.ts";

export type ServerMessage =
  | { type: "panes"; panes: PaneState[] }
  | { type: "spawned"; pane: PaneState }
  | { type: "output"; paneId: string; data: string }
  | { type: "exit"; paneId: string; code: number }
  | { type: "pulse"; pulsos: { paneId: string; status: PaneState["status"]; atividade: number[] }[] }
  | { type: "usage"; usos: { paneId: string; usage: Usage }[] }
  | { type: "fs-change"; path: string; base: string };

type OutputHandler = (data: string) => void;

const ws = new WebSocket(`ws://${location.host}/ws`);
const queue: string[] = [];
const outputs = new Map<string, OutputHandler>();
// A saída pode chegar antes do xterm do painel ter montado.
const buffered = new Map<string, string[]>();
const listeners = new Set<(msg: ServerMessage) => void>();

ws.addEventListener("open", () => {
  for (const raw of queue.splice(0)) ws.send(raw);
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data as string) as ServerMessage;
  if (msg.type === "output") {
    const handler = outputs.get(msg.paneId);
    if (handler) handler(msg.data);
    else {
      const buf = buffered.get(msg.paneId) ?? [];
      buf.push(msg.data);
      buffered.set(msg.paneId, buf);
    }
    return;
  }
  for (const listener of listeners) listener(msg);
});

export function send(msg: unknown): void {
  const raw = JSON.stringify(msg);
  if (ws.readyState === WebSocket.OPEN) ws.send(raw);
  else queue.push(raw);
}

export function onMessage(listener: (msg: ServerMessage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onOutput(paneId: string, handler: OutputHandler): () => void {
  outputs.set(paneId, handler);
  for (const data of buffered.get(paneId) ?? []) handler(data);
  buffered.delete(paneId);
  return () => outputs.delete(paneId);
}
