import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Account,
  AccountRole,
  AiUsageEntry,
  AiUsageSummary,
  DeskStats,
  ApiTokenRecord,
  Attachment,
  Conversation,
  ConversationStatus,
  ConversationWithMessages,
  Message,
  ReviewSummary,
  PageVisit,
  PublicConfig,
  ServerSettings,
} from "./types.js";
import { hashPassword, newId, sha256, verifyPassword } from "./crypto.js";
import { estimateCost } from "./pricing.js";
import { defaultSettings, normalizeWidget, settingsSchema } from "./settings.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL UNIQUE,
  visitor_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  visitor_name TEXT,
  visitor_email TEXT,
  identifier TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT,
  unread_for_agent INTEGER NOT NULL DEFAULT 0,
  agent_name TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  assigned_at TEXT,
  seq INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  body TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  agent_name TEXT,
  created_at TEXT NOT NULL,
  seq INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_conversation_created
  ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  account_id TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS page_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS page_visits_conversation
  ON page_visits (conversation_id, id);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_usage_created
  ON ai_usage (created_at);
`;

export interface CreateConversationInput {
  visitorName?: string | null;
  visitorEmail?: string | null;
  /** Stable id from the embedding app. Groups this person's conversations. */
  identifier?: string | null;
  metadata?: Record<string, string>;
}

export interface CreatedConversation {
  conversation: Conversation;
  /** Returned once. The visitor client stores this to resume the thread. */
  visitorToken: string;
}

export interface PostMessageInput {
  role: Message["role"];
  body: string;
  attachments?: Attachment[];
  agentName?: string;
  /** Action ids requested by an AI reply. Omitted for ordinary messages. */
  actionIds?: number[];
  /** Button label when a visitor message was sent by an action. */
  actionLabel?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    visitorId: String(row.visitor_id),
    status: row.status as ConversationStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    visitorName: row.visitor_name ? String(row.visitor_name) : null,
    visitorEmail: row.visitor_email ? String(row.visitor_email) : null,
    identifier: row.identifier ? String(row.identifier) : null,
    agentName: row.agent_name ? String(row.agent_name) : null,
    assigneeId: row.assignee_id ? String(row.assignee_id) : null,
    assigneeName: row.assignee_name ? String(row.assignee_name) : null,
    assigneeAvatarUrl: row.assignee_avatar_url ? String(row.assignee_avatar_url) : null,
    assignedAt: row.assigned_at ? String(row.assigned_at) : null,
    metadata: JSON.parse(String(row.metadata_json ?? "{}")) as Record<string, string>,
    unreadForAgent: Number(row.unread_for_agent ?? 0),
    seq: Number(row.seq ?? 0),
    rating: row.rating === "up" || row.rating === "down" || row.rating === "skipped" ? row.rating : null,
    ratingComment: row.rating_comment ? String(row.rating_comment) : null,
    ratedAt: row.rated_at ? String(row.rated_at) : null,
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: row.role as Message["role"],
    body: String(row.body),
    attachments: JSON.parse(String(row.attachments_json ?? "[]")) as Attachment[],
    createdAt: String(row.created_at),
    agentName: row.agent_name ? String(row.agent_name) : undefined,
    actionIds: parseActionIds(row.action_ids_json),
    actionLabel: row.action_label ? String(row.action_label) : undefined,
  };
}

function parseActionIds(value: unknown): number[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const ids = parsed.filter((id): id is number => typeof id === "number" && Number.isInteger(id));
    return ids.length > 0 ? ids : undefined;
  } catch {
    return undefined;
  }
}

export class SupportStore {
  readonly db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(dirname(filename), { recursive: true });
    }
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    this.ensureColumn("dashboard_sessions", "account_id", "TEXT");
    this.ensureColumn("conversations", "agent_name", "TEXT");
    this.ensureColumn("conversations", "assignee_id", "TEXT");
    this.ensureColumn("conversations", "assignee_name", "TEXT");
    this.ensureColumn("conversations", "assigned_at", "TEXT");
    this.ensureColumn("conversations", "identifier", "TEXT");
    this.ensureColumn("conversations", "assignee_avatar_url", "TEXT");
    this.ensureColumn("conversations", "rating", "TEXT");
    this.ensureColumn("conversations", "rating_comment", "TEXT");
    this.ensureColumn("conversations", "rated_at", "TEXT");
    this.ensureColumn("conversations", "accepted_at", "TEXT");
    this.ensureColumn("accounts", "avatar_url", "TEXT");
    this.ensureColumn("accounts", "presence", "TEXT NOT NULL DEFAULT 'online'");
    this.ensureColumn("accounts", "last_seen_at", "TEXT");
    this.ensureColumn("messages", "action_ids_json", "TEXT");
    this.ensureColumn("messages", "action_label", "TEXT");
    this.db.exec("CREATE INDEX IF NOT EXISTS conversations_identifier ON conversations (identifier)");
  }

  /** Adds a column when an existing database was created before it existed. */
  private ensureColumn(table: string, column: string, type: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
    if (columns.some((item) => item.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  close(): void {
    this.db.close();
  }

  getConfig(fallback: PublicConfig): PublicConfig {
    return normalizeWidget(this.getSettings({ widget: fallback, corsOrigin: "*" }).widget);
  }

  setConfig(config: PublicConfig): void {
    const current = this.getSettings({ widget: config, corsOrigin: "*" });
    this.saveSettings({ ...current, widget: config });
  }

  getSettings(fallback: Pick<ServerSettings, "widget" | "corsOrigin">): ServerSettings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'server'").get() as
      | { value: string }
      | undefined;
    const base = defaultSettings(fallback.widget, fallback.corsOrigin);
    if (!row) {
      const legacy = this.db.prepare("SELECT value FROM settings WHERE key = 'config'").get() as
        | { value: string }
        | undefined;
      if (!legacy) return base;
      return { ...base, widget: { ...base.widget, ...(JSON.parse(legacy.value) as Partial<PublicConfig>) } };
    }
    const stored = JSON.parse(row.value) as { widget?: Parameters<typeof normalizeWidget>[0] };
    if (stored.widget) stored.widget = normalizeWidget(stored.widget);
    const parsed = settingsSchema.safeParse(stored);
    if (!parsed.success) return base;
    return parsed.data;
  }

  saveSettings(settings: ServerSettings): ServerSettings {
    const value = settingsSchema.parse({ ...settings, widget: normalizeWidget(settings.widget) });
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('server', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(JSON.stringify(value));
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('config', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(JSON.stringify(value.widget));
    return value;
  }

  getSecret(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM secrets WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSecret(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO secrets (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  deleteSecret(key: string): void {
    this.db.prepare("DELETE FROM secrets WHERE key = ?").run(key);
  }

  webhookSecret(id: string): string | null {
    return this.getSecret(`webhook:${id}`);
  }

  setWebhookSecret(id: string, secret: string): void {
    this.setSecret(`webhook:${id}`, secret);
  }

  deleteWebhookSecret(id: string): void {
    this.deleteSecret(`webhook:${id}`);
  }

  createDashboardSession(token: string, ttlMs: number, accountId?: string | null): void {
    const now = Date.now();
    this.db
      .prepare("INSERT INTO dashboard_sessions (token_hash, created_at, expires_at, account_id) VALUES (?, ?, ?, ?)")
      .run(sha256(token), new Date(now).toISOString(), new Date(now + ttlMs).toISOString(), accountId ?? null);
  }

  dashboardAccountId(token: string): string | null {
    if (!this.dashboardSessionValid(token)) return null;
    const row = this.db
      .prepare("SELECT account_id FROM dashboard_sessions WHERE token_hash = ?")
      .get(sha256(token)) as { account_id: string | null } | undefined;
    return row?.account_id ?? null;
  }

  dashboardSessionValid(token: string): boolean {
    const row = this.db
      .prepare("SELECT expires_at FROM dashboard_sessions WHERE token_hash = ?")
      .get(sha256(token)) as { expires_at: string } | undefined;
    if (!row) return false;
    if (Date.parse(row.expires_at) < Date.now()) {
      this.db.prepare("DELETE FROM dashboard_sessions WHERE token_hash = ?").run(sha256(token));
      return false;
    }
    return true;
  }

  deleteDashboardSession(token: string): void {
    this.db.prepare("DELETE FROM dashboard_sessions WHERE token_hash = ?").run(sha256(token));
  }

  private nextSeq(name: "conversation" | "message"): number {
    this.db
      .prepare(
        `INSERT INTO counters (name, value) VALUES (?, 1)
         ON CONFLICT(name) DO UPDATE SET value = value + 1`,
      )
      .run(name);
    const row = this.db.prepare("SELECT value FROM counters WHERE name = ?").get(name) as { value: number };
    return Number(row.value);
  }

  createConversation(input: CreateConversationInput, visitorToken: string): CreatedConversation {
    const id = newId("cnv");
    const visitorId = newId("vis");
    const createdAt = nowIso();
    const seq = this.nextSeq("conversation");
    this.db
      .prepare(
        `INSERT INTO conversations (
           id, visitor_id, visitor_token_hash, status, visitor_name, visitor_email,
           identifier, metadata_json, created_at, updated_at, seq
         ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        visitorId,
        sha256(visitorToken),
        input.visitorName ?? null,
        input.visitorEmail ?? null,
        input.identifier?.trim() || null,
        JSON.stringify(input.metadata ?? {}),
        createdAt,
        createdAt,
        seq,
      );
    return {
      conversation: this.getConversation(id)!,
      visitorToken,
    };
  }

  getConversation(id: string): Conversation | null {
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToConversation(row) : null;
  }

  /** Every conversation that shares a visitor identifier, newest activity first. */
  listByIdentifier(identifier: string): Conversation[] {
    const rows = this.db
      .prepare("SELECT * FROM conversations WHERE identifier = ? ORDER BY updated_at DESC, seq DESC")
      .all(identifier) as unknown as Record<string, unknown>[];
    return rows.map(rowToConversation);
  }

  getConversationByVisitorToken(token: string): Conversation | null {
    const row = this.db
      .prepare("SELECT * FROM conversations WHERE visitor_token_hash = ?")
      .get(sha256(token)) as Record<string, unknown> | undefined;
    return row ? rowToConversation(row) : null;
  }

  listConversations(options: { status?: ConversationStatus; limit?: number; cursor?: string } = {}): {
    conversations: Conversation[];
    nextCursor: string | null;
  } {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const params: Array<string | number> = [];
    const where: string[] = [];
    if (options.status) {
      where.push("status = ?");
      params.push(options.status);
    }
    if (options.cursor) {
      where.push("(updated_at < ? OR (updated_at = ? AND seq < ?))");
      const [updatedAt, seq] = options.cursor.split("|");
      params.push(updatedAt ?? "", updatedAt ?? "", Number(seq ?? 0));
    }
    const sql = `SELECT * FROM conversations
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, seq DESC
      LIMIT ?`;
    params.push(limit + 1);
    const rows = this.db.prepare(sql).all(...params) as unknown as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const conversations = slice.map(rowToConversation);
    const last = conversations.at(-1);
    return {
      conversations,
      nextCursor: hasMore && last ? `${last.updatedAt}|${last.seq}` : null,
    };
  }

  /**
   * Messages in chronological order.
   * `after` is an ISO timestamp and returns only newer rows (used by the widget poll).
   * `cursor` is `<createdAt>|<seq>` and returns the next page after that message.
   */
  listMessages(
    conversationId: string,
    options: { after?: string; cursor?: string; limit?: number } | string = {},
  ): { messages: Message[]; nextCursor: string | null } {
    const query = typeof options === "string" ? { after: options } : options;
    const params: Array<string | number> = [conversationId];
    const where = ["conversation_id = ?"];
    if (query.after) {
      where.push(
        `seq > (SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ? AND created_at <= ?)`,
      );
      params.push(conversationId, query.after);
    }
    if (query.cursor) {
      const [createdAt, seq] = query.cursor.split("|");
      where.push("(created_at > ? OR (created_at = ? AND seq > ?))");
      params.push(createdAt ?? "", createdAt ?? "", Number(seq ?? 0));
    }
    const limit = query.limit ? Math.min(Math.max(query.limit, 1), 100) : undefined;
    const sql = `SELECT * FROM messages WHERE ${where.join(" AND ")} ORDER BY seq ASC${limit ? " LIMIT ?" : ""}`;
    if (limit) params.push(limit + 1);
    const rows = this.db.prepare(sql).all(...params) as unknown as Record<string, unknown>[];
    const hasMore = limit !== undefined && rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const messages = slice.map(rowToMessage);
    const last = messages.at(-1);
    const lastRow = slice.at(-1);
    return {
      messages,
      nextCursor: hasMore && last && lastRow ? `${last.createdAt}|${Number(lastRow.seq)}` : null,
    };
  }

  getConversationWithMessages(id: string): ConversationWithMessages | null {
    const conversation = this.getConversation(id);
    if (!conversation) return null;
    return { ...conversation, messages: this.listMessages(id).messages };
  }

  addMessage(conversationId: string, input: PostMessageInput): Message {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (conversation.status === "closed" && input.role === "visitor") {
      throw new Error("Conversation is closed");
    }
    const id = newId("msg");
    const createdAt = nowIso();
    const seq = this.nextSeq("message");
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, body, attachments_json, agent_name, created_at, seq, action_ids_json, action_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        conversationId,
        input.role,
        input.body,
        JSON.stringify(input.attachments ?? []),
        input.agentName ?? null,
        createdAt,
        seq,
        input.actionIds && input.actionIds.length > 0 ? JSON.stringify(input.actionIds) : null,
        input.actionLabel?.trim() || null,
      );
    const unreadDelta = input.role === "visitor" ? 1 : 0;
    // Only a real agent reply counts as handling the ticket. A system note
    // (such as "Sam joined") must not clear the waiting state on its own.
    const clearUnread = input.role === "agent" ? 0 : null;
    if (clearUnread === 0) {
      this.db
        .prepare(
          `UPDATE conversations
           SET updated_at = ?, last_message_at = ?, unread_for_agent = 0, agent_name = COALESCE(?, agent_name)
           WHERE id = ?`,
        )
        .run(createdAt, createdAt, input.agentName ?? null, conversationId);
    } else {
      this.db
        .prepare(
          `UPDATE conversations
           SET updated_at = ?, last_message_at = ?, unread_for_agent = unread_for_agent + ?
           WHERE id = ?`,
        )
        .run(createdAt, createdAt, unreadDelta, conversationId);
    }
    const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Record<string, unknown>;
    return rowToMessage(row);
  }

  /**
   * Claims the ticket for an agent. A system line is posted so the visitor sees who joined.
   * Assigning again replaces the previous agent.
   */
  assignConversation(id: string, assignee: { id: string | null; name: string; avatarUrl?: string | null }): Conversation | null {
    const current = this.getConversation(id);
    if (!current) return null;
    const assignedAt = nowIso();
    const firstAccept = current.assigneeName ? null : assignedAt;
    this.db
      .prepare(
        `UPDATE conversations
         SET assignee_id = ?, assignee_name = ?, assignee_avatar_url = ?, assigned_at = ?, agent_name = ?, updated_at = ?,
             accepted_at = COALESCE(accepted_at, ?)
         WHERE id = ?`,
      )
      .run(assignee.id, assignee.name, assignee.avatarUrl ?? null, assignedAt, assignee.name, assignedAt, firstAccept, id);
    this.addMessage(id, {
      role: "system",
      body: `${assignee.name} joined the conversation`,
      agentName: assignee.name,
    });
    return this.getConversation(id);
  }

  updateConversation(
    id: string,
    patch: { status?: ConversationStatus; visitorName?: string | null; visitorEmail?: string | null },
  ): Conversation | null {
    const current = this.getConversation(id);
    if (!current) return null;
    const updatedAt = nowIso();
    this.db
      .prepare(
        `UPDATE conversations
         SET status = ?, visitor_name = ?, visitor_email = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.status ?? current.status,
        patch.visitorName === undefined ? current.visitorName : patch.visitorName,
        patch.visitorEmail === undefined ? current.visitorEmail : patch.visitorEmail,
        updatedAt,
        id,
      );
    if (patch.status === "closed") this.closeOpenPage(id);
    return this.getConversation(id);
  }

  /**
   * Ends a live chat from the desk. The visitor sees who ended it, and can no longer reply.
   * Closing again is a no-op so a second click does not post another line.
   */
  endConversation(id: string, agentName?: string | null): Conversation | null {
    const current = this.getConversation(id);
    if (!current) return null;
    if (current.status === "closed") return current;
    const who = agentName?.trim() || current.assigneeName?.trim() || "An agent";
    this.addMessage(id, { role: "system", body: `${who} ended the conversation`, agentName: who });
    return this.updateConversation(id, { status: "closed" });
  }

  /** Stops the live page timer when the conversation ends. */
  private closeOpenPage(conversationId: string): void {
    this.db
      .prepare("UPDATE page_visits SET ended_at = ? WHERE conversation_id = ? AND ended_at IS NULL")
      .run(nowIso(), conversationId);
  }

  /**
   * One rating per conversation, and only after it has ended.
   * A second vote is rejected so the score cannot be changed.
   */
  rateConversation(id: string, rating: "up" | "down" | "skipped", comment?: string | null): Conversation {
    const current = this.getConversation(id);
    if (!current) throw new Error("Conversation not found");
    if (current.status !== "closed") {
      throw Object.assign(new Error("The conversation is still open"), { statusCode: 400 });
    }
    if (current.rating) {
      throw Object.assign(new Error("This conversation was already rated"), { statusCode: 409 });
    }
    const note = rating === "skipped" ? null : comment?.trim().slice(0, 500) || null;
    const ratedAt = nowIso();
    this.db
      .prepare("UPDATE conversations SET rating = ?, rating_comment = ?, rated_at = ? WHERE id = ?")
      .run(rating, note, ratedAt, id);
    return this.getConversation(id)!;
  }

  recordAiUsage(input: { conversationId: string; model: string; promptTokens: number; completionTokens: number }): AiUsageEntry {
    const entry: AiUsageEntry = {
      id: newId("aiu"),
      conversationId: input.conversationId,
      model: input.model,
      promptTokens: Math.max(0, Math.round(input.promptTokens)),
      completionTokens: Math.max(0, Math.round(input.completionTokens)),
      createdAt: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO ai_usage (id, conversation_id, model, prompt_tokens, completion_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(entry.id, entry.conversationId, entry.model, entry.promptTokens, entry.completionTokens, entry.createdAt);
    return entry;
  }

  aiUsageSummary(): AiUsageSummary {
    const conversations = Number(
      (this.db.prepare("SELECT COUNT(*) AS count FROM conversations WHERE json_extract(metadata_json, '$.handler') = 'ai'").get() as { count: number }).count,
    );
    const messages = Number(
      (
        this.db
          .prepare(
            `SELECT COUNT(*) AS count FROM messages
             WHERE role = 'visitor'
               AND conversation_id IN (SELECT id FROM conversations WHERE json_extract(metadata_json, '$.handler') = 'ai')`,
          )
          .get() as { count: number }
      ).count,
    );
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS replies,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens
         FROM ai_usage`,
      )
      .get() as { replies: number; prompt_tokens: number; completion_tokens: number };
    const models = this.db
      .prepare(
        `SELECT model,
                COUNT(*) AS replies,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens
         FROM ai_usage
         GROUP BY model
         ORDER BY replies DESC, model ASC`,
      )
      .all() as unknown as Array<{ model: string; replies: number; prompt_tokens: number; completion_tokens: number }>;
    const recent = this.db
      .prepare(
        `SELECT id, conversation_id, model, prompt_tokens, completion_tokens, created_at
         FROM ai_usage
         ORDER BY created_at DESC
         LIMIT 20`,
      )
      .all() as unknown as Array<{
      id: string;
      conversation_id: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      created_at: string;
    }>;
    const promptTokens = Number(totals.prompt_tokens);
    const completionTokens = Number(totals.completion_tokens);
    const byModel = models.map((row) => ({
      model: row.model,
      replies: Number(row.replies),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      estimatedCostUsd: estimateCost(row.model, Number(row.prompt_tokens), Number(row.completion_tokens)),
    }));
    return {
      conversations,
      messages,
      replies: Number(totals.replies),
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd: byModel.reduce((sum, row) => sum + row.estimatedCostUsd, 0),
      models: byModel,
      recent: recent.map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        model: row.model,
        promptTokens: Number(row.prompt_tokens),
        completionTokens: Number(row.completion_tokens),
        createdAt: row.created_at,
        estimatedCostUsd: estimateCost(row.model, Number(row.prompt_tokens), Number(row.completion_tokens)),
      })),
    };
  }

  reviewSummary(): ReviewSummary {
    const rows = this.db
      .prepare(
        `SELECT id, visitor_name, assignee_id, assignee_name, rating, rating_comment, rated_at
         FROM conversations
         WHERE rating IS NOT NULL
         ORDER BY rated_at DESC`,
      )
      .all() as unknown as Array<{
      id: string;
      visitor_name: string | null;
      assignee_id: string | null;
      assignee_name: string | null;
      rating: string;
      rating_comment: string | null;
      rated_at: string;
    }>;
    const agents = new Map<string, ReviewSummary["agents"][number]>();
    let up = 0;
    let down = 0;
    let skipped = 0;
    const reviews: ReviewSummary["reviews"] = [];
    for (const row of rows) {
      if (row.rating === "skipped") {
        skipped += 1;
        continue;
      }
      if (row.rating !== "up" && row.rating !== "down") continue;
      if (row.rating === "up") up += 1;
      else down += 1;
      const key = row.assignee_id || `name:${row.assignee_name || "Unassigned"}`;
      const agent = agents.get(key) ?? {
        accountId: row.assignee_id,
        name: row.assignee_name || "Unassigned",
        up: 0,
        down: 0,
        score: null,
      };
      if (row.rating === "up") agent.up += 1;
      else agent.down += 1;
      agents.set(key, agent);
      reviews.push({
        conversationId: row.id,
        visitorName: row.visitor_name,
        assigneeId: row.assignee_id,
        assigneeName: row.assignee_name,
        rating: row.rating,
        comment: row.rating_comment,
        ratedAt: row.rated_at,
      });
    }
    const scored = [...agents.values()].map((agent) => ({
      ...agent,
      score: agent.up + agent.down === 0 ? null : agent.up / (agent.up + agent.down),
    }));
    scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.up + b.down - (a.up + a.down));
    return {
      up,
      down,
      skipped,
      score: up + down === 0 ? null : up / (up + down),
      agents: scored,
      reviews,
    };
  }

  markRead(id: string): Conversation | null {
    const current = this.getConversation(id);
    if (!current) return null;
    this.db.prepare("UPDATE conversations SET unread_for_agent = 0 WHERE id = ?").run(id);
    return this.getConversation(id);
  }

  /**
   * Records the page the visitor is on. Repeating the current path does nothing.
   * A different path closes the previous visit, which is how long they stayed.
   */
  recordPage(conversationId: string, path: string): PageVisit[] {
    const conversation = this.getConversation(conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.status === "closed") {
      throw Object.assign(new Error("Conversation is closed"), { statusCode: 400 });
    }
    const clean = path.trim().slice(0, 300);
    if (!clean.startsWith("/")) {
      throw Object.assign(new Error("Path must start with /"), { statusCode: 400 });
    }
    const open = this.db
      .prepare("SELECT id, path FROM page_visits WHERE conversation_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1")
      .get(conversationId) as { id: number; path: string } | undefined;
    if (open?.path === clean) return this.listPages(conversationId);
    const now = nowIso();
    if (open) {
      this.db.prepare("UPDATE page_visits SET ended_at = ? WHERE id = ?").run(now, open.id);
    }
    this.db
      .prepare("INSERT INTO page_visits (conversation_id, path, started_at) VALUES (?, ?, ?)")
      .run(conversationId, clean, now);
    return this.listPages(conversationId);
  }

  listPages(conversationId: string): PageVisit[] {
    const rows = this.db
      .prepare("SELECT path, started_at, ended_at FROM page_visits WHERE conversation_id = ? ORDER BY id ASC")
      .all(conversationId) as unknown as Array<{ path: string; started_at: string; ended_at: string | null }>;
    return rows.map((row) => ({ path: row.path, startedAt: row.started_at, endedAt: row.ended_at }));
  }

  insertApiToken(record: Omit<ApiTokenRecord, "lastUsedAt" | "revokedAt">): void {
    this.db
      .prepare(
        `INSERT INTO api_tokens (id, name, token_hash, token_prefix, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.name, record.tokenHash, record.tokenPrefix, record.createdAt);
  }

  getApiToken(id: string): ApiTokenRecord | null {
    const row = this.db.prepare("SELECT * FROM api_tokens WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      name: String(row.name),
      tokenHash: String(row.token_hash),
      tokenPrefix: String(row.token_prefix),
      createdAt: String(row.created_at),
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    };
  }

  touchApiToken(id: string): void {
    this.db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), id);
  }

  listApiTokens(): Array<Omit<ApiTokenRecord, "tokenHash">> {
    const rows = this.db
      .prepare("SELECT * FROM api_tokens ORDER BY created_at DESC")
      .all() as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      tokenPrefix: String(row.token_prefix),
      createdAt: String(row.created_at),
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    }));
  }

  private rowToAccount(row: Record<string, unknown>): Account {
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      role: row.role as AccountRole,
      createdAt: String(row.created_at),
      disabledAt: row.disabled_at ? String(row.disabled_at) : null,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      presence: row.presence === "away" ? "away" : "online",
      lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    };
  }

  createAccount(input: { email: string; name: string; role: AccountRole; password: string }): Account {
    const id = newId("acc");
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO accounts (id, email, name, role, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.email.trim().toLowerCase(), input.name.trim(), input.role, hashPassword(input.password), createdAt);
    return this.getAccount(id)!;
  }

  getAccount(id: string): Account | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToAccount(row) : null;
  }

  getAccountByEmail(email: string): Account | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE email = ? COLLATE NOCASE").get(email.trim()) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToAccount(row) : null;
  }

  listAccounts(): Account[] {
    const rows = this.db
      .prepare("SELECT * FROM accounts ORDER BY created_at ASC")
      .all() as unknown as Record<string, unknown>[];
    return rows.map((row) => this.rowToAccount(row));
  }

  countAccounts(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM accounts").get() as { count: number };
    return Number(row.count);
  }

  /** Email and password match an account that has not been disabled. */
  authenticateAccount(email: string, password: string): Account | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE email = ? COLLATE NOCASE").get(email.trim()) as
      | Record<string, unknown>
      | undefined;
    if (!row || row.disabled_at) return null;
    if (!verifyPassword(password, String(row.password_hash))) return null;
    return this.rowToAccount(row);
  }

  /** An agent who is online and has touched the desk within this window counts as present. */
  static readonly PRESENCE_TTL_MS = 1000 * 45;

  setAccountPresence(id: string, presence: "online" | "away"): Account | null {
    const current = this.getAccount(id);
    if (!current) return null;
    this.db
      .prepare("UPDATE accounts SET presence = ?, last_seen_at = ? WHERE id = ?")
      .run(presence, nowIso(), id);
    return this.getAccount(id);
  }

  /** Refreshes the heartbeat without changing an away choice. */
  touchAccount(id: string): void {
    this.db.prepare("UPDATE accounts SET last_seen_at = ? WHERE id = ?").run(nowIso(), id);
  }

  /**
   * Mean wait, in seconds, from a human chat opening until the first agent accepted it.
   * AI chats are skipped. Null until at least one ticket has been accepted.
   */
  averageAcceptSeconds(): number | null {
    return this.deskStats().averageResponseSeconds;
  }

  /** Averages for the statistics page. AI chats are left out of the waits and durations. */
  deskStats(): DeskStats {
    const response = this.db
      .prepare(
        `SELECT AVG((julianday(accepted_at) - julianday(created_at)) * 86400) AS seconds, COUNT(*) AS samples
         FROM conversations
         WHERE accepted_at IS NOT NULL
           AND json_extract(metadata_json, '$.handler') IS NOT 'ai'`,
      )
      .get() as { seconds: number | null; samples: number };
    const ratings = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) AS up,
           SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) AS down,
           SUM(CASE WHEN rating = 'skipped' THEN 1 ELSE 0 END) AS skipped
         FROM conversations
         WHERE rating IS NOT NULL`,
      )
      .get() as { up: number | null; down: number | null; skipped: number | null };
    const duration = this.db
      .prepare(
        `SELECT AVG((julianday(updated_at) - julianday(created_at)) * 86400) AS seconds, COUNT(*) AS samples
         FROM conversations
         WHERE status = 'closed'
           AND json_extract(metadata_json, '$.handler') IS NOT 'ai'`,
      )
      .get() as { seconds: number | null; samples: number };
    const up = Number(ratings.up ?? 0);
    const down = Number(ratings.down ?? 0);
    return {
      averageResponseSeconds: response.samples && response.seconds !== null ? Math.max(0, Math.round(response.seconds)) : null,
      responseSamples: Number(response.samples),
      averageRating: up + down > 0 ? up / (up + down) : null,
      ratingUp: up,
      ratingDown: down,
      ratingSkipped: Number(ratings.skipped ?? 0),
      averageConversationSeconds: duration.samples && duration.seconds !== null ? Math.max(0, Math.round(duration.seconds)) : null,
      conversationSamples: Number(duration.samples),
    };
  }

  /** At least one signed-in person is at the desk right now. */
  staffOnline(now = Date.now()): boolean {
    const since = new Date(now - SupportStore.PRESENCE_TTL_MS).toISOString();
    const row = this.db
      .prepare(
        `SELECT 1 AS present FROM accounts
         WHERE disabled_at IS NULL AND presence = 'online' AND last_seen_at >= ?
         LIMIT 1`,
      )
      .get(since) as { present: number } | undefined;
    return Boolean(row);
  }

  setAccountDisabled(id: string, disabled: boolean): Account | null {
    const current = this.getAccount(id);
    if (!current) return null;
    this.db
      .prepare("UPDATE accounts SET disabled_at = ? WHERE id = ?")
      .run(disabled ? nowIso() : null, id);
    if (disabled) {
      this.db.prepare("DELETE FROM dashboard_sessions WHERE account_id = ?").run(id);
    }
    return this.getAccount(id);
  }

  setAccountAvatar(id: string, avatarUrl: string | null): Account | null {
    const current = this.getAccount(id);
    if (!current) return null;
    this.db.prepare("UPDATE accounts SET avatar_url = ? WHERE id = ?").run(avatarUrl, id);
    this.db
      .prepare("UPDATE conversations SET assignee_avatar_url = ? WHERE assignee_id = ? AND status = 'open'")
      .run(avatarUrl, id);
    return this.getAccount(id);
  }

  setAccountName(id: string, name: string): Account | null {
    const current = this.getAccount(id);
    if (!current) return null;
    const next = name.trim();
    this.db.prepare("UPDATE accounts SET name = ? WHERE id = ?").run(next, id);
    this.db
      .prepare("UPDATE conversations SET assignee_name = ?, agent_name = ? WHERE assignee_id = ? AND status = 'open'")
      .run(next, next, id);
    return this.getAccount(id);
  }

  setAccountPassword(id: string, password: string): boolean {
    const result = this.db
      .prepare("UPDATE accounts SET password_hash = ? WHERE id = ?")
      .run(hashPassword(password), id);
    return Number(result.changes) > 0;
  }

  revokeApiToken(id: string): boolean {
    const result = this.db
      .prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(nowIso(), id);
    return Number(result.changes) > 0;
  }
}
