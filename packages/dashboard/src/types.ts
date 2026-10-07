export type LoginMode = "setup" | "email" | "key";
export type ThemeName = "system" | "light" | "dark";
export type FieldType = "text" | "email" | "textarea" | "select";
export type NotifyEvent = "conversation.created" | "message.created";

export interface Account {
  id: string;
  email: string;
  name: string;
  role: "admin" | "agent";
  createdAt: string;
  disabledAt: string | null;
  avatarUrl: string | null;
  presence: "online" | "away";
  lastSeenAt: string | null;
}

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
  role: "visitor" | "agent" | "system";
  body: string;
  attachments?: Attachment[];
  agentName?: string | null;
  createdAt: string;
  actionIds?: number[];
  /** Set when the visitor shared this by pressing an AI action button. */
  actionLabel?: string;
}

export interface PageVisit {
  path: string;
  startedAt: string;
  endedAt: string | null;
}

export interface Conversation {
  id: string;
  visitorName: string | null;
  visitorEmail: string | null;
  identifier: string | null;
  status: "open" | "closed";
  unreadForAgent: number;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, string>;
  messages?: Message[];
  rating?: "up" | "down" | "skipped" | null;
}

export interface VisitorCard {
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

export interface FormFieldDraft {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
  options: string[];
}

export interface QuickAction {
  id: string;
  label: string;
}

export type BubbleThemeId = "ink" | "paper" | "forest" | "ocean" | "dusk" | "custom";

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

export interface WidgetSettings {
  title: string;
  subtitle: string;
  accentColor: string;
  theme: BubbleTheme;
  placeholder: string;
  greeting: string;
  waitingMessage: string;
  formEnabled: boolean;
  formTitle: string;
  formSubmitLabel: string;
  formFields: FormFieldDraft[];
  quickActions: QuickAction[];
  logoUrl: string | null;
  showResponseTime: boolean;
}

export interface Webhook {
  id: string;
  url: string;
  events: NotifyEvent[];
  enabled: boolean;
}

export interface DayHours {
  open: number | null;
  close: number | null;
}

export interface OfficeHours {
  enabled: boolean;
  timezone: string;
  days: DayHours[];
  closedMessage: string;
}

export interface AiAction {
  id: number;
  label: string;
  description: string;
}

export interface AiSettingsView {
  enabled: boolean;
  model: string;
  agentName: string;
  context: string;
  actions: AiAction[];
  hasApiKey: boolean;
  rateLimitEnabled: boolean;
  rateLimit: number;
}

export interface SettingsView {
  widget: WidgetSettings;
  corsOrigin: string;
  webhooks: Webhook[];
  telegram: {
    enabled: boolean;
    chatId: string | null;
    hasBotToken: boolean;
    notifyOn: NotifyEvent[];
  };
  hours: OfficeHours;
  ai: AiSettingsView;
}

export interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  revokedAt: string | null;
}

export interface SessionResponse {
  authenticated: boolean;
  needsSetup: boolean;
  account: Account | null;
}
