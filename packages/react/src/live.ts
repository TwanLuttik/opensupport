import type { StoredSession } from "./types.js";

/** How many times a dropped bubble socket tries again before the poll takes over. */
export const BUBBLE_RECONNECTS = 3;

export function widgetSocketUrl(serverUrl: string, session: StoredSession): string {
  const base = serverUrl.replace(/\/+$/, "").replace(/^http/i, "ws");
  const token = encodeURIComponent(session.visitorToken);
  return `${base}/api/widget/live?conversation=${encodeURIComponent(session.conversationId)}&token=${token}`;
}

export function deskSocketUrl(serverUrl = ""): string {
  if (typeof window === "undefined" && !serverUrl) return "";
  const base = (serverUrl || window.location.origin).replace(/\/+$/, "").replace(/^http/i, "ws");
  return `${base}/api/dashboard/live`;
}

/**
 * Opens one socket and calls back as it connects, drops, and retries.
 * `retries` is how many extra attempts follow the first failure. The bubble
 * passes a small number and then falls back to polling. The desk passes
 * Infinity and keeps trying.
 */
export function connectLive(options: {
  url: string;
  retries: number;
  onEvent: (event: unknown) => void;
  onStatus?: (status: "open" | "closed" | "failed") => void;
  /** The current socket, so the caller can send typing frames. */
  socketRef?: { current: WebSocket | null };
}): () => void {
  let stopped = false;
  let attempt = 0;
  let socket: WebSocket | null = null;
  let timer = 0;

  function open() {
    if (stopped) return;
    const next = new WebSocket(options.url);
    socket = next;
    if (options.socketRef) options.socketRef.current = next;
    next.addEventListener("open", () => {
      attempt = 0;
      options.onStatus?.("open");
    });
    next.addEventListener("message", (message) => {
      try {
        options.onEvent(JSON.parse(String(message.data)));
      } catch {
        /* Ignore a frame that is not one of our events. */
      }
    });
    next.addEventListener("close", () => {
      if (stopped || next !== socket) return;
      if (attempt >= options.retries) {
        options.onStatus?.("failed");
        return;
      }
      options.onStatus?.("closed");
      const wait = Math.min(8000, 500 * 2 ** attempt);
      attempt += 1;
      timer = window.setTimeout(open, wait);
    });
  }

  open();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    if (options.socketRef && options.socketRef.current === socket) options.socketRef.current = null;
    socket?.close();
  };
}

/** Sends a typing frame on the bubble socket. No-op until the socket is open. */
export function sendTyping(socket: WebSocket | null, typing: boolean): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "typing", typing }));
}
