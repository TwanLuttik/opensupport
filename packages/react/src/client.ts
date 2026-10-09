import type { Attachment, PublicConfig, StoredSession, SupportConversation, SupportMessage } from "./types.js";

export interface WidgetClient {
  getConfig(): Promise<PublicConfig>;
  start(input: {
    visitorName?: string;
    visitorEmail?: string;
    identifier?: string;
    metadata?: Record<string, string>;
    fields?: Record<string, string>;
    topic?: string;
    offline?: boolean;
    message?: string;
    /** `ai` asks the configured model to answer. Omit it to wait for a person. */
    handler?: "human" | "ai";
  }): Promise<{
    conversation: SupportConversation;
    visitorToken: string;
    messages: SupportMessage[];
  }>;
  getThread(session: StoredSession, after?: string): Promise<{
    conversation: SupportConversation;
    messages: SupportMessage[];
  }>;
  send(session: StoredSession, body: string, attachmentIds?: string[], actionLabel?: string): Promise<SupportMessage>;
  /** Asks the configured model to answer the latest visitor message. */
  askAi(session: StoredSession): Promise<SupportMessage>;
  /** The visitor ends the thread. Later messages are rejected until a new conversation starts. */
  close(session: StoredSession): Promise<SupportConversation>;
  /** One vote per closed conversation. A comment is optional, and the visitor can skip. */
  rate(session: StoredSession, rating: "up" | "down" | "skipped", comment?: string): Promise<SupportConversation>;
  /** Tells the server which page the visitor is on. A new path closes the previous one. */
  reportPage(session: StoredSession, path: string): Promise<void>;
  /** Marks agent replies as read up to now. Returns the stored cursor. */
  markRead(session: StoredSession): Promise<string | null>;
  upload(
    session: StoredSession,
    file: { name: string; type: string; bytes: Blob | Uint8Array },
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Attachment>;
}

export function createClient(serverUrl: string, fetchImpl: typeof fetch = fetch): WidgetClient {
  const base = serverUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (!response.ok) {
      throw new WidgetRequestError(data.error || `Request failed (${response.status})`, response.status, data.code);
    }
    return data;
  }

  return {
    getConfig: () => request<PublicConfig>("/api/widget/config"),
    start: (input) =>
      request("/api/widget/conversations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    getThread: (session, after) => {
      const query = after ? `?after=${encodeURIComponent(after)}` : "";
      return request(`/api/widget/conversations/${session.conversationId}${query}`, {
        headers: { "x-visitor-token": session.visitorToken },
      });
    },
    send: async (session, body, attachmentIds, actionLabel) => {
      const data = await request<{ message: SupportMessage }>(
        `/api/widget/conversations/${session.conversationId}/messages`,
        {
          method: "POST",
          headers: { "x-visitor-token": session.visitorToken },
          body: JSON.stringify({
            body,
            ...(attachmentIds?.length ? { attachmentIds } : {}),
            ...(actionLabel ? { actionLabel } : {}),
          }),
        },
      );
      return data.message;
    },
    askAi: async (session) => {
      const data = await request<{ message: SupportMessage }>(
        `/api/widget/conversations/${session.conversationId}/ai`,
        {
          method: "POST",
          headers: { "x-visitor-token": session.visitorToken },
          body: "{}",
        },
      );
      return data.message;
    },
    close: async (session) => {
      const data = await request<{ conversation: SupportConversation }>(
        `/api/widget/conversations/${session.conversationId}`,
        {
          method: "PATCH",
          headers: { "x-visitor-token": session.visitorToken },
          body: JSON.stringify({ status: "closed" }),
        },
      );
      return data.conversation;
    },
    rate: async (session, rating, comment) => {
      const data = await request<{ conversation: SupportConversation }>(
        `/api/widget/conversations/${session.conversationId}/rating`,
        {
          method: "POST",
          headers: { "x-visitor-token": session.visitorToken },
          body: JSON.stringify({ rating, ...(comment?.trim() ? { comment: comment.trim() } : {}) }),
        },
      );
      return data.conversation;
    },
    reportPage: (session, path) =>
      request(`/api/widget/conversations/${session.conversationId}/pages`, {
        method: "POST",
        headers: { "x-visitor-token": session.visitorToken },
        body: JSON.stringify({ path }),
      }),
    markRead: async (session) => {
      const data = await request<{ readAt: string | null }>(
        `/api/widget/conversations/${session.conversationId}/read`,
        {
          method: "POST",
          headers: { "x-visitor-token": session.visitorToken },
          body: "{}",
        },
      );
      return data.readAt;
    },
    upload: (session, file, onProgress) =>
      uploadChunked(fetchImpl, base, {
        path: `/api/widget/conversations/${session.conversationId}/uploads`,
        headers: { "x-visitor-token": session.visitorToken },
        file,
        onProgress,
      }),
  };
}

