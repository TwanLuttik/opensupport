import assert from "node:assert/strict";
import test from "node:test";
import { createClient, loadStoredSession, readSession, sessionStorageKey, writeSession } from "./client.js";

test("session helpers round-trip and ignore junk", () => {
  const bag = new Map<string, string>();
  const storage = {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
  assert.equal(readSession(storage, "http://localhost:8787/"), null);
  writeSession(storage, "http://localhost:8787/", {
    conversationId: "cnv_1",
    visitorToken: "secret",
  });
  assert.equal(bag.has(sessionStorageKey("http://localhost:8787")), true);
  assert.deepEqual(readSession(storage, "http://localhost:8787"), {
    conversationId: "cnv_1",
    visitorToken: "secret",
  });
  storage.setItem(sessionStorageKey("http://localhost:8787"), "{");
  assert.equal(readSession(storage, "http://localhost:8787"), null);
});

test("loadStoredSession stays empty outside the browser", () => {
  assert.equal(typeof window, "undefined");
  assert.equal(loadStoredSession("http://localhost:8787"), null);
});

test("client posts a visitor message with the session header", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ message: { id: "msg_1", body: "Hi" } }), { status: 201 });
  };
  const client = createClient("http://localhost:8787/", fetchImpl);
  const message = await client.send({ conversationId: "cnv_1", visitorToken: "secret" }, "Hi");
  assert.equal(message.id, "msg_1");
  assert.equal(calls[0]?.url, "http://localhost:8787/api/widget/conversations/cnv_1/messages");
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.equal(headers["x-visitor-token"], "secret");
  assert.equal(calls[0]?.init?.body, JSON.stringify({ body: "Hi" }));
});

test("client closes a conversation as the visitor", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ conversation: { id: "cnv_1", status: "closed" } }), { status: 200 });
  };
  const client = createClient("http://localhost:8787", fetchImpl);
  const conversation = await client.close({ conversationId: "cnv_1", visitorToken: "secret" });
  assert.equal(conversation.status, "closed");
  assert.equal(calls[0]?.url, "http://localhost:8787/api/widget/conversations/cnv_1");
  assert.equal(calls[0]?.init?.method, "PATCH");
  assert.equal(calls[0]?.init?.body, JSON.stringify({ status: "closed" }));
});

test("client uploads a file in 5 MB chunks and reports progress", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const headers = new Headers(init?.headers);
    if (!headers.get("x-upload-id")) {
      return new Response(JSON.stringify({ uploadId: "abc", chunkSize: 5, chunkCount: 2 }), { status: 201 });
    }
    if (headers.get("x-chunk-index")) {
      return new Response(JSON.stringify({ received: Number(headers.get("x-chunk-index")) + 1, total: 2 }), { status: 200 });
    }
    return new Response(JSON.stringify({ attachment: { id: "abc", name: "a.txt", mimeType: "text/plain", size: 8, url: "/uploads/abc.txt" } }), { status: 201 });
  };
  const progress: number[] = [];
  const client = createClient("http://localhost:8787", fetchImpl);
  const attachment = await client.upload(
    { conversationId: "cnv_1", visitorToken: "secret" },
    { name: "a.txt", type: "text/plain", bytes: new TextEncoder().encode("abcdefgh") },
    (loaded) => progress.push(loaded),
  );
  assert.equal(attachment.url, "/uploads/abc.txt");
  assert.deepEqual(progress, [0, 5, 8]);
  assert.equal(calls.length, 4);
  const start = new Headers(calls[0]?.init?.headers);
  assert.equal(start.get("x-visitor-token"), "secret");
  assert.equal(start.get("x-filename"), "a.txt");
  assert.equal(start.get("x-file-size"), "8");
  assert.equal(new Headers(calls[1]?.init?.headers).get("x-chunk-index"), "0");
  assert.equal(calls[1]?.init?.method, "PUT");
});

test("client marks a message that came from an action button", async () => {
  let body = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ message: { id: "msg_1", actionLabel: "Share my plan" } }), { status: 201 });
  };
  const client = createClient("http://localhost:8787", fetchImpl);
  await client.send({ conversationId: "cnv_1", visitorToken: "secret" }, "{\"plan\":\"pro\"}", undefined, "Share my plan");
  assert.equal(body, JSON.stringify({ body: "{\"plan\":\"pro\"}", actionLabel: "Share my plan" }));
});

test("client sends attachment ids with a message", async () => {
  let body = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ message: { id: "msg_1" } }), { status: 201 });
  };
  const client = createClient("http://localhost:8787", fetchImpl);
  await client.send({ conversationId: "cnv_1", visitorToken: "secret" }, "See file", ["abc"]);
  assert.equal(body, JSON.stringify({ body: "See file", attachmentIds: ["abc"] }));
});

test("client starts an AI conversation and asks for a reply", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/ai")) {
      return new Response(JSON.stringify({ message: { id: "msg_ai", role: "agent", body: "Ships in 3 days" } }), { status: 201 });
    }
    return new Response(JSON.stringify({ conversation: { id: "cnv_1" }, visitorToken: "secret", messages: [] }), { status: 201 });
  };
  const client = createClient("http://localhost:8787", fetchImpl);
  await client.start({ handler: "ai", visitorName: "Ada" });
  assert.equal(calls[0]?.init?.body, JSON.stringify({ handler: "ai", visitorName: "Ada" }));
  const reply = await client.askAi({ conversationId: "cnv_1", visitorToken: "secret" });
  assert.equal(reply.body, "Ships in 3 days");
  assert.equal(calls[1]?.url, "http://localhost:8787/api/widget/conversations/cnv_1/ai");
  assert.equal(new Headers(calls[1]?.init?.headers).get("x-visitor-token"), "secret");
});

test("client surfaces server errors", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403 });
  const client = createClient("http://localhost:8787", fetchImpl);
  await assert.rejects(() => client.getConfig(), /Origin not allowed/);
});
