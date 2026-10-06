export type AuthorRole = "visitor" | "agent" | "system";

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  role: AuthorRole;
  body: string;
  attachments: Attachment[];
  createdAt: string;
  agentName?: string;
}

export interface SupportConversation {
  id: string;
  status: "open" | "closed";
  visitorName: string | null;
  visitorEmail: string | null;
  /** Stable id from the embedding app, when one was passed. */
  identifier?: string | null;
  /** Name of the agent who last replied. Null until someone handles the thread. */
  agentName: string | null;
  /** Agent who claimed the ticket. Null while the visitor is still waiting. */
  assigneeId?: string | null;
  assigneeName?: string | null;
  /** Profile photo of the agent who claimed the ticket. */
  assigneeAvatarUrl?: string | null;
  assignedAt?: string | null;
  /** Set after the visitor rates a closed chat, or skips the question. */
  rating?: "up" | "down" | "skipped" | null;
  /** `handler` is `ai` when the visitor chose the model instead of a person. */
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type FormFieldType = "text" | "email" | "textarea" | "select";

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder: string;
  options: string[];
}

export interface QuickAction {
  id: string;
  label: string;
}

export interface PublicConfig {
  title: string;
  subtitle: string;
  accentColor: string;
  placeholder: string;
  greeting: string;
  /** When true, the bubble asks for `formFields` before opening a conversation. */
  formEnabled: boolean;
  formTitle: string;
  formSubmitLabel: string;
  formFields: FormField[];
  /** Shown until an agent assigns the ticket. */
  waitingMessage: string;
  /** Start-screen buttons. Each one starts a conversation about that topic. */
  quickActions: QuickAction[];
  /** Business mark shown in the header. Null keeps the chat icon. */
  logoUrl?: string | null;
  /** Present when the server has a weekly schedule. `open` is false outside those hours. */
  officeHours?: {
    enabled: boolean;
    timezone: string;
    open: boolean;
    closedMessage: string;
    /** Monday through Sunday. A null side means the desk is closed that day. */
    days?: Array<{ open: number | null; close: number | null }>;
  };
  /** Present when an AI agent can answer. The key and knowledge stay on the server. */
  ai?: {
    enabled: boolean;
    agentName: string;
  };
  /** True when a person has the desk open and has not marked themselves away. */
  staffOnline?: boolean;
}

export interface SupportBubbleProps {
  /** Base URL of the self-hosted Open Support server, without a trailing slash. */
  serverUrl: string;
  /**
   * Stable id for this visitor, such as your own user id. Conversations started
   * with the same identifier are grouped together in the dashboard. Keep it
   * unique per person. Omit it for anonymous visitors.
   */
  identifier?: string;
  /** Optional identity stored with the conversation when it is first created. */
  visitor?: {
    name?: string;
    email?: string;
    metadata?: Record<string, string>;
  };
  /** Poll interval in milliseconds. Defaults to 3000. */
  pollIntervalMs?: number;
  /** Called when the panel opens or closes. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export interface StoredSession {
  conversationId: string;
  visitorToken: string;
}
