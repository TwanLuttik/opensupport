import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { createApiToken, newId, newSecret, parseApiToken, safeEqual, sha256 } from "./crypto.js";
import { SupportStore } from "./db.js";
import { checkTelegram, deliverEvent, pollTelegram, type NotifyPayload } from "./notify.js";
import { OPENAI_SECRET_KEY, buildAiMessages, isOpenAiModel, normalizeAiActions, runOpenAi, splitAiActions } from "./ai.js";
import { SlidingWindow, clientAddress } from "./ratelimit.js";
import { aiActionSchema, hoursSchema, isOpenNow, normalizeWidget, settingsSchema, toSettingsView, widgetSchema } from "./settings.js";
import { DASHBOARD_PAGES, dashboardFile, dashboardMissingHtml } from "./dashboard.js";
import type { Account, Attachment, ServerSettings, WebhookEndpoint, WebhookEvent } from "./types.js";
import { prepareImageUpload, prepareUpload, readBody, serveUpload, UploadStore, UPLOAD_CHUNK_BYTES } from "./uploads.js";

const MAX_BODY = 1024 * 1024;

const startSchema = z.object({
  visitorName: z.string().trim().min(1).max(80).optional(),
  visitorEmail: z.string().trim().email().max(160).optional(),
  /** Stable id from the embedding app. Groups this person's conversations. */
  identifier: z.string().trim().min(1).max(120).optional(),
  /** `ai` answers with the configured model. `human` waits for a person. */
  handler: z.enum(["human", "ai"]).optional(),
  metadata: z.record(z.string().max(2000)).optional(),
  /** Answers keyed by the pre-chat form field id. */
  fields: z.record(z.string().max(2000)).optional(),
  /** Id of a start-screen quick action. Stored as the conversation topic. */
  topic: z.string().trim().min(1).max(40).optional(),
  /** Set when the desk is closed. Turns the start into an offline ticket. */
  offline: z.boolean().optional(),
  /** The message left with an offline ticket. */
  message: z.string().trim().min(1).max(4000).optional(),
});

const patchConversationSchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  visitorName: z.string().trim().min(1).max(80).nullable().optional(),
  visitorEmail: z.string().trim().email().max(160).nullable().optional(),
});

const tokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const configSchema = widgetSchema;

function parseWidget(input: unknown) {
  if (!input || typeof input !== "object") {
    throw Object.assign(new Error("Widget settings are required"), { statusCode: 400 });
  }
  return normalizeWidget(input as Parameters<typeof normalizeWidget>[0]);
}

const assignSchema = z.object({
  /** Override the signed-in account name, used by API tokens that have no account. */
  agentName: z.string().trim().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(160).optional(),
  password: z.string().min(1).max(200).optional(),
  adminKey: z.string().trim().min(1).max(200).optional(),
});

const createAccountSchema = z.object({
  email: z.string().trim().email().max(160),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "agent"]).default("agent"),
});

const setupSchema = z.object({
  email: z.string().trim().email().max(160),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(200),
});

const accountPatchSchema = z.object({
  disabled: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: z.string().min(8).max(200).optional(),
});

const webhookInputSchema = z.object({
  url: z.string().trim().url().max(500),
  events: z.array(z.enum(["conversation.created", "message.created"])).max(4).default([]),
  enabled: z.boolean().default(true),
  secret: z.string().trim().min(8).max(200).optional(),
});

const telegramInputSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().trim().min(1).max(200).optional(),
  chatId: z.string().trim().min(1).max(64).nullable(),
  notifyOn: z.array(z.enum(["conversation.created", "message.created"])).max(4),
});

const aiInputSchema = z.object({
  enabled: z.boolean(),
  model: z.string().trim().min(1).max(80).refine(isOpenAiModel, "Choose an OpenAI model"),
  agentName: z.string().trim().min(1).max(80),
  /** A new key. Omit it to keep the saved one. An empty string clears it. */
  apiKey: z.string().trim().max(300).optional(),
  rateLimitEnabled: z.boolean().default(false),
  rateLimit: z.number().int().min(1).max(1000).default(20),
});

const aiContextSchema = z.object({
  context: z.string().max(50000),
  /** Omit to leave the saved actions alone. */
  actions: z.array(aiActionSchema).max(20).optional(),
});

/** A short line for the bubble, such as "Usually accepted in 2 min". */
export function responseTimeLabel(seconds: number): string {
  if (seconds < 60) return "Usually accepted in under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Usually accepted in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Usually accepted in ${hours} hr`;
  return `Usually accepted in ${Math.round(hours / 24)} days`;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SESSION_COOKIE = "osb_session";

export interface SupportApp {
  server: ReturnType<typeof createServer>;
  store: SupportStore;
  config: ServerConfig;
  /** Printed once when no ADMIN_KEY was configured. */
  generatedAdminKey?: string;
  close: () => Promise<void>;
}

function send(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

async function readJson<T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const raw = await readBody(req, MAX_BODY);
  if (raw.length === 0) {
    return schema.parse({});
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { statusCode: 400 });
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw Object.assign(new Error(result.error.issues.map((issue) => issue.message).join("; ")), {
      statusCode: 400,
    });
  }
  return result.data;
}

function applyCors(req: IncomingMessage, res: ServerResponse, originSetting: string): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed =
    originSetting === "*" ||
    originSetting
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(origin);
  if (!allowed) {
    send(res, 403, { error: "Origin not allowed" });
    return false;
  }
  res.setHeader("access-control-allow-origin", originSetting === "*" ? "*" : origin);
  res.setHeader(
    "access-control-allow-headers",
    "authorization, content-type, x-visitor-token, x-filename, x-upload-id, x-chunk-index, x-file-size, x-file-type",
  );
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("access-control-max-age", "86400");
  if (originSetting !== "*") {
    res.setHeader("vary", "Origin");
  }
  return true;
}

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  return Array.isArray(header) ? header[0] : header;
}

function visitorToken(req: IncomingMessage): string | undefined {
  const header = req.headers["x-visitor-token"];
  if (!header) return undefined;
  return Array.isArray(header) ? header[0] : header;
}

function headerValue(req: IncomingMessage, name: string): string {
  const header = req.headers[name];
  if (!header) return "";
  return Array.isArray(header) ? header[0] ?? "" : header;
}

const attachmentSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  name: z.string().trim().min(1).max(80),
  mimeType: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(50 * 1024 * 1024),
  url: z.string().regex(/^\/uploads\/[a-zA-Z0-9._-]+$/),
}).strict();