/** Matches the server. A 50 MB file is ten requests of this size. */
export const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export async function uploadChunked(
  fetchImpl: typeof fetch,
  serverUrl: string,
  options: {
    path: string;
    headers?: Record<string, string>;
    file: { name: string; type: string; bytes: Blob | Uint8Array };
    onProgress?: (loaded: number, total: number) => void;
  },
): Promise<Attachment> {
  const base = serverUrl.replace(/\/+$/, "");
  const blob = options.file.bytes instanceof Blob ? options.file.bytes : new Blob([toBlobPart(options.file.bytes)]);
  if (blob.size > UPLOAD_MAX_BYTES) throw new Error("File is larger than 50 MB");
  if (blob.size === 0) throw new Error("File is empty");
  const headers = options.headers ?? {};
  const started = await uploadRequest<{ uploadId: string; chunkSize: number; chunkCount: number }>(fetchImpl, base, options.path, {
    method: "POST",
    headers: {
      ...headers,
      "x-filename": options.file.name,
      "x-file-type": options.file.type || "application/octet-stream",
      "x-file-size": String(blob.size),
    },
  });
  let loaded = 0;
  options.onProgress?.(0, blob.size);
  for (let index = 0; index < started.chunkCount; index += 1) {
    const start = index * started.chunkSize;
    const chunk = blob.slice(start, Math.min(start + started.chunkSize, blob.size));
    await uploadRequest(fetchImpl, base, options.path, {
      method: "PUT",
      headers: {
        ...headers,
        "content-type": "application/octet-stream",
        "x-upload-id": started.uploadId,
        "x-chunk-index": String(index),
      },
      body: chunk,
    });
    loaded += chunk.size;
    options.onProgress?.(loaded, blob.size);
  }
  const finished = await uploadRequest<{ attachment: Attachment }>(fetchImpl, base, options.path, {
    method: "POST",
    headers: { ...headers, "x-upload-id": started.uploadId },
  });
  return finished.attachment;
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function uploadRequest<T>(
  fetchImpl: typeof fetch,
  base: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetchImpl(`${base}${path}`, init);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Upload failed");
  return data;
}

/** The saved visitor token no longer matches a conversation on the server. */
export function isStaleSessionError(error: unknown): boolean {
  return error instanceof WidgetRequestError && error.status === 401 && error.code === "visitor_session_expired";
}

export class WidgetRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "WidgetRequestError";
    this.status = status;
    this.code = code;
  }
}

export function sessionStorageKey(serverUrl: string): string {
  return `open-support:${serverUrl.replace(/\/+$/, "")}`;
}

/** Reads the saved visitor session in the browser. Returns null during SSR. */
export function loadStoredSession(serverUrl: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    return readSession(window.localStorage, serverUrl);
  } catch {
    return null;
  }
}

export function readSession(storage: Pick<Storage, "getItem">, serverUrl: string): StoredSession | null {
  const raw = storage.getItem(sessionStorageKey(serverUrl));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.conversationId || !parsed.visitorToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(storage: Pick<Storage, "removeItem">, serverUrl: string): void {
  storage.removeItem(sessionStorageKey(serverUrl));
}

export function clearStoredSession(serverUrl: string): void {
  if (typeof window === "undefined") return;
  try {
    clearSession(window.localStorage, serverUrl);
  } catch {
    // Private mode and locked-down browsers can reject localStorage.
  }
}

export function writeSession(storage: Pick<Storage, "setItem">, serverUrl: string, session: StoredSession): void {
  storage.setItem(sessionStorageKey(serverUrl), JSON.stringify(session));
}

/** Persists a visitor session in the browser. No-op during SSR or when storage is blocked. */
export function saveStoredSession(serverUrl: string, session: StoredSession): void {
  if (typeof window === "undefined") return;
  try {
    writeSession(window.localStorage, serverUrl, session);
  } catch {
    // Private mode and locked-down browsers can reject localStorage.
  }
}
