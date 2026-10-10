import { createHmac } from "node:crypto";
import type { SupportStore } from "./db.js";
import type { Conversation, Message, ServerSettings, WebhookEvent } from "./types.js";

export interface NotifyPayload {
  id: string;
  type: WebhookEvent;
  createdAt: string;
  data: {
    conversation: Conversation;
    message?: Message;
  };
}

export interface DeliveryResult {
  target: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface DeliveryDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Public origin of this desk, such as https://support.example.com. No trailing slash. */
  dashboardOrigin?: string;
}

const TELEGRAM_OFFSET_KEY = "telegram:offset";

export async function deliverEvent(
  store: SupportStore,
  settings: ServerSettings,
  event: NotifyPayload,
  deps: DeliveryDeps = {},
): Promise<DeliveryResult[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const results: DeliveryResult[] = [];

  for (const hook of settings.webhooks) {
    if (!hook.enabled) continue;
    if (hook.events.length > 0 && !hook.events.includes(event.type)) continue;
    const secret = store.webhookSecret(hook.id);
    results.push(await postWebhook(fetchImpl, hook.url, secret, event));
  }

  if (
    settings.telegram.enabled &&
    settings.telegram.botToken &&
    settings.telegram.chatId &&
    settings.telegram.notifyOn.includes(event.type)
  ) {
    results.push(
      await postTelegram(
        fetchImpl,
        settings.telegram.botToken,
        settings.telegram.chatId,
        formatTelegram(event, deps.dashboardOrigin),
      ),
    );
  }

  return results;
}

export function signBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function postWebhook(
  fetchImpl: typeof fetch,
  url: string,
  secret: string | null,
  event: NotifyPayload,
): Promise<DeliveryResult> {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "open-support-bubble",
    "x-open-support-event": event.type,
  };
  if (secret) headers["x-open-support-signature"] = `sha256=${signBody(secret, body)}`;
  try {
    const response = await fetchImpl(url, { method: "POST", headers, body });
    const ok = response.status >= 200 && response.status < 300;
    return { target: url, ok, status: response.status, error: ok ? undefined : `HTTP ${response.status}` };
  } catch (error) {
    return { target: url, ok: false, error: error instanceof Error ? error.message : "Request failed" };
  }
}

/** Desk URL that opens this conversation. The id stays on its own line so a Telegram reply can still quote it. */
export function conversationLink(origin: string, conversationId: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/inbox/${encodeURIComponent(conversationId)}`;
}

export function formatTelegram(event: NotifyPayload, dashboardOrigin?: string): string {
  const who = event.data.conversation.visitorName || event.data.conversation.visitorEmail || "Visitor";
  const body = event.data.message?.body ?? "";
  const id = event.data.conversation.id;
  const link = dashboardOrigin ? conversationLink(dashboardOrigin, id) : "";
  if (event.type === "conversation.created") {
    return link ? `New conversation from ${who}\n${link}\n\n${id}` : `New conversation from ${who}\n${id}`;
  }
  const role = event.data.message?.role ?? "visitor";
  return `${who} (${role})\n${body}\n\nReply to this chat to respond.\n${id}`;
}

async function postTelegram(
  fetchImpl: typeof fetch,
  botToken: string,
  chatId: string,
  text: string,
): Promise<DeliveryResult> {
  const target = `telegram:${chatId}`;
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    return {
      target,
      ok: response.ok && payload.ok !== false,
      status: response.status,
      error: payload.ok === false ? payload.description : undefined,
    };
  } catch (error) {
    return { target, ok: false, error: error instanceof Error ? error.message : "Request failed" };
  }
}

export async function checkTelegram(
  botToken: string,
  chatId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryResult> {
  return postTelegram(fetchImpl, botToken, chatId, "Open Support is connected. Replies in this chat are posted to the latest visitor.");
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id?: number | string };
    reply_to_message?: { text?: string };
  };
}

/** Pulls Telegram replies and posts them into the conversation id mentioned in the quoted message. */
export async function pollTelegram(store: SupportStore, settings: ServerSettings, deps: DeliveryDeps = {}): Promise<number> {
  if (!settings.telegram.enabled || !settings.telegram.botToken || !settings.telegram.chatId) return 0;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const offset = Number(store.getSecret(TELEGRAM_OFFSET_KEY) ?? "0");
  const response = await fetchImpl(
    `https://api.telegram.org/bot${settings.telegram.botToken}/getUpdates?timeout=0&offset=${offset}`,
  );
  if (!response.ok) return 0;
  const payload = (await response.json()) as { ok?: boolean; result?: TelegramUpdate[] };
  if (!payload.ok || !payload.result) return 0;
  let handled = 0;
  let nextOffset = offset;
  for (const update of payload.result) {
    nextOffset = update.update_id + 1;
    const text = update.message?.text?.trim();
    const chatId = update.message?.chat?.id != null ? String(update.message.chat.id) : "";
    if (!text || chatId !== settings.telegram.chatId || text.startsWith("/")) continue;
    const quoted = update.message?.reply_to_message?.text ?? "";
    const match = quoted.match(/cnv_[a-f0-9]+/);
    const conversationId = match?.[0];
    const conversation = conversationId ? store.getConversation(conversationId) : null;
    if (!conversation || (!conversation.assigneeId && !conversation.assigneeName)) continue;
    store.addMessage(conversationId!, { role: "agent", body: text, agentName: "Telegram" });
    handled += 1;
  }
  if (payload.result.length > 0) store.setSecret(TELEGRAM_OFFSET_KEY, String(nextOffset));
  return handled;
}