const messageSchema = z.object({
  body: z.string().trim().max(8000).default(""),
  attachmentIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(8).optional(),
  /** Set when the bubble sent this message from an AI action button. */
  actionLabel: z.string().trim().min(1).max(80).optional(),
});

const agentMessageSchema = z.object({
  body: z.string().trim().max(8000).default(""),
  agentName: z.string().trim().min(1).max(80).optional(),
  attachmentIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(8).optional(),
});

export function createApp(config: ServerConfig): SupportApp {
  const store = new SupportStore(config.databasePath);
  mkdirSync(config.uploadDir, { recursive: true });
  const uploads = new UploadStore(config.uploadDir);
  const pendingAttachments = new Map<string, { conversationId: string; attachment: Attachment }>();
  const aiLimits = new SlidingWindow();

  let generatedAdminKey: string | undefined;
  const adminKey = config.adminKey ?? (generatedAdminKey = newSecret(24));

  function presentedAdminKey(req: IncomingMessage): string | undefined {
    return bearer(req)?.replace(/^Bearer\s+/i, "").trim();
  }

  function readCookie(req: IncomingMessage, name: string): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) return decodeURIComponent(rest.join("="));
    }
    return undefined;
  }

  function sessionAccount(req: IncomingMessage): Account | null {
    const session = readCookie(req, SESSION_COOKIE);
    if (!session) return null;
    const accountId = store.dashboardAccountId(session);
    if (!accountId) return null;
    const account = store.getAccount(accountId);
    if (!account || account.disabledAt) return null;
    return account;
  }

  function requireDashboard(req: IncomingMessage, res: ServerResponse): boolean {
    const account = sessionAccount(req);
    if (account) {
      store.touchAccount(account.id);
      return true;
    }
    const session = readCookie(req, SESSION_COOKIE);
    if (session && store.dashboardSessionValid(session)) return true;
    const presented = presentedAdminKey(req);
    if (presented && keysMatch(presented, adminKey)) return true;
    send(res, 401, { error: "Sign in required" });
    return false;
  }

  function requireAdminSession(req: IncomingMessage, res: ServerResponse): boolean {
    const account = sessionAccount(req);
    if (account?.role === "admin") return true;
    const presented = presentedAdminKey(req);
    if (presented && keysMatch(presented, adminKey)) return true;
    if (!requireDashboard(req, res)) return false;
    send(res, 403, { error: "Admin access required" });
    return false;
  }

  function signIn(req: IncomingMessage, res: ServerResponse, accountId: string | null): void {
    const token = newSecret(32);
    store.createDashboardSession(token, SESSION_TTL_MS, accountId);
    res.setHeader("set-cookie", sessionCookie(req, `${SESSION_COOKIE}=${encodeURIComponent(token)}`, SESSION_TTL_MS / 1000));
  }

  function publicAccount(account: Account) {
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      createdAt: account.createdAt,
      disabledAt: account.disabledAt,
      avatarUrl: account.avatarUrl,
      presence: account.presence,
      lastSeenAt: account.lastSeenAt,
    };
  }

  function currentSettings(): ServerSettings {
    return store.getSettings({ widget: config.publicConfig, corsOrigin: config.corsOrigin });
  }

  function corsOrigin(): string {
    return currentSettings().corsOrigin || config.corsOrigin;
  }

  function settingsView() {
    const settings = currentSettings();
    const webhookSecrets: Record<string, boolean> = {};
    for (const hook of settings.webhooks) webhookSecrets[hook.id] = Boolean(store.webhookSecret(hook.id));
    return toSettingsView(settings, {
      webhooks: webhookSecrets,
      telegram: Boolean(settings.telegram.botToken),
      openai: Boolean(store.getSecret(OPENAI_SECRET_KEY)),
    });
  }

  function responseTimePublic(settings: ServerSettings) {
    if (!settings.widget.showResponseTime) return null;
    const seconds = store.averageAcceptSeconds();
    if (seconds === null) return null;
    return { seconds, label: responseTimeLabel(seconds) };
  }

  function aiPublic(settings: ServerSettings) {
    const ready = settings.ai.enabled && Boolean(store.getSecret(OPENAI_SECRET_KEY));
    return {
      enabled: ready,
      agentName: settings.ai.agentName,
      actions: normalizeAiActions(settings.ai.actions).map((action) => action.id),
    };
  }

  function emit(type: WebhookEvent, conversationId: string, messageId?: string): void {
    const conversation = store.getConversation(conversationId);
    if (!conversation) return;
    const message = messageId
      ? store.listMessages(conversationId).messages.find((item) => item.id === messageId)
      : undefined;
    const event: NotifyPayload = {
      id: newId("evt"),
      type,
      createdAt: new Date().toISOString(),
      data: { conversation, message },
    };
    void deliverEvent(store, currentSettings(), event).catch((error) => {
      console.error("[open-support] notification failed", error);
    });
  }

  function requireInbox(req: IncomingMessage, res: ServerResponse): boolean {
    if (requireApiToken(req, res, false)) return true;
    return requireDashboard(req, res);
  }

  function requireApiToken(req: IncomingMessage, res: ServerResponse, respond = true): boolean {
    const presented = bearer(req);
    if (!presented) {
      if (respond) send(res, 401, { error: "Missing API token" });
      return false;
    }
    const parsed = parseApiToken(presented);
    if (!parsed) {
      if (respond) send(res, 401, { error: "Malformed API token" });
      return false;
    }
    const record = store.getApiToken(parsed.id);
    if (!record || record.revokedAt || !safeEqual(record.tokenHash, sha256(parsed.secret))) {
      if (respond) send(res, 401, { error: "Invalid API token" });
      return false;
    }
    store.touchApiToken(record.id);
    return true;
  }

  const telegramTimer = setInterval(() => {
    pollTelegram(store, currentSettings()).catch((error) => {
      console.error("[open-support] telegram poll failed", error);
    });
  }, 4000);
  telegramTimer.unref?.();

  const server = createServer(async (req, res) => {
    try {
      if (!applyCors(req, res, corsOrigin())) return;
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (req.method === "GET" && path === "/health") {
        send(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && path === "/widget.js") {
        res.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=300",
        });
        res.end(widgetScript(config));
        return;
      }

      if (req.method === "GET" && path === "/api/widget/config") {
        const settings = currentSettings();
        const widget = settings.widget;
        const hours = settings.hours;
        send(res, 200, {
          ...widget,
          quickActions: widget.quickActions ?? [],
          officeHours: {
            enabled: hours.enabled,
            timezone: hours.timezone,
            open: isOpenNow(hours),
            closedMessage: hours.closedMessage,
            days: hours.days.map((day) => ({ open: day.open, close: day.close })),
          },
          ai: aiPublic(settings),
          staffOnline: store.staffOnline(),
          responseTime: responseTimePublic(settings),
        });
        return;
      }

      if (req.method === "POST" && path === "/api/widget/conversations") {
        const body = await readJson(req, startSchema);
        const settings = currentSettings();
        const widget = settings.widget;
        const wantsAi = body.handler === "ai";
        if (wantsAi && !aiPublic(settings).enabled) {
          send(res, 400, { error: "The AI agent is not available" });
          return;
        }
        const deskClosed = settings.hours.enabled && !isOpenNow(settings.hours);
        const offline = !wantsAi && (Boolean(body.offline) || deskClosed);
        if (offline && !body.visitorEmail) {
          send(res, 400, { error: "Email is required so we can reply" });
          return;
        }
        if (offline && !body.message?.trim()) {
          send(res, 400, { error: "Tell us how we can help" });
          return;
        }
        let visitorName = body.visitorName ?? null;
        let visitorEmail = body.visitorEmail ?? null;
        const metadata: Record<string, string> = { ...(body.metadata ?? {}) };
        const topic = body.topic ? widget.quickActions.find((action) => action.id === body.topic) : undefined;
        if (topic) metadata.topic = topic.label;
        else delete metadata.topic;
        if (wantsAi) metadata.handler = "ai";
        if (widget.formEnabled) {
          const answers = body.fields ?? {};
          for (const field of widget.formFields) {
            const value = (answers[field.id] ?? "").trim();
            if (field.required && !value) {
              send(res, 400, { error: `${field.label} is required` });
              return;
            }
            if (!value) continue;
            if (field.type === "email" && !z.string().email().safeParse(value).success) {
              send(res, 400, { error: `${field.label} must be an email` });
              return;
            }
            if (field.type === "select" && field.options.length > 0 && !field.options.includes(value)) {
              send(res, 400, { error: `${field.label} is not a valid choice` });
              return;
            }
            metadata[field.id] = value;
            if (field.type === "email" && !visitorEmail) visitorEmail = value;
            if (field.type !== "email" && field.type !== "textarea" && !visitorName && /name/i.test(field.id)) {
              visitorName = value.slice(0, 80);
            }
          }
        }
        if (offline) metadata.offline = "true";
        const created = store.createConversation(
          {
            visitorName,
            visitorEmail,
            identifier: body.identifier ?? null,
            metadata,
          },
          newSecret(24),
        );
        const greeting = widget.greeting;
        const messages = [
          store.addMessage(created.conversation.id, {
            role: "system",
            body: greeting,
          }),
        ];
        if (topic) {
          messages.push(
            store.addMessage(created.conversation.id, {
              role: "system",
              body: `Topic: ${topic.label}`,
            }),
          );
        }
        if (offline && body.message) {
          messages.push(
            store.addMessage(created.conversation.id, {
              role: "visitor",
              body: body.message,
            }),
          );
        }
        if (widget.formEnabled) {
          const summary = widget.formFields
            .map((field) => {
              const value = metadata[field.id];
              return value ? `${field.label}: ${value}` : "";
            })
            .filter(Boolean)
            .join("\n");
          if (summary) {
            messages.push(
              store.addMessage(created.conversation.id, {
                role: "visitor",
                body: summary,
              }),
            );
          }
        }
        messages.push(
          store.addMessage(created.conversation.id, {
            role: "system",
            body: offline
              ? settings.hours.closedMessage
              : wantsAi
                ? `${settings.ai.agentName} joined the conversation`
                : widget.waitingMessage,
          }),
        );
        if (offline) store.updateConversation(created.conversation.id, { status: "closed" });
        emit("conversation.created", created.conversation.id, messages[0]?.id);
        send(res, 201, {
          conversation: store.getConversation(created.conversation.id),
          visitorToken: created.visitorToken,
          messages,
        });
        return;
      }

      const widgetMessage = /^\/api\/widget\/conversations\/([^/]+)\/messages$/.exec(path);
      if (widgetMessage && req.method === "POST") {
        const widgetConversationId = widgetMessage[1];
        if (!widgetConversationId) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        const conversation = authorizeVisitor(store, widgetConversationId, visitorToken(req), res);
        if (!conversation) return;
        const body = await readJson(req, messageSchema);
        try {
          const message = store.addMessage(conversation.id, {
            role: "visitor",
            body: messageBody(body.body, body.attachmentIds),
            attachments: takeAttachments(pendingAttachments, conversation.id, body.attachmentIds),
            actionLabel: body.actionLabel,
          });
          emit("message.created", conversation.id, message.id);
          send(res, 201, { message });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to post message";
          const status = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode: number }).statusCode) : 400;
          send(res, status, { error: message });
        }
        return;
      }

      const widgetAi = /^\/api\/widget\/conversations\/([^/]+)\/ai$/.exec(path);
      if (widgetAi && req.method === "POST") {
        const conversation = authorizeVisitor(store, widgetAi[1]!, visitorToken(req), res);
        if (!conversation) return;
        if (conversation.status === "closed") {
          send(res, 400, { error: "Conversation is closed" });
          return;
        }
        if (conversation.metadata.handler !== "ai") {
          send(res, 409, { error: "This conversation is with a person" });
          return;
        }
        if (conversation.assigneeId || conversation.assigneeName) {
          send(res, 409, { error: "An agent has joined this conversation" });
          return;
        }
        const settings = currentSettings();
        const apiKey = store.getSecret(OPENAI_SECRET_KEY);
        if (!settings.ai.enabled || !apiKey) {
          send(res, 409, { error: "The AI agent is not available" });
          return;
        }
        const transcript = store.listMessages(conversation.id).messages;
        const latestVisitor = [...transcript].reverse().find((message) => message.role === "visitor");
        if (!latestVisitor) {
          send(res, 400, { error: "Write a message first" });
          return;
        }
        const last = transcript.at(-1);
        if (last?.role === "agent") {
          send(res, 200, { message: last });
          return;
        }
        if (settings.ai.rateLimitEnabled) {
          const decision = aiLimits.take(clientAddress(req), settings.ai.rateLimit);
          if (!decision.allowed) {
            send(res, 429, { error: "Too many questions. Try again in a few minutes." }, {
              "retry-after": String(decision.retryAfterSeconds),
            });
            return;
          }
        }
        try {
          const reply = await runOpenAi(
            {
              apiKey,
              model: settings.ai.model,
              messages: buildAiMessages(settings.ai, transcript),
            },
            fetch,
          );
          const parsed = splitAiActions(reply.body, settings.ai.actions);
          if (!parsed.body && parsed.actionIds.length === 0) {
            send(res, 502, { error: "The model returned an empty reply" });
            return;
          }
          const message = store.addMessage(conversation.id, {
            role: "agent",
            body: parsed.body,
            agentName: settings.ai.agentName,
            actionIds: parsed.actionIds,
          });
          store.recordAiUsage({
            conversationId: conversation.id,
            model: settings.ai.model,
            promptTokens: reply.promptTokens ?? 0,
            completionTokens: reply.completionTokens ?? 0,
          });
          send(res, 201, { message });
        } catch (error) {
          const message = error instanceof Error ? error.message : "The AI agent could not reply";
          const status = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode: number }).statusCode) : 502;
          send(res, status >= 400 && status < 600 ? status : 502, { error: message });
        }
        return;
      }

      const widgetClose = /^\/api\/widget\/conversations\/([^/]+)$/.exec(path);
      if (widgetClose && req.method === "PATCH") {
        const conversation = authorizeVisitor(store, widgetClose[1]!, visitorToken(req), res);
        if (!conversation) return;
        const body = await readJson(req, z.object({ status: z.literal("closed") }));
        const updated = store.updateConversation(conversation.id, { status: body.status });
        send(res, 200, { conversation: updated });
        return;
      }

      const widgetRating = /^\/api\/widget\/conversations\/([^/]+)\/rating$/.exec(path);
      if (widgetRating && req.method === "POST") {
        const conversation = authorizeVisitor(store, widgetRating[1]!, visitorToken(req), res);
        if (!conversation) return;
        const body = await readJson(
          req,
          z.object({
            rating: z.enum(["up", "down", "skipped"]),
            comment: z.string().trim().max(500).optional(),
          }),
        );
        const updated = store.rateConversation(conversation.id, body.rating, body.comment);
        send(res, 200, { conversation: updated });
        return;
      }

      if (path === "/api/dashboard/stats" && req.method === "GET") {
        if (!requireDashboard(req, res)) return;
        send(res, 200, { stats: store.deskStats() });
        return;
      }

      if (path === "/api/dashboard/ai/usage" && req.method === "GET") {
        if (!requireDashboard(req, res)) return;
        send(res, 200, { usage: store.aiUsageSummary() });
        return;
      }

      if (path === "/api/dashboard/reviews" && req.method === "GET") {
        if (!requireAdminSession(req, res)) return;
        send(res, 200, { reviews: store.reviewSummary() });
        return;
      }

      const widgetPages = /^\/api\/widget\/conversations\/([^/]+)\/pages$/.exec(path);
      if (widgetPages && req.method === "POST") {
        const pageConversationId = widgetPages[1];
        if (!pageConversationId) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        const conversation = authorizeVisitor(store, pageConversationId, visitorToken(req), res);
        if (!conversation) return;
        const body = await readJson(req, z.object({ path: z.string().trim().min(1).max(300) }));
        const pages = store.recordPage(conversation.id, body.path);
        send(res, 200, { pages });
        return;
      }

      const agentPages = /^\/api\/conversations\/([^/]+)\/pages$/.exec(path);
      if (agentPages && req.method === "GET") {
        if (!requireInbox(req, res)) return;
        const pageConversationId = agentPages[1];
        if (!pageConversationId || !store.getConversation(pageConversationId)) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        send(res, 200, { pages: store.listPages(pageConversationId) });
        return;
      }

      const widgetPoll = /^\/api\/widget\/conversations\/([^/]+)$/.exec(path);
      if (widgetPoll && req.method === "GET") {
        const conversation = authorizeVisitor(store, widgetPoll[1]!, visitorToken(req), res);
        if (!conversation) return;
        const after = url.searchParams.get("after") ?? undefined;
        send(res, 200, {
          conversation,
          messages: store.listMessages(conversation.id, { after }).messages,
        });
        return;
      }

      const widgetUpload = /^\/api\/widget\/conversations\/([^/]+)\/uploads$/.exec(path);
      if (widgetUpload && (req.method === "POST" || req.method === "PUT")) {
        const conversation = authorizeVisitor(store, widgetUpload[1]!, visitorToken(req), res);
        if (!conversation) return;
        await handleUpload(req, res, uploads, pendingAttachments, conversation.id);
        return;
      }

      const agentUpload = /^\/api\/conversations\/([^/]+)\/uploads$/.exec(path);
      if (agentUpload && (req.method === "POST" || req.method === "PUT")) {
        if (!requireInbox(req, res)) return;
        const conversation = store.getConversation(agentUpload[1]!);
        if (!conversation) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        await handleUpload(req, res, uploads, pendingAttachments, conversation.id);
        return;
      }

      if (path.startsWith("/uploads/") && req.method === "GET") {
        serveUpload(config, path, res);
        return;
      }

      if (path === "/api/tokens" && req.method === "POST") {
        if (!requireAdminSession(req, res)) return;
        const body = await readJson(req, tokenSchema);
        const created = createApiToken();
        store.insertApiToken({
          id: created.id,
          name: body.name,
          tokenHash: created.secretHash,
          tokenPrefix: created.prefix,
          createdAt: new Date().toISOString(),
        });
        send(res, 201, {
          id: created.id,
          name: body.name,
          token: created.token,
          tokenPrefix: created.prefix,
        });
        return;
      }

      if (path === "/api/tokens" && req.method === "GET") {
        if (!requireAdminSession(req, res)) return;
        send(res, 200, { tokens: store.listApiTokens() });
        return;
      }

      const revoke = /^\/api\/tokens\/([^/]+)$/.exec(path);
      if (revoke && req.method === "DELETE") {
        if (!requireAdminSession(req, res)) return;
        const ok = store.revokeApiToken(revoke[1]!);
        send(res, ok ? 200 : 404, ok ? { revoked: true } : { error: "Token not found" });
        return;
      }

      if (path === "/api/config" && req.method === "GET") {
        if (!requireAdminSession(req, res)) return;
        send(res, 200, store.getConfig(config.publicConfig));
        return;
      }

      if (path === "/api/config" && req.method === "PUT") {
        if (!requireAdminSession(req, res)) return;
        const widget = parseWidget(await readJson(req, configSchema));
        store.setConfig(widget);
        send(res, 200, widget);
        return;
      }

      if (path === "/api/dashboard/session" && req.method === "POST") {
        const body = await readJson(req, loginSchema);
        if (body.email && body.password) {
          const account = store.authenticateAccount(body.email, body.password);
          if (!account) {
            send(res, 401, { error: "Wrong email or password" });
            return;
          }
          signIn(req, res, account.id);
          send(res, 201, { ok: true, account: publicAccount(account) });
          return;
        }
        if (body.adminKey && keysMatch(body.adminKey.trim(), adminKey)) {
          signIn(req, res, null);
          send(res, 201, { ok: true, account: null });
          return;
        }
        send(res, 401, { error: "Sign in with your email and password, or the admin key" });
        return;
      }

      if (path === "/api/dashboard/session" && req.method === "DELETE") {
        const token = readCookie(req, SESSION_COOKIE);
        if (token) store.deleteDashboardSession(token);
        res.setHeader("set-cookie", sessionCookie(req, `${SESSION_COOKIE}=`, 0));
        send(res, 200, { ok: true });
        return;
      }

      if (path === "/api/dashboard/presence" && req.method === "POST") {
        const account = sessionAccount(req);
        if (!account) {
          if (!requireDashboard(req, res)) return;
          send(res, 200, { account: null, staffOnline: store.staffOnline() });
          return;
        }
        const body = await readJson(req, z.object({ presence: z.enum(["online", "away"]).optional() }));
        const next = body.presence ? store.setAccountPresence(account.id, body.presence) : account;
        if (!body.presence) store.touchAccount(account.id);
        send(res, 200, { account: next ? publicAccount(next) : publicAccount(account), staffOnline: store.staffOnline() });
        return;
      }

      if (path === "/api/dashboard/session" && req.method === "GET") {
        const token = readCookie(req, SESSION_COOKIE);
        const valid = Boolean(token && store.dashboardSessionValid(token));
        const account = valid ? sessionAccount(req) : null;
        if (account) store.touchAccount(account.id);
        send(res, 200, {
          authenticated: valid,
          needsSetup: store.countAccounts() === 0,
          account: account ? publicAccount(account) : null,
        });
        return;
      }

      if (path === "/api/dashboard/setup" && req.method === "POST") {
        if (store.countAccounts() > 0) {
          send(res, 409, { error: "An account already exists. Sign in and add people from the dashboard." });
          return;
        }
        const body = await readJson(req, setupSchema);
        const account = store.createAccount({ ...body, role: "admin" });
        signIn(req, res, account.id);
        send(res, 201, { account: publicAccount(account) });
        return;
      }

      if (path === "/api/dashboard/accounts" && req.method === "GET") {
        if (!requireAdminSession(req, res)) return;
        send(res, 200, { accounts: store.listAccounts().map(publicAccount) });
        return;
      }

      if (path === "/api/dashboard/accounts" && req.method === "POST") {
        if (!requireAdminSession(req, res)) return;
        const body = await readJson(req, createAccountSchema);
        if (store.getAccountByEmail(body.email)) {
          send(res, 409, { error: "An account with that email already exists" });
          return;
        }
        const account = store.createAccount({ ...body, role: body.role ?? "agent" });
        send(res, 201, { account: publicAccount(account) });
        return;
      }

      const accountPath = /^\/api\/dashboard\/accounts\/([^/]+)$/.exec(path);
      if (accountPath && req.method === "PATCH") {
        if (!requireAdminSession(req, res)) return;
        const body = await readJson(req, accountPatchSchema);
        const existing = store.getAccount(accountPath[1]!);
        if (!existing) {
          send(res, 404, { error: "Account not found" });
          return;
        }
        if (body.disabled === true && existing.role === "admin") {
          const enabledAdmins = store.listAccounts().filter((item) => item.role === "admin" && !item.disabledAt);
          if (enabledAdmins.length <= 1 && enabledAdmins[0]?.id === existing.id) {
            send(res, 400, { error: "Keep at least one admin account enabled" });
            return;
          }
        }
        if (body.name) store.setAccountName(existing.id, body.name);
        if (body.password) store.setAccountPassword(existing.id, body.password);
        const updated = body.disabled === undefined ? store.getAccount(existing.id) : store.setAccountDisabled(existing.id, body.disabled);
        send(res, 200, { account: updated ? publicAccount(updated) : null });
        return;
      }

      if (path === "/api/dashboard/profile" && req.method === "PATCH") {
        const account = sessionAccount(req);
        if (!account) {
          if (!requireDashboard(req, res)) return;
          send(res, 400, { error: "Sign in with an account to edit your profile" });
          return;
        }
        const body = await readJson(req, profileSchema);
        if (body.newPassword) {
          if (!body.currentPassword || !store.authenticateAccount(account.email, body.currentPassword)) {
            send(res, 400, { error: "Current password is wrong" });
            return;
          }
          store.setAccountPassword(account.id, body.newPassword);
        }
        const updated = store.setAccountName(account.id, body.name);
        send(res, 200, { account: updated ? publicAccount(updated) : null });
        return;
      }

      if (path === "/api/dashboard/avatar" && req.method === "POST") {
        const account = sessionAccount(req);
        if (!account) {
          if (!requireDashboard(req, res)) return;
          send(res, 400, { error: "Sign in with an account to set a profile picture" });
          return;
        }
        const bytes = await readBody(req, 2 * 1024 * 1024);
        const file = prepareImageUpload(headerValue(req, "x-filename") || "avatar.png", headerValue(req, "content-type"), bytes.length);
        const saved = uploads.saveImage(file, bytes);
        const updated = store.setAccountAvatar(account.id, saved.url);
        send(res, 200, { account: updated ? publicAccount(updated) : null });
        return;
      }

      if (path === "/api/dashboard/avatar" && req.method === "DELETE") {
        const account = sessionAccount(req);
        if (!account) {
          if (!requireDashboard(req, res)) return;
          send(res, 400, { error: "Sign in with an account to set a profile picture" });
          return;
        }
        const updated = store.setAccountAvatar(account.id, null);
        send(res, 200, { account: updated ? publicAccount(updated) : null });
        return;
      }

      if (path === "/api/dashboard/logo" && req.method === "POST") {
        if (!requireDashboard(req, res)) return;
        const bytes = await readBody(req, 2 * 1024 * 1024);
        const file = prepareImageUpload(headerValue(req, "x-filename") || "logo.png", headerValue(req, "content-type"), bytes.length);
        const saved = uploads.saveImage(file, bytes);
        const settings = currentSettings();
        const savedSettings = store.saveSettings({ ...settings, widget: { ...settings.widget, logoUrl: saved.url } });
        send(res, 200, { logoUrl: savedSettings.widget.logoUrl });
        return;
      }

      if (path === "/api/dashboard/logo" && req.method === "DELETE") {
        if (!requireDashboard(req, res)) return;
        const settings = currentSettings();
        store.saveSettings({ ...settings, widget: { ...settings.widget, logoUrl: null } });
        send(res, 200, { logoUrl: null });
        return;
      }

      if (path === "/api/dashboard/hours" && req.method === "PUT") {
        if (!requireDashboard(req, res)) return;
        const hours = hoursSchema.parse(await readJson(req, hoursSchema));
        const saved = store.saveSettings({ ...currentSettings(), hours });
        send(res, 200, { hours: saved.hours });
        return;
      }

      if (path === "/api/dashboard/settings" && req.method === "GET") {
        if (!requireDashboard(req, res)) return;
        send(res, 200, { settings: settingsView() });
        return;
      }

      if (path === "/api/dashboard/widget" && req.method === "PUT") {
        if (!requireDashboard(req, res)) return;
        const widget = parseWidget(await readJson(req, z.unknown()));
        const saved = store.saveSettings({ ...currentSettings(), widget });
        send(res, 200, { widget: saved.widget });
        return;
      }

      if (path === "/api/dashboard/access" && req.method === "PUT") {
        if (!requireDashboard(req, res)) return;
        const body = await readJson(req, z.object({ corsOrigin: z.string().trim().min(1).max(1000) }));
        const saved = store.saveSettings({ ...currentSettings(), corsOrigin: body.corsOrigin });
        send(res, 200, { corsOrigin: saved.corsOrigin });
        return;
      }

      if (path === "/api/dashboard/webhooks" && req.method === "POST") {
        if (!requireDashboard(req, res)) return;
        const body = await readJson(req, webhookInputSchema);
        const hook: WebhookEndpoint = {
          id: newId("wh"),
          url: body.url,
          events: body.events ?? [],
          enabled: body.enabled ?? true,
          createdAt: new Date().toISOString(),
        };
        const settings = currentSettings();
        store.saveSettings({ ...settings, webhooks: [...settings.webhooks, hook] });
        const secret = body.secret ?? newSecret(24);
        store.setWebhookSecret(hook.id, secret);
        send(res, 201, { webhook: { ...hook, hasSecret: true }, secret });
        return;
      }

      const webhookPath = /^\/api\/dashboard\/webhooks\/([^/]+)$/.exec(path);
      if (webhookPath && req.method === "DELETE") {
        if (!requireDashboard(req, res)) return;
        const settings = currentSettings();
        const next = settings.webhooks.filter((hook) => hook.id !== webhookPath[1]);
        if (next.length === settings.webhooks.length) {
          send(res, 404, { error: "Webhook not found" });
          return;
        }
        store.saveSettings({ ...settings, webhooks: next });
        store.deleteWebhookSecret(webhookPath[1]!);
        send(res, 200, { deleted: true });
        return;
      }

      if (webhookPath && req.method === "PATCH") {
        if (!requireDashboard(req, res)) return;
        const body = await readJson(
          req,
          z.object({
            enabled: z.boolean().optional(),
            events: z.array(z.enum(["conversation.created", "message.created"])).max(4).optional(),
          }),
        );
        const settings = currentSettings();
        const hook = settings.webhooks.find((item) => item.id === webhookPath[1]);
        if (!hook) {
          send(res, 404, { error: "Webhook not found" });
          return;
        }
        if (body.enabled !== undefined) hook.enabled = body.enabled;
        if (body.events !== undefined) hook.events = body.events;
        store.saveSettings(settings);
        send(res, 200, { webhook: hook });
        return;
      }

      const webhookTest = /^\/api\/dashboard\/webhooks\/([^/]+)\/test$/.exec(path);
      if (webhookTest && req.method === "POST") {
        if (!requireDashboard(req, res)) return;
        const settings = currentSettings();
        const hook = settings.webhooks.find((item) => item.id === webhookTest[1]);
        if (!hook) {
          send(res, 404, { error: "Webhook not found" });
          return;
        }
        const [result] = await deliverEvent(
          store,
          { ...settings, webhooks: [{ ...hook, enabled: true, events: [] }], telegram: { ...settings.telegram, enabled: false } },
          {
            id: newId("evt"),
            type: "message.created",
            createdAt: new Date().toISOString(),
            data: {
              conversation: {
                id: "cnv_test",
                visitorId: "vis_test",
                status: "open",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastMessageAt: null,
                visitorName: "Test",
                visitorEmail: null,
                identifier: null,
                agentName: null,
                assigneeId: null,
                assigneeName: null,
                assigneeAvatarUrl: null,
                assignedAt: null,
                rating: null,
                ratingComment: null,
                ratedAt: null,
                metadata: {},
                unreadForAgent: 0,
                seq: 0,
              },
              message: {
                id: "msg_test",
                conversationId: "cnv_test",
                role: "visitor",
                body: "Webhook test from the Open Support dashboard.",
                attachments: [],
                createdAt: new Date().toISOString(),
              },
            },
          },
        );
        send(res, 200, { result });
        return;
      }

      if (path === "/api/dashboard/telegram" && req.method === "PUT") {
        if (!requireDashboard(req, res)) return;
        const body = await readJson(req, telegramInputSchema);
        const settings = currentSettings();
        const botToken = body.botToken ?? settings.telegram.botToken;
        const saved = store.saveSettings({
          ...settings,
          telegram: {
            enabled: body.enabled,
            botToken,
            chatId: body.chatId,
            notifyOn: body.notifyOn,
          },
        });
        settingsSchema.parse(saved);
        send(res, 200, {
          telegram: {
            enabled: saved.telegram.enabled,
            chatId: saved.telegram.chatId,
            hasBotToken: Boolean(saved.telegram.botToken),
            notifyOn: saved.telegram.notifyOn,
          },
        });
        return;
      }

      if (path === "/api/dashboard/telegram/test" && req.method === "POST") {
        if (!requireDashboard(req, res)) return;
        const telegram = currentSettings().telegram;
        if (!telegram.botToken || !telegram.chatId) {
          send(res, 400, { error: "Add a bot token and chat id first" });
          return;
        }
        const result = await checkTelegram(telegram.botToken, telegram.chatId);
        send(res, result.ok ? 200 : 502, { result });
        return;
      }

      if (path === "/api/dashboard/telegram/poll" && req.method === "POST") {
        if (!requireDashboard(req, res)) return;
        const handled = await pollTelegram(store, currentSettings());
        send(res, 200, { handled });
        return;
      }

      if (path === "/api/dashboard/ai" && req.method === "PUT") {
        if (!requireDashboard(req, res)) return;
        const body = await readJson(req, aiInputSchema);
        const settings = currentSettings();
        if (body.apiKey === "") store.deleteSecret(OPENAI_SECRET_KEY);
        else if (body.apiKey) store.setSecret(OPENAI_SECRET_KEY, body.apiKey);
        store.saveSettings({
          ...settings,
          ai: {
            ...settings.ai,
            enabled: body.enabled,
            model: body.model,
            agentName: body.agentName,
            rateLimitEnabled: body.rateLimitEnabled ?? false,
            rateLimit: body.rateLimit ?? 20,
          },
        });
        send(res, 200, { ai: settingsView().ai });
        return;
      }

      if (path === "/api/dashboard/ai/context" && req.method === "PUT") {
        if (!requireDashboard(req, res)) return;
        const body = await readJson(req, aiContextSchema);
        const settings = currentSettings();
        store.saveSettings({
          ...settings,
          ai: {
            ...settings.ai,
            context: body.context,
            actions: body.actions ? normalizeAiActions(body.actions) : settings.ai.actions,
          },
        });
        send(res, 200, { ai: settingsView().ai });
        return;
      }

      const visitorPath = /^\/api\/visitors\/([^/]+)$/.exec(path);
      if (visitorPath && req.method === "GET") {
        if (!requireInbox(req, res)) return;
        const identifier = decodeURIComponent(visitorPath[1]!);
        const conversations = store.listByIdentifier(identifier);
        if (conversations.length === 0) {
          send(res, 404, { error: "Visitor not found" });
          return;
        }
        const latest = conversations[0]!;
        const metadata: Record<string, string> = {};
        for (const conversation of [...conversations].reverse()) Object.assign(metadata, conversation.metadata);
        send(res, 200, {
          visitor: {
            identifier,
            name: latest.visitorName,
            email: latest.visitorEmail,
            metadata,
            conversationCount: conversations.length,
            openCount: conversations.filter((item) => item.status === "open").length,
            firstSeenAt: conversations.at(-1)?.createdAt ?? latest.createdAt,
            lastSeenAt: latest.updatedAt,
            conversations,
          },
        });
        return;
      }

      if (path === "/api/conversations" && req.method === "GET") {
        if (!requireInbox(req, res)) return;
        const statusParam = url.searchParams.get("status");
        const limit = url.searchParams.get("limit");
        const cursor = url.searchParams.get("cursor") ?? undefined;
        if (statusParam && statusParam !== "open" && statusParam !== "closed") {
          send(res, 400, { error: "status must be open or closed" });
          return;
        }
        const status = statusParam === "open" || statusParam === "closed" ? statusParam : undefined;
        const identifier = url.searchParams.get("identifier")?.trim() || undefined;
        if (identifier) {
          const matching = store
            .listByIdentifier(identifier)
            .filter((conversation) => (status ? conversation.status === status : true));
          send(res, 200, { conversations: matching, nextCursor: null });
          return;
        }
        const page = store.listConversations({
          status,
          limit: limit ? Number(limit) : undefined,
          cursor,
        });
        send(res, 200, page);
        return;
      }

      const conversationPath = /^\/api\/conversations\/([^/]+)$/.exec(path);
      if (conversationPath && req.method === "GET") {
        if (!requireInbox(req, res)) return;
        const conversation = store.getConversationWithMessages(conversationPath[1]!);
        if (!conversation) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        send(res, 200, { conversation });
        return;
      }

      if (conversationPath && req.method === "PATCH") {
        if (!requireInbox(req, res)) return;
        const body = await readJson(req, patchConversationSchema);
        const conversationId = conversationPath[1]!;
        if (body.status === "closed") {
          const account = sessionAccount(req);
          const ended = store.endConversation(conversationId, account?.name ?? null);
          if (!ended) {
            send(res, 404, { error: "Conversation not found" });
            return;
          }
          if (body.visitorName !== undefined || body.visitorEmail !== undefined) {
            store.updateConversation(conversationId, {
              visitorName: body.visitorName,
              visitorEmail: body.visitorEmail,
            });
          }
          send(res, 200, { conversation: store.getConversationWithMessages(conversationId) });
          return;
        }
        const updated = store.updateConversation(conversationId, body);
        if (!updated) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        send(res, 200, { conversation: updated });
        return;
      }

      const assignPath = /^\/api\/conversations\/([^/]+)\/assign$/.exec(path);
      if (assignPath && req.method === "POST") {
        if (!requireInbox(req, res)) return;
        const body = await readJson(req, assignSchema);
        const account = sessionAccount(req);
        const name = account?.name ?? body.agentName;
        if (!name) {
          send(res, 400, { error: "Sign in as an agent, or send agentName" });
          return;
        }
        const conversationId = assignPath[1];
        if (!conversationId) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        const updated = store.assignConversation(conversationId, {
          id: account?.id ?? null,
          name,
          avatarUrl: account?.avatarUrl ?? null,
        });
        if (!updated) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        send(res, 200, { conversation: store.getConversationWithMessages(updated.id) });
        return;
      }

      const readPath = /^\/api\/conversations\/([^/]+)\/read$/.exec(path);
      if (readPath && req.method === "POST") {
        if (!requireInbox(req, res)) return;
        const readConversationId = readPath[1];
        if (!readConversationId) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        const updated = store.markRead(readConversationId);
        if (!updated) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        send(res, 200, { conversation: updated });
        return;
      }

      const agentMessages = /^\/api\/conversations\/([^/]+)\/messages$/.exec(path);
      if (agentMessages && req.method === "POST") {
        if (!requireInbox(req, res)) return;
        const conversationId = agentMessages[1];
        if (!conversationId) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        const body = await readJson(req, agentMessageSchema);
        try {
          const message = store.addMessage(conversationId, {
            role: "agent",
            body: messageBody(body.body, body.attachmentIds),
            agentName: body.agentName,
            attachments: takeAttachments(pendingAttachments, conversationId, body.attachmentIds),
          });
          send(res, 201, { message });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to post message";
          send(res, message.includes("not found") ? 404 : 400, { error: message });
        }
        return;
      }

      const agentListMessages = /^\/api\/conversations\/([^/]+)\/messages$/.exec(path);
      if (agentListMessages && req.method === "GET") {
        if (!requireInbox(req, res)) return;
        const conversation = store.getConversation(agentListMessages[1]!);
        if (!conversation) {
          send(res, 404, { error: "Conversation not found" });
          return;
        }
        const after = url.searchParams.get("after") ?? undefined;
        const cursor = url.searchParams.get("cursor") ?? undefined;
        const limit = url.searchParams.get("limit");
        const page = store.listMessages(conversation.id, {
          after,
          cursor,
          limit: limit ? Number(limit) : undefined,
        });
        send(res, 200, page);
        return;
      }

      if (req.method === "GET") {
        const file = dashboardFile(path);
        if (file) {
          res.writeHead(200, { "content-type": file.type, "cache-control": file.cacheControl, "content-length": file.body.length });
          res.end(file.body);
          return;
        }
        if (
          path === "/" ||
          path === "/inbox" ||
          (DASHBOARD_PAGES as readonly string[]).includes(path) ||
          path.startsWith("/settings/")
        ) {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          res.end(dashboardMissingHtml());
          return;
        }
      }

      send(res, 404, { error: "Not found" });
    } catch (error) {
      const statusCode =
        typeof error === "object" && error && "statusCode" in error
          ? Number((error as { statusCode: number }).statusCode)
          : 500;
      const message = error instanceof Error ? error.message : "Internal error";
      if (statusCode >= 500) {
        console.error(error);
      }
      send(res, statusCode, { error: statusCode >= 500 ? "Internal error" : message });
    }
  });

  return {
    server,
    store,
    config,
    generatedAdminKey,
    close: () =>
      new Promise((resolveClose, reject) => {
        clearInterval(telegramTimer);
        uploads.close();
        server.close((error) => {
          store.close();
          if (error) reject(error);
          else resolveClose();
        });
      }),
  };
}

