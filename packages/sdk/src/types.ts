export type AuthorRole = "visitor" | "agent" | "system";
export type ConversationStatus = "open" | "closed";

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: AuthorRole;
  body: string;
  attachments: Attachment[];
  createdAt: string;
  agentName?: string;
}

export interface Conversation {
  id: string;
  visitorId: string;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  /** Stable id from the embedding app. Null when the visitor was anonymous. */
  identifier: string | null;
  /** Name of the agent who last replied. Null until someone handles the thread. */
  agentName: string | null;
  /** Account that claimed the ticket. Null until someone assigns it. */
  assigneeId: string | null;
  assigneeName: string | null;
  /** Profile photo of the agent who claimed the ticket. Null when they have none. */
  assigneeAvatarUrl: string | null;
  assignedAt: string | null;
  metadata: Record<string, string>;
  unreadForAgent: number;
  seq: number;
  rating: "up" | "down" | "skipped" | null;
  ratingComment: string | null;
  ratedAt: string | null;
}

export interface Page<T> {
  items: T[];
  /** Pass back as `cursor` to fetch the following page. `null` means this is the last page. */
  nextCursor: string | null;
}

export interface ListConversationsOptions {
  status?: ConversationStatus;
  /** Only conversations for this visitor identifier. */
  identifier?: string;
  /** Page size. The server caps this at 100. Defaults to 50. */
  limit?: number;
  /** Cursor returned by the previous page. */
  cursor?: string;
}

export interface VisitorProfile {
  identifier: string;
  name: string | null;
  email: string | null;
  metadata: Record<string, string>;
  conversationCount: number;
  openCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  conversations: Conversation[];
}

export interface ListMessagesOptions {
  /** Page size. The server caps this at 100. Omit it to receive the whole thread. */
  limit?: number;
  /** Cursor returned by the previous page. Pages run oldest to newest. */
  cursor?: string;
  /** Only messages created after this ISO timestamp. Used for polling. */
  after?: string;
}

export interface SendMessageInput {
  body: string;
  /** Name shown next to the reply. Defaults to nothing on the server. */
  agentName?: string;
  /** Ids returned by `uploadFile`. The file must belong to this conversation. */
  attachmentIds?: string[];
}

export interface UploadFileInput {
  name: string;
  type?: string;
  bytes: Uint8Array | ArrayBuffer;
}

export interface AssignConversationInput {
  /** Required when the caller is an API token rather than a signed-in agent. */
  agentName?: string;
}

export interface OpenSupportOptions {
  /** Origin of the Open Support server, with or without a trailing slash. */
  serverUrl: string;
  /** API token minted in the dashboard (`osb_live_…`). */
  token: string;
  /** Override `fetch`, mainly for tests. */
  fetch?: typeof fetch;
}
