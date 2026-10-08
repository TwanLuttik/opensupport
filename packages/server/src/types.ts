export type AuthorRole = "visitor" | "agent" | "system";

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
  /** Set once the other side has read this message. Absent until then. */
  readAt?: string;
  /** Present when an integration posted the message. */
  agentName?: string;
  /**
   * Action ids the AI asked the page to resolve. Present only on that reply.
   * The `%%[…]%%` marker itself is removed before the body is stored.
   */
  actionIds?: number[];
  /**
   * Set when the visitor sent this message by pressing an action button.
   * The body is still the handler text, for the model. The bubble shows this label instead.
   */
  actionLabel?: string;
}

export type ConversationStatus = "open" | "closed";

export interface Conversation {
  id: string;
  visitorId: string;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  /**
   * Stable id supplied by the embedding app. Conversations that share it belong
   * to the same person. Null for anonymous visitors.
   */
  identifier: string | null;
  /** Name of the agent who last replied. Null until someone handles the thread. */
  agentName: string | null;
  /** Account that claimed the ticket. Null until someone clicks Assign. */
  assigneeId: string | null;
  assigneeName: string | null;
  /** Profile photo of the agent who claimed the ticket. Null when they have none. */
  assigneeAvatarUrl: string | null;
  assignedAt: string | null;
  metadata: Record<string, string>;
  unreadForAgent: number;
  /** Monotonic insert order, used to break ties when timestamps collide. */
  seq: number;
  /** Visitor rating after the chat ended. Null until they vote or skip. */
  rating: "up" | "down" | "skipped" | null;
  ratingComment: string | null;
  ratedAt: string | null;
  /**
   * How far each side has read. A message is seen when its `createdAt` is at or
   * before the other side's cursor. Null until that side opens the thread.
   */
  visitorReadAt: string | null;
  agentReadAt: string | null;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface AgentScore {
  accountId: string | null;
  name: string;
  up: number;
  down: number;
  /** Share of thumbs-up among rated chats. Null when nobody has voted. */
  score: number | null;
}

export interface ReviewSummary {
  up: number;
  down: number;
  skipped: number;
  score: number | null;
  agents: AgentScore[];
  reviews: Array<{
    conversationId: string;
    visitorName: string | null;
    assigneeId: string | null;
    assigneeName: string | null;
    rating: "up" | "down";
    comment: string | null;
    ratedAt: string;
  }>;
}

/** One page the visitor looked at during this conversation. The last row is still open. */
export interface PageVisit {
  path: string;
  startedAt: string;
  /** Set when they leave the page. Null while they are still on it. */
  endedAt: string | null;
}

export type FormFieldType = "text" | "email" | "textarea" | "select";

/** One field on the pre-chat form visitors fill in before a conversation starts. */
export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder: string;
  /** Choices for a select field. Ignored for other types. */
  options: string[];
}

/** A button on the start screen. Choosing it records the topic of the conversation. */
export interface QuickAction {
  id: string;
  label: string;
}

/** Built-in bubble looks, plus `custom` when the desk paints its own colors. */
export type BubbleThemeId = "ink" | "paper" | "forest" | "ocean" | "dusk" | "custom";

/** Colors the bubble paints from. Every value is a `#rrggbb` hex. */
export interface BubbleThemeColors {
  /** Launcher, visitor bubbles, and primary buttons. */
  accent: string;
  /** Text and icons drawn on the accent. */
  accentText: string;
  /** Header bar behind the title. */
  header: string;
  /** Title and subtitle on the header. */
  headerText: string;
  /** Panel, composer, and cards. */
  panel: string;
  /** Transcript background. */
  canvas: string;
  /** Body text. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Agent message bubble. */
  agentBubble: string;
  /** Composer bar. */
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
  /** Template id plus the colors the bubble should paint. */
  theme: BubbleTheme;
  placeholder: string;
  greeting: string;
  /** When true, the widget asks for this form before opening a conversation. */
  formEnabled: boolean;
  formTitle: string;
  formSubmitLabel: string;
  formFields: FormField[];
  /** Shown in the widget until an agent assigns the ticket. */
  waitingMessage: string;
  /** Start-screen buttons. Empty means the visitor starts a conversation without a topic. */
  quickActions: QuickAction[];
  /** Business mark shown in the bubble header. Null until one is uploaded. */
  logoUrl: string | null;
  /** When true, the bubble shows how long people usually wait before an agent accepts. */
  showResponseTime: boolean;
}

export type WebhookEvent = "conversation.created" | "message.created";

export interface WebhookEndpoint {
  id: string;
  url: string;
  /** Events that trigger a POST. Empty means all events. */
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: string;
}

