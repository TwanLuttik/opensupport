import assert from "node:assert/strict";
import test from "node:test";
import { buildAiMessages, completeOpenAi, isOpenAiModel, splitAiActions } from "./ai.js";
import { DEFAULT_AI } from "./settings.js";
import type { Message } from "./types.js";

function message(role: Message["role"], body: string): Message {
  return {
    id: `msg_${body}`,
    conversationId: "cnv_1",
    role,
    body,
    attachments: [],
    createdAt: "2026-04-16T12:00:00.000Z",
  };
}

test("known OpenAI models are accepted and others are not", () => {
  assert.equal(isOpenAiModel("gpt-4.1-nano"), true);
  assert.equal(isOpenAiModel("gpt-4o-mini"), true);
  assert.equal(isOpenAiModel("gpt-4o"), true);
  assert.equal(isOpenAiModel("claude-3"), false);
});

test("knowledge becomes the system prompt and only visitor and agent lines are sent", () => {
  const turns = buildAiMessages(
    { ...DEFAULT_AI, agentName: "Ada Bot", context: "Ships in 3 days." },
    [message("system", "Waiting"), message("visitor", "When do you ship?"), message("agent", "Checking")],
  );
  assert.equal(turns[0]?.role, "system");
  assert.match(turns[0]?.content ?? "", /Ada Bot/);
  assert.match(turns[0]?.content ?? "", /Ships in 3 days/);
  assert.deepEqual(turns.slice(1), [
    { role: "user", content: "When do you ship?" },
    { role: "assistant", content: "Checking" },
  ]);
});

test("configured actions are explained in the system prompt", () => {
  const turns = buildAiMessages(
    {
      ...DEFAULT_AI,
      actions: [
        { id: 1, label: "Plan", description: "Returns the signed-in visitor's plan and renewal date." },
        { id: 2, label: "Orders", description: "Returns the visitor's latest order." },
      ],
    },
    [message("visitor", "When does my plan renew?")],
  );
  assert.match(turns[0]?.content ?? "", /you must ask for it/);
  assert.match(turns[0]?.content ?? "", /%%\[id,id\]%%/);
  assert.match(turns[0]?.content ?? "", /1: Returns the signed-in visitor's plan/);
  assert.match(turns[0]?.content ?? "", /2: Returns the visitor's latest order/);
  assert.doesNotMatch(turns[0]?.content ?? "", /^Plan:/m);
});

test("a trailing action caller is removed and unknown ids are dropped", () => {
  const actions = [{ id: 1, label: "Plan", description: "Plan details." }];
  assert.deepEqual(splitAiActions("I need your plan to answer that.\n%%[1, 9]%%", actions), {
    body: "I need your plan to answer that.",
    actionIds: [1],
  });
  assert.deepEqual(splitAiActions("Ships in 3 days.", actions), { body: "Ships in 3 days.", actionIds: [] });
  assert.deepEqual(splitAiActions("A discount is %%[1]%% off.", actions), { body: "A discount is %%[1]%% off.", actionIds: [] });
});

test("an OpenAI error becomes a failed reply", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 });
  await assert.rejects(
    () => completeOpenAi({ apiKey: "sk-bad", model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] }, fetchImpl),
    /Incorrect API key/,
  );
});

test("a completion returns the assistant text", async () => {
  let auth = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    auth = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content: "  Ships in 3 days.  " } }] }), { status: 200 });
  };
  const reply = await completeOpenAi(
    { apiKey: "sk-test", model: "gpt-4o-mini", messages: [{ role: "user", content: "When?" }] },
    fetchImpl,
  );
  assert.equal(auth, "Bearer sk-test");
  assert.equal(reply.body, "Ships in 3 days.");
  assert.ok(reply.promptTokens > 0);
  assert.ok(reply.completionTokens > 0);
});

test("reported usage is kept instead of the estimate", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "Yes" } }], usage: { prompt_tokens: 1200, completion_tokens: 4 } }), { status: 200 });
  const reply = await completeOpenAi({ apiKey: "sk-test", model: "gpt-4.1-nano", messages: [{ role: "user", content: "Hi" }] }, fetchImpl);
  assert.equal(reply.promptTokens, 1200);
  assert.equal(reply.completionTokens, 4);
});
