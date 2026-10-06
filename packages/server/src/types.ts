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
  /** Present when an integration posted the message. */
  agentName?: string;
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

export interface PublicConfig {
  title: string;
  subtitle: string;
  accentColor: string;
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
  /** When true, each IP address can only ask the AI `rateLimit` times per 10 minutes. */
  rateLimitEnabled: boolean;
  /** AI replies allowed from one IP address per 10 minutes. */
  rateLimit: number;
}

export interface ServerSettings {
  widget: PublicConfig;
  /** Origins allowed to call the widget API. `*` allows any site. */
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

export interface ApiTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