export interface TelegramSettings {
  enabled: boolean;
  botToken: string | null;
  chatId: string | null;
  /** When set, a reply in this Telegram chat is posted back as an agent message. */
  notifyOn: Array<"conversation.created" | "message.created">;
}

/** One weekday. `open` is null when the desk is closed that day. */
export interface DayHours {
  /** Minutes from midnight, 0–1440. The end can be earlier than the start when the shift crosses midnight. */
  open: number | null;
  close: number | null;
}

export interface OfficeHours {
  /** When false, live chat is available all the time. */
  enabled: boolean;
  /** IANA timezone, such as Europe/Amsterdam. */
  timezone: string;
  /** Monday through Sunday. */
  days: [DayHours, DayHours, DayHours, DayHours, DayHours, DayHours, DayHours];
  /** Shown when a visitor arrives outside these hours. */
  closedMessage: string;
}

/**
 * A client action the AI can request at the end of a reply.
 * The number is what the model writes inside `%%[…]%%`. The description is
 * added to the system prompt so the model knows when to ask for it.
 */
export interface AiAction {
  /** Stable caller id, 1–99. This is the number inside `%%[1,2]%%`. */
  id: number;
  /** Short name shown in the dashboard. Not sent to the model. */
  label: string;
  /** What this action returns. Ingested into the AI knowledge automatically. */
  description: string;
}

/** How the bubble answers on its own. The API key lives in the secrets table, not here. */
export interface AiSettings {
  /** When true, and a key is saved, visitors can choose the AI instead of a person. */
  enabled: boolean;
  /** OpenAI model id, such as gpt-4o-mini. */
  model: string;
  /** Name shown on AI replies in the bubble. */
  agentName: string;
  /** Extra knowledge the model should use. Not sent to the public widget config. */
  context: string;
  /** Client actions the model may request when it needs data from the page. */
  actions: AiAction[];
  /** When true, each IP address can only ask the AI `rateLimit` times per 10 minutes. */
  rateLimitEnabled: boolean;
  /** AI replies allowed from one IP address per 10 minutes. */
  rateLimit: number;
}

export interface ServerSettings {
  widget: PublicConfig;
  /**
   * Sites allowed to embed the bubble and call the widget API. `*` allows any site.
   * The dashboard is not on this list. Saving an embed origin does not lock the desk out.
   */
  corsOrigin: string;
  webhooks: WebhookEndpoint[];
  telegram: TelegramSettings;
  hours: OfficeHours;
  ai: AiSettings;
}

/** What the dashboard is allowed to see. Secrets are masked. */
export interface ServerSettingsView {
  widget: PublicConfig;
  corsOrigin: string;
  webhooks: Array<WebhookEndpoint & { hasSecret: boolean }>;
  telegram: {
    enabled: boolean;
    chatId: string | null;
    hasBotToken: boolean;
    notifyOn: TelegramSettings["notifyOn"];
  };
  hours: OfficeHours;
  ai: {
    enabled: boolean;
    model: string;
    agentName: string;
    context: string;
    actions: AiAction[];
    hasApiKey: boolean;
    rateLimitEnabled: boolean;
    rateLimit: number;
  };
}

export type AccountRole = "admin" | "agent";

export interface Account {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  createdAt: string;
  disabledAt: string | null;
  /** Profile photo path, or null when the agent has not uploaded one. */
  avatarUrl: string | null;
  /** Chosen desk status. Online still needs a recent heartbeat to count as present. */
  presence: "online" | "away";
  /** Last dashboard heartbeat, or null when this account has never opened the desk. */
  lastSeenAt: string | null;
}

/** One model reply. Prompt tokens cover the knowledge and the transcript sent with it. */
export interface AiUsageEntry {
  id: string;
  conversationId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
}

export interface AiUsageSummary {
  /** Conversations the visitor started with the AI. */
  conversations: number;
  /** Visitor messages posted in those conversations. */
  messages: number;
  /** Model replies that were recorded. */
  replies: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Standard-rate estimate in USD. Cached repeats cost less, so this is a ceiling. */
  estimatedCostUsd: number;
  models: Array<{
    model: string;
    replies: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
  }>;
  recent: Array<AiUsageEntry & { estimatedCostUsd: number }>;
}

export interface DeskStats {
  /** Mean seconds from a human chat opening until the first accept. Null with no samples. */
  averageResponseSeconds: number | null;
  responseSamples: number;
  /** Share of thumbs-up among up and down votes, from 0 to 1. Null when nobody voted. */
  averageRating: number | null;
  ratingUp: number;
  ratingDown: number;
  ratingSkipped: number;
  /** Mean seconds a closed human chat stayed open. Null when none have ended. */
  averageConversationSeconds: number | null;
  conversationSamples: number;
}

export interface ApiTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
