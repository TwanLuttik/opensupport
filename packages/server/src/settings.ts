import { z } from "zod";
import { DEFAULT_AI_MODEL, isOpenAiModel } from "./ai.js";
import { BUBBLE_THEME_IDS, resolveBubbleTheme } from "./themes.js";
import type { AiSettings, DayHours, FormField, OfficeHours, PublicConfig, ServerSettings, ServerSettingsView, TelegramSettings, WebhookEndpoint } from "./types.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const themeColorsSchema = z.object({
  accent: hexColor,
  accentText: hexColor,
  header: hexColor,
  headerText: hexColor,
  panel: hexColor,
  canvas: hexColor,
  ink: hexColor,
  muted: hexColor,
  agentBubble: hexColor,
  composer: hexColor,
});

/** Accepts a template id alone, or a custom palette with any subset of colors. */
export const themeInputSchema = z.object({
  id: z.enum(BUBBLE_THEME_IDS),
  colors: themeColorsSchema.partial().optional(),
});

export const DEFAULT_TELEGRAM: TelegramSettings = {
  enabled: false,
  botToken: null,
  chatId: null,
  notifyOn: ["message.created"],
};

export const aiActionSchema = z.object({
  id: z.number().int().min(1).max(99),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
});

export const DEFAULT_AI: AiSettings = {
  enabled: false,
  model: DEFAULT_AI_MODEL,
  agentName: "AI assistant",
  context: "",
  actions: [],
  rateLimitEnabled: false,
  rateLimit: 20,
};

export const formFieldSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "email", "textarea", "select"]),
  required: z.boolean(),
  placeholder: z.string().trim().max(120).default(""),
  options: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

export const widgetSchema = z.object({
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().min(1).max(160),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  placeholder: z.string().trim().min(1).max(120),
  greeting: z.string().trim().min(1).max(500),
  formEnabled: z.boolean().default(false),
  formTitle: z.string().trim().min(1).max(120).default("Before we start"),
  formSubmitLabel: z.string().trim().min(1).max(40).default("Start conversation"),
  formFields: z.array(formFieldSchema).max(12).default([]),
  waitingMessage: z.string().trim().min(1).max(160).default("Waiting for an agent"),
  quickActions: z
    .array(
      z.object({
        id: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
        label: z.string().trim().min(1).max(40),
      }),
    )
    .max(8)
    .default([]),
  logoUrl: z
    .string()
    .regex(/^\/uploads\/[a-zA-Z0-9._-]+$/)
    .nullable()
    .default(null),
  showResponseTime: z.boolean().default(false),
});

const timeSchema = z.number().int().min(0).max(24 * 60);

const daySchema = z.object({
  open: timeSchema.nullable(),
  close: timeSchema.nullable(),
});

export const hoursSchema = z
  .object({
    enabled: z.boolean(),
    timezone: z.string().trim().min(1).max(80),
    days: z.tuple([daySchema, daySchema, daySchema, daySchema, daySchema, daySchema, daySchema]),
    closedMessage: z.string().trim().min(1).max(240),
  })
  .superRefine((hours, ctx) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: hours.timezone }).format();
    } catch {
      ctx.addIssue({ code: "custom", path: ["timezone"], message: "Timezone is not recognized" });
    }
    hours.days.forEach((day, index) => {
      const blank = day.open === null && day.close === null;
      const both = day.open !== null && day.close !== null;
      if (!blank && !both) {
        ctx.addIssue({ code: "custom", path: ["days", index], message: "Set both an opening and a closing time" });
      }
      if (both && day.open === day.close) {
        ctx.addIssue({ code: "custom", path: ["days", index], message: "Opening and closing time must differ" });
      }
    });
  });

const webhookSchema = z.object({
  id: z.string().min(1).max(80),
  url: z.string().url().max(500),
  events: z.array(z.enum(["conversation.created", "message.created"])).max(4),
  enabled: z.boolean(),
  createdAt: z.string().min(1),
});

export const settingsSchema = z.object({
  widget: widgetSchema.extend({
    theme: z.object({
      id: z.enum(BUBBLE_THEME_IDS),
      colors: themeColorsSchema,
    }),
  }),
  corsOrigin: z.string().trim().min(1).max(1000),
  webhooks: z.array(webhookSchema).max(20),
  telegram: z.object({
    enabled: z.boolean(),
    botToken: z.string().trim().min(1).max(200).nullable(),
    chatId: z.string().trim().min(1).max(64).nullable(),
    notifyOn: z.array(z.enum(["conversation.created", "message.created"])).max(4),
  }),
  hours: hoursSchema.default({
    enabled: false,
    timezone: "UTC",
    days: [
      { open: 9 * 60, close: 17 * 60 },
      { open: 9 * 60, close: 17 * 60 },
      { open: 9 * 60, close: 17 * 60 },
      { open: 9 * 60, close: 17 * 60 },
      { open: 9 * 60, close: 17 * 60 },
      { open: null, close: null },
      { open: null, close: null },
    ],
    closedMessage: "We are away right now. Leave your email and we will write back.",
  }),
  ai: z
    .object({
      enabled: z.boolean().default(false),
      model: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .default(DEFAULT_AI_MODEL)
        .refine(isOpenAiModel, "Choose an OpenAI model"),
      agentName: z.string().trim().min(1).max(80).default(DEFAULT_AI.agentName),
      context: z.string().max(50000).default(""),
      actions: z.array(aiActionSchema).max(20).default([]),
      rateLimitEnabled: z.boolean().default(false),
      rateLimit: z.number().int().min(1).max(1000).default(DEFAULT_AI.rateLimit),
    })
    .default(DEFAULT_AI),
});

