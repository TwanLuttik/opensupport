import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApiToken, parseApiToken, sha256 } from "./crypto.js";
import { SupportStore } from "./db.js";

function memoryStore(): SupportStore {
  return new SupportStore(":memory:");
}

test("creates a conversation and resumes it with the visitor token", () => {
  const store = memoryStore();
  const created = store.createConversation({ visitorName: "Ada" }, "visitor-secret");
  assert.equal(created.conversation.visitorName, "Ada");
  assert.equal(store.getConversationByVisitorToken("visitor-secret")?.id, created.conversation.id);
  assert.equal(store.getConversationByVisitorToken("nope"), null);
  store.close();
});

test("visitor messages bump unread and agent replies clear it", () => {
  const store = memoryStore();
  const created = store.createConversation({}, "secret");
  store.addMessage(created.conversation.id, { role: "system", body: "Hi" });
  store.addMessage(created.conversation.id, { role: "visitor", body: "Help" });
  assert.equal(store.getConversation(created.conversation.id)?.unreadForAgent, 1);
  store.addMessage(created.conversation.id, { role: "agent", body: "On it", agentName: "Sam" });
  const messages = store.listMessages(created.conversation.id).messages;
  assert.equal(store.getConversation(created.conversation.id)?.agentName, "Sam");
  assert.equal(messages.length, 3);
  assert.equal(messages[2]?.agentName, "Sam");
  assert.equal(store.getConversation(created.conversation.id)?.unreadForAgent, 0);
  store.close();
});

test("assigning a conversation records the agent and posts a system line", () => {
  const store = memoryStore();
  const created = store.createConversation({ visitorName: "Ada" }, "secret");
  assert.equal(created.conversation.assigneeName, null);
  const assigned = store.assignConversation(created.conversation.id, { id: "acc_sam", name: "Sam" });
  assert.equal(assigned?.assigneeName, "Sam");
  assert.equal(assigned?.assigneeId, "acc_sam");
  assert.ok(assigned?.assignedAt);
  const messages = store.listMessages(created.conversation.id).messages;
  assert.equal(messages.at(-1)?.role, "system");
  assert.equal(messages.at(-1)?.body, "Sam joined the conversation");
  // A join note is not an agent reply, so the ticket stays unread for the queue.
  store.addMessage(created.conversation.id, { role: "visitor", body: "Hello" });
  assert.equal(store.getConversation(created.conversation.id)?.unreadForAgent, 1);
  store.close();
});

test("conversations with the same identifier group together", () => {
  const store = memoryStore();
  const first = store.createConversation({ visitorName: "Ada", identifier: "user_42", metadata: { plan: "free" } }, "a");
  const second = store.createConversation({ visitorName: "Ada", identifier: "user_42", metadata: { plan: "pro" } }, "b");
  store.createConversation({ visitorName: "Grace", identifier: "user_7" }, "c");
  assert.equal(first.conversation.identifier, "user_42");
  const group = store.listByIdentifier("user_42");
  assert.deepEqual(group.map((conversation) => conversation.id).sort(), [first.conversation.id, second.conversation.id].sort());
  assert.equal(store.listByIdentifier("missing").length, 0);
  assert.equal(store.getConversation(second.conversation.id)?.metadata.plan, "pro");
  store.close();
});

test("closed conversations reject visitor replies", () => {
  const store = memoryStore();
  const created = store.createConversation({}, "secret");
  store.updateConversation(created.conversation.id, { status: "closed" });
  assert.throws(() => store.addMessage(created.conversation.id, { role: "visitor", body: "Still here" }), /closed/);
  store.close();
});

test("lists conversations newest first with a cursor", () => {
  const store = memoryStore();
  const first = store.createConversation({ visitorName: "First" }, "a");
  const second = store.createConversation({ visitorName: "Second" }, "b");
  store.addMessage(first.conversation.id, { role: "visitor", body: "old" });
  store.addMessage(second.conversation.id, { role: "visitor", body: "new" });
  const page = store.listConversations({ limit: 1 });
  assert.equal(page.conversations.length, 1);
  assert.equal(page.conversations[0]?.visitorName, "Second");
  assert.ok(page.nextCursor);
  const rest = store.listConversations({ limit: 1, cursor: page.nextCursor! });
  assert.equal(rest.conversations[0]?.visitorName, "First");
  assert.equal(rest.nextCursor, null);
  store.close();
});

