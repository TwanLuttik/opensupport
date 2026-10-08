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
  /** Set once an agent has read this message. Absent until then. */
  readAt?: string;
  agentName?: string;
  /** Action ids requested at the end of an AI reply. Empty when the model did not ask. */
  actionIds?: number[];
  /** Button label when this visitor message was sent by an action. The body stays hidden. */
  actionLabel?: string;
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
  /** How far the visitor has read. Present on threads loaded from the server. */
  visitorReadAt?: string | null;
  /** How far an agent has read. A visitor message at or before this time is seen. */
  agentReadAt?: string | null;
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

/** Built-in bubble looks, plus `custom` when the desk paints its own colors. */
export type BubbleThemeId = "ink" | "paper" | "forest" | "ocean" | "dusk" | "custom";

/** Colors the bubble paints from. Every value is a `#rrggbb` hex. */
export interface BubbleThemeColors {
  accent: string;
  accentText: string;
  header: string;
  headerText: string;
  panel: string;
  canvas: string;
  ink: string;
  muted: string;
  agentBubble: string;
  composer: string;
}

export interface BubbleTheme {
  id: BubbleThemeId;
  colors: BubbleThemeColors;
}

export interface PublicConfig {
  title: string;
  subtitle: string;
  accentColor: string;
  /** Resolved look from the server. Absent on older servers, which only send an accent. */
  theme?: BubbleTheme;
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
    /** Ids of configured client actions. Labels and handlers live in the embedding app. */
    actions?: number[];
  };
  /** Present when the desk shows how long agents usually take to accept a ticket. */
  responseTime?: {
    seconds: number;
    label: string;
  } | null;
  /** True when a person has the desk open and has not marked themselves away. */
  staffOnline?: boolean;
}

/**
 * A button the bubble shows under an AI reply that asks for client data.
 * The handler's text is posted as the visitor's next message, so they do not have to type it.
 */
export interface AiActionHandler {
  /** Matches an action id configured in the dashboard (`%%[id]%%`). */
  id: number;
  /** Label on the button. */
  label: string;
  /**
   * Reads whatever the page knows and returns the text to send.
   * Return an empty string to leave the composer alone.
   */
  handler: () => string | Promise<string>;
}

export interface SupportBubbleProps {
  /** Base URL of the self-hosted Open Support server, without a trailing slash. */
  serverUrl: string;
  /**
   * Buttons for AI replies that end with action callers (`%%[1,2]%%`).
   * Only ids configured in the dashboard are offered to the model.
   */
  actions?: AiActionHandler[];
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
  /**
   * How often to check for replies after the live connection gives up.
   * An open conversation uses a websocket first and retries three times.
   * Defaults to 3000.
   */
  pollIntervalMs?: number;
  /** Called when the panel opens or closes. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export interface StoredSession {
  conversationId: string;
  visitorToken: string;
}