export function defaultHours(): OfficeHours {
  return {
    enabled: false,
    timezone: "UTC",
    days: [
      { open: 9 * 60, close: 17 * 60 },
      { open: 9 * 60, close: 17 * 60 },
      { open: 9 * 60, close: 17 * 60 },
      { open: 9 * 60, close: 17 * 60 },
      { open: 9 * 60, close: 17 * 60 },
      { open: null, close: null },
      { open: null, close: null },
    ],
    closedMessage: "We are away right now. Leave your email and we will write back.",
  };
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function weekdayIndex(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date);
  const index = WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]);
  return index < 0 ? 0 : index;
}

function minutesOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function covers(day: DayHours, minute: number): boolean {
  if (day.open === null || day.close === null) return false;
  if (day.open < day.close) return minute >= day.open && minute < day.close;
  return minute >= day.open || minute < day.close;
}

/** True when live chat should be open. Disabled hours mean always open. */
export function isOpenNow(hours: OfficeHours, now = new Date()): boolean {
  if (!hours.enabled) return true;
  const minute = minutesOfDay(now, hours.timezone);
  const today = weekdayIndex(now, hours.timezone);
  const yesterday = (today + 6) % 7;
  if (covers(hours.days[today]!, minute)) return true;
  const previous = hours.days[yesterday]!;
  return previous.open !== null && previous.close !== null && previous.open > previous.close && minute < previous.close;
}

export function defaultSettings(widget: PublicConfig, corsOrigin: string): ServerSettings {
  return {
    widget,
    corsOrigin,
    webhooks: [],
    telegram: { ...DEFAULT_TELEGRAM, notifyOn: [...DEFAULT_TELEGRAM.notifyOn] },
    hours: defaultHours(),
    ai: { ...DEFAULT_AI },
  };
}

export function toSettingsView(
  settings: ServerSettings,
  secrets: { webhooks: Record<string, boolean>; telegram: boolean; openai: boolean },
): ServerSettingsView {
  return {
    widget: settings.widget,
    corsOrigin: settings.corsOrigin,
    webhooks: settings.webhooks.map((hook) => ({
      ...hook,
      hasSecret: Boolean(secrets.webhooks[hook.id]),
    })),
    telegram: {
      enabled: settings.telegram.enabled,
      chatId: settings.telegram.chatId,
      hasBotToken: secrets.telegram,
      notifyOn: settings.telegram.notifyOn,
    },
    hours: settings.hours,
    ai: {
      enabled: settings.ai.enabled,
      model: settings.ai.model,
      agentName: settings.ai.agentName,
      context: settings.ai.context,
      actions: settings.ai.actions ?? [],
      hasApiKey: secrets.openai,
      rateLimitEnabled: settings.ai.rateLimitEnabled,
      rateLimit: settings.ai.rateLimit,
    },
  };
}

export function publicWidget(settings: ServerSettings): PublicConfig {
  return settings.widget;
}

export type WebhookDraft = Omit<WebhookEndpoint, "id" | "createdAt"> & { id?: string };

export const DEFAULT_FORM_FIELDS: FormField[] = [
  { id: "name", label: "Name", type: "text", required: true, placeholder: "Ada Lovelace", options: [] },
  { id: "email", label: "Email", type: "email", required: true, placeholder: "ada@example.com", options: [] },
  { id: "topic", label: "How can we help?", type: "textarea", required: true, placeholder: "Tell us what happened", options: [] },
];

type WidgetInput = Partial<PublicConfig> &
  Pick<PublicConfig, "title" | "subtitle" | "accentColor" | "placeholder" | "greeting"> & {
    theme?: z.input<typeof themeInputSchema>;
  };

/** Older saved settings predate the form and the theme. Fill the new fields so the widget always has them. */
export function normalizeWidget(widget: WidgetInput): PublicConfig {
  const { theme: rawTheme, ...rest } = widget;
  const theme = resolveBubbleTheme(themeInputSchema.optional().parse(rawTheme), rest.accentColor);
  const parsed = widgetSchema.parse({
    ...rest,
    accentColor: theme.colors.accent,
    formFields: widget.formFields ?? [],
    quickActions: widget.quickActions ?? [],
    logoUrl: widget.logoUrl ?? null,
  });
  return { ...parsed, theme };
}
