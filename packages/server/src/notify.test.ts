import assert from "node:assert/strict";
import test from "node:test";
import { SupportStore } from "./db.js";
import { deliverEvent, formatTelegram, pollTelegram, signBody } from "./notify.js";
import { defaultSettings } from "./settings.js";
import type { PublicConfig, ServerSettings } from "./types.js";

const widget: PublicConfig = {
  title: "Support",
  subtitle: "Hi",
  accentColor: "#111827",
  theme: {
    id: "ink",
    colors: {
      accent: "#111827",
      accentText: "#ffffff",
      header: "#111827",
      headerText: "#ffffff",
      panel: "#ffffff",
      canvas: "#f4f5f7",
      ink: "#16181d",
      muted: "#6d727c",
      agentBubble: "#ffffff",
      composer: "#ffffff",
    },
  },
  placeholder: "Write",
  greeting: "Hello",
};

function storeWithConversation() {
  const store = new SupportStore(":memory:");
  const created = store.createConversation({ visitorName: "Ada" }, "secret");
  const message = store.addMessage(created.conversation.id, { role: "visitor", body: "The button is broken" });
  return { store, created, message };
}

test("signs webhook bodies and skips disabled endpoints", async () => {
  const { store, created, message } = storeWithConversation();
  const calls: Array<{ url: string; headers: Headers; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: String(init?.body) });
    return new Response(null, { status: 204 });
  };
  const settings: ServerSettings = {
    ...defaultSettings(widget, "*"),
    webhooks: [
      { id: "wh_off", url: "https://hooks.example/off", events: [], enabled: false, createdAt: "t" },
      { id: "wh_on", url: "https://hooks.example/on", events: ["message.created"], enabled: true, createdAt: "t" },
    ],
  };
  store.setWebhookSecret("wh_on", "topsecret");
  const results = await deliverEvent(
    store,
    settings,
    {
      id: "evt_1",
      type: "message.created",
      createdAt: "t",
      data: { conversation: created.conversation, message },
    },
    { fetchImpl },
  );
  assert.equal(results.length, 1);
  assert.equal(results[0]?.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://hooks.example/on");
  assert.equal(calls[0]?.headers.get("x-open-support-signature"), `sha256=${signBody("topsecret", calls[0]!.body)}`);
  store.close();
});

test("telegram replies quote the conversation id and become agent messages", async () => {
  const { store, created } = storeWithConversation();
  store.setSecret("telegram:offset", "0");
  const settings = defaultSettings(widget, "*");
  settings.telegram = { enabled: true, botToken: "123:abc", chatId: "42", notifyOn: ["message.created"] };
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        result: [
          {
            update_id: 7,
            message: {
              text: "On it",
              chat: { id: 42 },
              reply_to_message: { text: formatTelegram({
                id: "evt",
                type: "message.created",
                createdAt: "t",
                data: {
                  conversation: created.conversation,
                  message: { id: "m", conversationId: created.conversation.id, role: "visitor", body: "Hi", attachments: [], createdAt: "t" },
                },
              }) },
            },
          },
        ],
      }),
      { status: 200 },
    );
  const handled = await pollTelegram(store, settings, { fetchImpl });
  assert.equal(handled, 1);
  const messages = store.listMessages(created.conversation.id).messages;
  assert.equal(messages.at(-1)?.body, "On it");
  assert.equal(messages.at(-1)?.agentName, "Telegram");
  assert.equal(store.getSecret("telegram:offset"), "8");
  store.close();
});