test("pages messages in chronological order", () => {
  const store = memoryStore();
  const created = store.createConversation({}, "secret");
  store.addMessage(created.conversation.id, { role: "visitor", body: "one" });
  store.addMessage(created.conversation.id, { role: "agent", body: "two", agentName: "Sam" });
  store.addMessage(created.conversation.id, { role: "visitor", body: "three" });
  const page = store.listMessages(created.conversation.id, { limit: 2 });
  assert.deepEqual(page.messages.map((message) => message.body), ["one", "two"]);
  assert.ok(page.nextCursor);
  const rest = store.listMessages(created.conversation.id, { limit: 2, cursor: page.nextCursor! });
  assert.deepEqual(rest.messages.map((message) => message.body), ["three"]);
  assert.equal(rest.nextCursor, null);
  store.close();
});

test("account passwords authenticate and a disabled account cannot", () => {
  const store = memoryStore();
  const account = store.createAccount({ email: "Ada@Example.com", name: "Ada", role: "admin", password: "correct horse" });
  assert.equal(store.getAccountByEmail("ada@example.com")?.id, account.id);
  assert.equal(store.authenticateAccount("ada@example.com", "correct horse")?.name, "Ada");
  assert.equal(store.authenticateAccount("ada@example.com", "nope"), null);
  store.setAccountDisabled(account.id, true);
  assert.equal(store.authenticateAccount("ada@example.com", "correct horse"), null);
  store.setAccountDisabled(account.id, false);
  store.setAccountPassword(account.id, "new password!");
  assert.equal(store.authenticateAccount("ada@example.com", "correct horse"), null);
  assert.equal(store.authenticateAccount("ada@example.com", "new password!")?.id, account.id);
  store.close();
});

test("staff are online only while someone recent has not stepped away", () => {
  const store = memoryStore();
  assert.equal(store.staffOnline(), false);
  const ada = store.createAccount({ email: "ada@example.com", name: "Ada", role: "agent", password: "secret" });
  assert.equal(store.getAccount(ada.id)?.presence, "online");
  assert.equal(store.staffOnline(), false);
  store.touchAccount(ada.id);
  assert.equal(store.staffOnline(), true);
  store.setAccountPresence(ada.id, "away");
  assert.equal(store.staffOnline(), false);
  store.setAccountPresence(ada.id, "online");
  assert.equal(store.staffOnline(), true);
  const stale = new Date(Date.now() - 60_000).toISOString();
  store.db.prepare("UPDATE accounts SET last_seen_at = ? WHERE id = ?").run(stale, ada.id);
  assert.equal(store.staffOnline(), false);
  store.close();
});

test("api tokens round-trip and can be revoked", () => {
  const store = memoryStore();
  const created = createApiToken();
  store.insertApiToken({
    id: created.id,
    name: "Zapier",
    tokenHash: created.secretHash,
    tokenPrefix: created.prefix,
    createdAt: new Date().toISOString(),
  });
  const parsed = parseApiToken(`Bearer ${created.token}`);
  assert.ok(parsed);
  assert.equal(parsed?.id, created.id);
  assert.equal(store.getApiToken(created.id)?.tokenHash, sha256(parsed!.secret));
  assert.equal(store.revokeApiToken(created.id), true);
  assert.ok(store.getApiToken(created.id)?.revokedAt);
  store.close();
});

test("opens a database created before the identifier column existed", () => {
  const dir = mkdtempSync(join(tmpdir(), "osb-old-"));
  const path = join(dir, "support.db");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL UNIQUE,
      visitor_token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      visitor_name TEXT,
      visitor_email TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT,
      unread_for_agent INTEGER NOT NULL DEFAULT 0,
      seq INTEGER NOT NULL
    );
  `);
  legacy.close();
  const store = new SupportStore(path);
  const created = store.createConversation({ identifier: "user_42", visitorName: "Ada" }, "secret");
  assert.equal(store.listByIdentifier("user_42")[0]?.id, created.conversation.id);
  store.close();
});

test("persists to a file", () => {
  const dir = mkdtempSync(join(tmpdir(), "osb-"));
  const path = join(dir, "nested", "support.db");
  const store = new SupportStore(path);
  const created = store.createConversation({ visitorEmail: "a@b.co" }, "secret");
  store.close();
  const again = new SupportStore(path);
  assert.equal(again.getConversation(created.conversation.id)?.visitorEmail, "a@b.co");
  again.close();
});
