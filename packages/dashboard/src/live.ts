import type { Conversation, Message, PageVisit } from "./types.js";

export type DeskEvent =
  | { type: "message"; conversation: Conversation; message: Message }
  | { type: "conversation"; conversation: Conversation }
  | { type: "pages"; conversationId: string; pages: PageVisit[] }
  | { type: "read"; conversationId: string; role: "visitor" | "agent"; readAt: string }
  | { type: "typing"; conversationId: string; role: "visitor" | "agent"; name?: string; typing: boolean };

export function deskSocketUrl(): string {
  const base = window.location.origin.replace(/^http/i, "ws");
  return `${base}/api/dashboard/live`;
}

/** Stays connected. A drop retries forever, because the desk has no poll fallback. */
export function connectDesk(onEvent: (event: DeskEvent) => void, socketRef?: { current: WebSocket | null }): () => void {
  let stopped = false;
  let attempt = 0;
  let socket: WebSocket | null = null;
  let timer = 0;

  function open() {
    if (stopped) return;
    const next = new WebSocket(deskSocketUrl());
    socket = next;
    if (socketRef) socketRef.current = next;
    next.addEventListener("open", () => {
      attempt = 0;
    });
    next.addEventListener("message", (message) => {
      try {
        onEvent(JSON.parse(String(message.data)) as DeskEvent);
      } catch {
        /* Ignore a frame that is not a desk event. */
      }
    });
    next.addEventListener("close", () => {
      if (stopped || next !== socket) return;
      const wait = Math.min(8000, 400 * 2 ** attempt);
      attempt += 1;
      timer = window.setTimeout(open, wait);
    });
  }

  open();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    if (socketRef && socketRef.current === socket) socketRef.current = null;
    socket?.close();
  };
}

/** Tells the visitor that this agent is composing in one conversation. */
export function sendDeskTyping(socket: WebSocket | null, conversationId: string, typing: boolean): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "typing", conversationId, typing }));
}
