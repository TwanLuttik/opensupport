import assert from "node:assert/strict";
import test from "node:test";
import { OpenSupport, OpenSupportError } from "./client.js";

function fakeFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }): typeof fetch {
  return (async (input, init) => {
    const result = handler(String(input), init);
    return new Response(JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
}

test("sends the token and maps a conversation page", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenSupport({
    serverUrl: "http://localhost:8787/",
    token: "osb_live_tok_abc.secret",
    fetch: fakeFetch((url, init) => {
      calls.push({ url, init });
      return { status: 200, body: { conversations: [{ id: "cnv_1" }], nextCursor: "2026-01-01T00:00:00.000Z|1" } };
    }),
  });
  const page = await client.listConversations({ status: "open", limit: 10, cursor: "2025-01-01T00:00:00.000Z|4" });
  assert.equal(page.items[0]?.id, "cnv_1");
  assert.equal(page.nextCursor, "2026-01-01T00:00:00.000Z|1");
  assert.equal(
    calls[0]?.url,
    "http://localhost:8787/api/conversations?status=open&limit=10&cursor=2025-01-01T00%3A00%3A00.000Z%7C4",
  );
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer osb_live_tok_abc.secret");
});

test("pages messages and posts a reply", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenSupport({
    serverUrl: "https://support.example.com",
    token: "osb_live_tok_abc.secret",
    fetch: fakeFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === "POST") return { status: 201, body: { message: { id: "msg_2", body: "On it" } } };
      return { status: 200, body: { messages: [{ id: "msg_1", body: "Hi" }], nextCursor: null } };
    }),
  });
  const page = await client.listMessages("cnv 1", { limit: 20 });
  assert.equal(page.items[0]?.id, "msg_1");
  assert.equal(page.nextCursor, null);
  assert.equal(calls[0]?.url, "https://support.example.com/api/conversations/cnv%201/messages?limit=20");

  const sent = await client.sendMessage("cnv 1", { body: "On it", agentName: "Sam" });
  assert.equal(sent.id, "msg_2");
  assert.equal(calls[1]?.init?.body, JSON.stringify({ body: "On it", agentName: "Sam" }));
});

test("assigns a conversation with an agent name", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenSupport({
    serverUrl: "http://localhost:8787",
    token: "osb_live_tok_abc.secret",
    fetch: fakeFetch((url, init) => {
      calls.push({ url, init });
      return {
        status: 200,
        body: {
          conversation: {
            id: "cnv_1",
            assigneeName: "Sam",
            messages: [{ id: "msg_9", body: "Sam joined the conversation" }],
          },
        },
      };
    }),
  });
  const conversation = await client.assignConversation("cnv_1", { agentName: "Sam" });
  assert.equal(conversation.assigneeName, "Sam");
  assert.equal("messages" in conversation, false);
  assert.equal(calls[0]?.url, "http://localhost:8787/api/conversations/cnv_1/assign");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.body, JSON.stringify({ agentName: "Sam" }));
});

test("uploads a file in chunks and closes the ticket", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenSupport({
    serverUrl: "http://localhost:8787",
    token: "osb_live_tok_abc.secret",
    fetch: fakeFetch((url, init) => {
      calls.push({ url, init });
      const headers = new Headers(init?.headers);
      if (init?.method === "PATCH") return { status: 200, body: { conversation: { id: "cnv_1", status: "closed" } } };
      if (String(url).endsWith("/messages")) return { status: 201, body: { message: { id: "msg_3", body: "See file" } } };
      if (!headers.get("x-upload-id")) {
        return { status: 201, body: { uploadId: "abc", chunkSize: 5, chunkCount: 2 } };
      }
      if (headers.get("x-chunk-index")) return { status: 200, body: { received: 1, total: 2 } };
      return { status: 201, body: { attachment: { id: "abc", name: "a.txt", mimeType: "text/plain", size: 8, url: "/uploads/abc.txt" } } };
    }),
  });
  const attachment = await client.uploadFile("cnv_1", {
    name: "a.txt",
    type: "text/plain",
    bytes: new TextEncoder().encode("abcdefgh"),
  });
  assert.equal(attachment.id, "abc");
  assert.equal(calls.length, 4);
  assert.equal(calls[1]?.init?.method, "PUT");
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-file-size"), "8");
  const sent = await client.sendMessage("cnv_1", { body: "See file", attachmentIds: [attachment.id] });
  assert.equal(sent.id, "msg_3");
  assert.equal(calls[4]?.init?.body, JSON.stringify({ body: "See file", attachmentIds: ["abc"] }));
  const closed = await client.closeConversation("cnv_1");
  assert.equal(closed.status, "closed");
  assert.equal(calls.at(-1)?.init?.method, "PATCH");
  assert.equal(calls.at(-1)?.init?.body, JSON.stringify({ status: "closed" }));
});

test("surfaces the server error", async () => {
  const client = new OpenSupport({
    serverUrl: "http://localhost:8787",
    token: "bad",
    fetch: fakeFetch(() => ({ status: 401, body: { error: "Invalid API token" } })),
  });
  await assert.rejects(() => client.listConversations(), (error: unknown) => {
    assert.ok(error instanceof OpenSupportError);
    assert.equal(error.status, 401);
    assert.match(error.message, /Invalid API token/);
    return true;
  });
});
