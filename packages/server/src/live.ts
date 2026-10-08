import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { Conversation, Message, PageVisit } from "./types.js";

export type LiveEvent =
  | { type: "message"; conversation: Conversation; message: Message }
  | { type: "conversation"; conversation: Conversation }
  | { type: "pages"; conversationId: string; pages: PageVisit[] }
  | { type: "read"; conversationId: string; role: "visitor" | "agent"; readAt: string }
  | { type: "typing"; conversationId: string; role: "visitor" | "agent"; name?: string; typing: boolean };

interface Client {
  socket: WebSocket;
  kind: "visitor" | "desk";
  conversationId?: string;
}

/** In-memory fan-out. One Node process owns every connection, so no broker is needed. */
export class LiveHub {
  private readonly clients = new Set<Client>();

  add(socket: WebSocket, kind: Client["kind"], conversationId?: string): () => void {
    const client: Client = { socket, kind, conversationId };
    this.clients.add(client);
    const stopTyping = () => {
      if (kind === "visitor" && conversationId) {
        this.publish({ type: "typing", conversationId, role: "visitor", typing: false });
      }
      if (kind === "desk" && ![...this.clients].some((other) => other.kind === "desk" && other !== client)) {
        for (const other of this.clients) {
          if (other.kind !== "visitor" || !other.conversationId) continue;
          this.publish({ type: "typing", conversationId: other.conversationId, role: "agent", typing: false });
        }
      }
    };
    socket.on("close", stopTyping);
    return () => {
      socket.off("close", stopTyping);
      this.clients.delete(client);
    };
  }

  publish(event: LiveEvent): void {
    const payload = JSON.stringify(event);
    const conversationId = "conversation" in event ? event.conversation.id : event.conversationId;
    for (const client of this.clients) {
      if (client.kind === "visitor" && client.conversationId !== conversationId) continue;
      if (event.type === "typing" && client.kind === event.role) continue;
      try {
        client.socket.send(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

const handshake = new WebSocketServer({ noServer: true });

/** Completes the upgrade with the `ws` implementation, which frames messages correctly. */
export function acceptWebSocket(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    handshake.handleUpgrade(req, socket, head, (accepted) => resolve(accepted));
    socket.once("error", reject);
  });
}
