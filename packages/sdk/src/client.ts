import type {
  AssignConversationInput,
  Conversation,
  ListConversationsOptions,
  ListMessagesOptions,
  Message,
  OpenSupportOptions,
  Page,
  SendMessageInput,
  UploadFileInput,
  VisitorProfile,
  Attachment,
} from "./types.js";

export class OpenSupportError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenSupportError";
    this.status = status;
  }
}

interface ConversationPage {
  conversations: Conversation[];
  nextCursor: string | null;
}

interface MessagePage {
  messages: Message[];
  nextCursor: string | null;
}

export class OpenSupport {
  readonly serverUrl: string;
  readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenSupportOptions) {
    this.serverUrl = options.serverUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** Conversations, newest activity first. */
  async listConversations(options: ListConversationsOptions = {}): Promise<Page<Conversation>> {
    const query = new URLSearchParams();
    if (options.status) query.set("status", options.status);
    if (options.identifier) query.set("identifier", options.identifier);
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.cursor) query.set("cursor", options.cursor);
    const page = await this.request<ConversationPage>("GET", `/api/conversations${suffix(query)}`);
    return { items: page.conversations, nextCursor: page.nextCursor };
  }

  /** Messages in one conversation, oldest first. */
  async listMessages(conversationId: string, options: ListMessagesOptions = {}): Promise<Page<Message>> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.cursor) query.set("cursor", options.cursor);
    if (options.after) query.set("after", options.after);
    const page = await this.request<MessagePage>(
      "GET",
      `/api/conversations/${encodeURIComponent(conversationId)}/messages${suffix(query)}`,
    );
    return { items: page.messages, nextCursor: page.nextCursor };
  }

  /** The person behind an identifier, including every conversation they started. */
  async getVisitor(identifier: string): Promise<VisitorProfile> {
    const result = await this.request<{ visitor: VisitorProfile }>(
      "GET",
      `/api/visitors/${encodeURIComponent(identifier)}`,
    );
    return result.visitor;
  }

  /** Claim a ticket. The visitor sees "<name> joined the conversation". */
  async assignConversation(conversationId: string, input: AssignConversationInput = {}): Promise<Conversation> {
    const result = await this.request<{ conversation: { messages?: Message[] } & Conversation }>(
      "POST",
      `/api/conversations/${encodeURIComponent(conversationId)}/assign`,
      input.agentName ? { agentName: input.agentName } : {},
    );
    const { messages: _messages, ...conversation } = result.conversation;
    return conversation;
  }

  /** Post an agent reply. The visitor sees it on their next poll. */
  async sendMessage(conversationId: string, input: SendMessageInput): Promise<Message> {
    const body = {
      body: input.body,
      ...(input.agentName ? { agentName: input.agentName } : {}),
      ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
    };
    const result = await this.request<{ message: Message }>(
      "POST",
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      body,
    );
    return result.message;
  }

  /**
   * Uploads one file in 5 MB chunks and returns an attachment id.
   * Pass that id to `sendMessage` to attach it. Files can be up to 50 MB.
   */
  async uploadFile(conversationId: string, file: UploadFileInput): Promise<Attachment> {
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    if (bytes.byteLength === 0) throw new OpenSupportError(400, "File is empty");
    if (bytes.byteLength > UPLOAD_MAX_BYTES) throw new OpenSupportError(413, "File is larger than 50 MB");
    const path = `/api/conversations/${encodeURIComponent(conversationId)}/uploads`;
    const started = await this.request<{ uploadId: string; chunkSize: number; chunkCount: number }>("POST", path, undefined, {
      "x-filename": file.name,
      "x-file-type": file.type || "application/octet-stream",
      "x-file-size": String(bytes.byteLength),
    });
    const chunkSize = started.chunkSize || UPLOAD_CHUNK_BYTES;
    for (let index = 0; index < started.chunkCount; index += 1) {
      const start = index * chunkSize;
      const chunk = bytes.subarray(start, Math.min(start + chunkSize, bytes.byteLength));
      await this.request("PUT", path, chunk, {
        "content-type": "application/octet-stream",
        "x-upload-id": started.uploadId,
        "x-chunk-index": String(index),
      });
    }
    const finished = await this.request<{ attachment: Attachment }>("POST", path, undefined, {
      "x-upload-id": started.uploadId,
    });
    return finished.attachment;
  }

  /** Closes the ticket. The visitor can no longer write in it. */
  async closeConversation(conversationId: string): Promise<Conversation> {
    const result = await this.request<{ conversation: Conversation }>(
      "PATCH",
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      { status: "closed" },
    );
    return result.conversation;
  }

  private async request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const binary = body instanceof Uint8Array;
    const response = await this.fetchImpl(`${this.serverUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(binary || body === undefined ? {} : { "content-type": "application/json" }),
        ...extraHeaders,
      },
      body: binary ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as { error?: string }) : {};
    if (!response.ok) {
      throw new OpenSupportError(response.status, data.error || response.statusText || "Request failed");
    }
    return data as T;
  }
}

const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

function suffix(query: URLSearchParams): string {
  const value = query.toString();
  return value ? `?${value}` : "";
}