/** Secure when the public URL is HTTPS, including Railway's proxy. Local HTTP stays unsigned so the desk still signs in. */
function cookieSecure(req: IncomingMessage): boolean {
  if (process.env.COOKIE_SECURE === "1") return true;
  if (process.env.COOKIE_SECURE === "0") return false;
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return proto === "https";
}

function sessionCookie(req: IncomingMessage, assignment: string, maxAge: number): string {
  const secure = cookieSecure(req) ? "; Secure" : "";
  return `${assignment}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function keysMatch(presented: string | undefined, expected: string): boolean {
  if (!presented || presented.length !== expected.length) return false;
  return safeEqual(presented, expected);
}

function authorizeVisitor(
  store: SupportStore,
  conversationId: string,
  token: string | undefined,
  res: ServerResponse,
) {
  if (!token) {
    send(res, 401, { error: "Missing visitor token" });
    return null;
  }
  const conversation = store.getConversationByVisitorToken(token);
  if (!conversation || conversation.id !== conversationId) {
    send(res, 401, { error: "Invalid visitor token" });
    return null;
  }
  return conversation;
}

async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  uploads: UploadStore,
  pending: Map<string, { conversationId: string; attachment: Attachment }>,
  conversationId: string,
): Promise<void> {
  const uploadId = headerValue(req, "x-upload-id");
  if (!uploadId) {
    const size = Number(headerValue(req, "x-file-size"));
    const file = prepareUpload(headerValue(req, "x-filename") || "attachment", headerValue(req, "x-file-type"), size);
    const started = uploads.begin(conversationId, file);
    send(res, 201, { uploadId: started.id, chunkSize: started.chunkSize, chunkCount: started.chunkCount });
    return;
  }
  const indexHeader = headerValue(req, "x-chunk-index");
  if (indexHeader !== "") {
    const bytes = await readBody(req, UPLOAD_CHUNK_BYTES);
    const progress = await uploads.writeChunk(uploadId, conversationId, Number(indexHeader), bytes);
    send(res, 200, progress);
    return;
  }
  const attachment = uploads.finish(uploadId, conversationId);
  pending.set(attachment.id, { conversationId, attachment });
  send(res, 201, { attachment });
}

function takeAttachments(
  pending: Map<string, { conversationId: string; attachment: Attachment }>,
  conversationId: string,
  ids: string[] | undefined,
): Attachment[] {
  if (!ids?.length) return [];
  return ids.map((id) => {
    const held = pending.get(id);
    if (!held || held.conversationId !== conversationId) {
      throw Object.assign(new Error("Attachment not found"), { statusCode: 400 });
    }
    const parsed = attachmentSchema.parse(held.attachment);
    pending.delete(id);
    return parsed;
  });
}

function messageBody(body: string | undefined, attachmentIds: string[] | undefined): string {
  const text = (body ?? "").trim();
  if (!text && !attachmentIds?.length) {
    throw Object.assign(new Error("Write a message or attach a file"), { statusCode: 400 });
  }
  return text;
}

function widgetScript(_config: ServerConfig): string {
  return `/* Open Support Bubble loader. The React package mounts the full chat UI. */
(function () {
  if (window.__openSupportBubble) return;
  window.__openSupportBubble = true;
  var root = document.createElement("div");
  root.id = "open-support-bubble-root";
  document.body.appendChild(root);
  var script = document.currentScript;
  var server = (script && script.src) ? script.src.replace(/\\/widget\\.js.*$/, "") : "";
  fetch(server + "/api/widget/config").then(function (r) { return r.json(); }).then(function (cfg) {
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Open support chat");
    button.textContent = "?";
    button.style.cssText = "position:fixed;left:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;border-radius:999px;border:0;background:" + cfg.accentColor + ";color:#fff;font:600 22px/56px ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18)";
    button.addEventListener("click", function () {
      window.dispatchEvent(new CustomEvent("open-support:toggle"));
    });
    root.appendChild(button);
  }).catch(function (err) {
    console.error("[open-support] failed to load config", err);
  });
})();
`;
}



