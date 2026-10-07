import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { File, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo } from "lucide-react";
import { api } from "./api.js";
import { formatMessageTime } from "./format.js";
import type { Account, Attachment, Conversation, Message, PageVisit, VisitorCard } from "./types.js";

const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

interface Group {
  key: string;
  identifier: string | null;
  conversations: Conversation[];
}

function groupConversations(conversations: Conversation[]): Group[] {
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const conversation of conversations) {
    const key = conversation.identifier || `anon:${conversation.id}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, identifier: conversation.identifier, conversations: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.conversations.push(conversation);
  }
  return groups;
}

export function Inbox({ me }: { me: Account | null }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [visitor, setVisitor] = useState<VisitorCard | "loading" | "error" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pages, setPages] = useState<PageVisit[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const queues = useMemo(() => splitQueues(conversations), [conversations]);
  const needsYou = useMemo(() => groupConversations(queues.needsYou), [queues.needsYou]);
  const aiChats = useMemo(() => groupConversations(queues.ai), [queues.ai]);
  const openChats = useMemo(() => groupConversations(queues.open), [queues.open]);
  const done = useMemo(() => groupConversations(queues.done), [queues.done]);

  async function loadList() {
    const data = await api<{ conversations: Conversation[] }>("/api/conversations");
    setConversations(data.conversations);
    setLoaded(true);
  }

  async function loadPages(id: string) {
    const data = await api<{ pages: PageVisit[] }>(`/api/conversations/${id}/pages`);
    setPages(data.pages);
  }

  async function openConversation(id: string) {
    setConfirmEnd(false);
    await api(`/api/conversations/${id}/read`, { method: "POST", body: "{}" });
    const fresh = await api<{ conversation: Conversation }>(`/api/conversations/${id}`);
    setCurrent(fresh.conversation);
    loadPages(id).catch(() => setPages([]));
    loadList().catch(() => {});
  }

  async function openVisitor(identifier: string) {
    setVisitor("loading");
    try {
      const data = await api<{ visitor: VisitorCard }>(`/api/visitors/${encodeURIComponent(identifier)}`);
      setVisitor(data.visitor);
    } catch {
      setVisitor("error");
    }
  }

  useEffect(() => {
    if (!confirmEnd) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmEnd(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmEnd]);

  useEffect(() => {
    loadList().catch(() => setLoaded(true));
    const timer = setInterval(() => {
      loadList().catch(() => {});
      setNow(Date.now());
      setCurrent((open) => {
        if (!open) return open;
        api<{ conversation: Conversation }>(`/api/conversations/${open.id}`)
          .then((fresh) => setCurrent(fresh.conversation))
          .catch(() => {});
        loadPages(open.id).catch(() => {});
        return open;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  async function assign() {
    if (!current) return;
    setAssigning(true);
    try {
      const result = await api<{ conversation: Conversation }>(`/api/conversations/${current.id}/assign`, {
        method: "POST",
        body: JSON.stringify(me ? {} : { agentName: "Agent" }),
      });
      setCurrent(result.conversation);
      loadList().catch(() => {});
    } catch (error) {
      setAssigning(false);
      alert(error instanceof Error ? error.message : "Could not assign the conversation.");
      return;
    }
    setAssigning(false);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const file = pendingFile;
    if (!current || sending || (!reply.trim() && !file)) return;
    if (file && file.size > UPLOAD_MAX_BYTES) {
      alert("Files can be up to 50 MB.");
      return;
    }
    const body = reply.trim();
    setSending(true);
    try {
      let attachmentIds: string[] | undefined;
      if (file) {
        setUploadProgress(0);
        const uploaded = await uploadFile(current.id, file, setUploadProgress);
        attachmentIds = [uploaded.id];
      }
      await api(`/api/conversations/${current.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, agentName: "You", ...(attachmentIds ? { attachmentIds } : {}) }),
      });
      setReply("");
      setPendingFile(null);
      await openConversation(current.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not send the reply.");
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  }

  async function closeTicket() {
    if (!current || ending || current.status === "closed") return;
    setEnding(true);
    try {
      const result = await api<{ conversation: Conversation }>(`/api/conversations/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });
      setCurrent(result.conversation);
      setConfirmEnd(false);
      loadList().catch(() => {});
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not end the conversation.");
    } finally {
      setEnding(false);
    }
  }

  const mine = Boolean(me && current?.assigneeName && current.assigneeId === me.id);

  return (
    <div className="inbox">
      <aside className="list">
        <Queue
          title="Needs you"
          tone="hot"
          count={queues.needsYou.length}
          groups={needsYou}
          loaded={loaded}
          empty="Nothing is waiting."
          currentId={current?.id}
          onOpen={openConversation}
          onVisitor={openVisitor}
        />
        <Queue
          title="AI"
          tone="quiet"
          count={queues.ai.length}
          groups={aiChats}
          loaded={loaded}
          empty="No AI conversations."
          currentId={current?.id}
          onOpen={openConversation}
          onVisitor={openVisitor}
        />
        <Queue
          title="Open"
          count={queues.open.length}
          groups={openChats}
          loaded={loaded}
          empty="No one is in a live chat."
          currentId={current?.id}
          onOpen={openConversation}
          onVisitor={openVisitor}
        />
        <Queue
          title="Done"
          tone="quiet"
          count={queues.done.length}
          groups={done}
          loaded={loaded}
          empty="No closed tickets."
          currentId={current?.id}
          onOpen={openConversation}
          onVisitor={openVisitor}
        />
      </aside>
      <section className="thread">
        <div className="thread-bar">
          {current ? (
            <span className="thread-meta">
              <strong>{current.visitorName || "Visitor"}</strong>
              {current.identifier ? <span className="badge badge-outline">{current.identifier}</span> : null}
              {topicLabel(current) ? <span className="badge badge-primary">{topicLabel(current)}</span> : null}
              {current.metadata?.offline === "true" ? <span className="badge badge-outline">Email</span> : null}
              {current.status === "closed" ? <span className="badge badge-outline">Ended</span> : null}
              {current.metadata?.handler === "ai" && !current.assigneeName ? (
                <span className="badge badge-outline">AI</span>
              ) : current.assigneeName ? (
                <span className="badge badge-outline">{current.assigneeName} joined</span>
              ) : current.metadata?.offline === "true" ? (
                <span className="badge">Needs a reply</span>
              ) : (
                <span className="badge">Waiting for an agent</span>
              )}
            </span>
          ) : (
            <span className="muted">Select a conversation.</span>
          )}
          <span className="spacer" />
          {current?.identifier || current ? (
            <span className="thread-actions">
              {current?.identifier ? (
                <button className="btn btn-outline btn-sm" type="button" onClick={() => openVisitor(current.identifier!)}>
                  User card
                </button>
              ) : null}
              {current && current.status !== "closed" ? (
                <button className="btn btn-primary btn-sm" type="button" onClick={assign} disabled={mine || assigning}>
                  {mine ? "Assigned to you" : current.assigneeName ? "Reassign to me" : "Assign to me"}
                </button>
              ) : null}
              {current && current.status !== "closed" ? (
                <button className="btn btn-outline btn-sm" type="button" onClick={() => setConfirmEnd(true)} disabled={ending}>
                  End conversation
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        {confirmEnd && current && current.status !== "closed" ? (
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="end-conversation-title">
            <div className="confirm-card">
              <h2 id="end-conversation-title">End this conversation?</h2>
              <p className="muted">{current.visitorName || "The visitor"} will see that you ended it and will not be able to reply.</p>
              <div className="row">
                <button className="btn btn-outline" type="button" onClick={() => setConfirmEnd(false)} disabled={ending}>
                  Keep open
                </button>
                <button className="btn btn-primary" type="button" onClick={() => void closeTicket()} disabled={ending}>
                  {ending ? "Ending…" : "End conversation"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {visitor ? (
          <aside className="visitor-card">
            <header>
              <div className="grow">
                <p className="kicker">{visitor === "loading" || visitor === "error" ? "Visitor" : visitor.identifier}</p>
                <h2>{visitor === "loading" ? "Loading…" : visitor === "error" ? "Unavailable" : visitor.name || "Visitor"}</h2>
              </div>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setVisitor(null)}>Close</button>
            </header>
            {visitor !== "loading" && visitor !== "error" ? (
              <>
                <dl>
                  <dt>Email</dt><dd>{visitor.email || "—"}</dd>
                  <dt>Conversations</dt>
                  <dd>{visitor.conversationCount}{visitor.openCount ? ` · ${visitor.openCount} open` : ""}</dd>
                  <dt>First seen</dt><dd>{formatMessageTime(visitor.firstSeenAt) || visitor.firstSeenAt}</dd>
                  <dt>Last seen</dt><dd>{formatMessageTime(visitor.lastSeenAt) || visitor.lastSeenAt}</dd>
                  {Object.entries(visitor.metadata || {}).map(([key, value]) => (
                    <span key={key} style={{ display: "contents" }}>
                      <dt>{key}</dt><dd>{value || "—"}</dd>
                    </span>
                  ))}
                </dl>
                <div className="visitor-threads">
                  {visitor.conversations.map((conversation) => (
                    <button key={conversation.id} type="button" onClick={() => openConversation(conversation.id)}>
                      <span>{topicLabel(conversation) || conversation.status}</span>
                      <span>{formatMessageTime(conversation.updatedAt) || conversation.id}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : visitor === "error" ? (
              <p className="muted">Could not load this visitor.</p>
            ) : null}
          </aside>
        ) : null}
        {current && pages.length > 0 ? <PageTrail pages={pages} now={now} /> : null}
        <div id="messages">
          {current?.messages?.length ? (
            current.messages.map((message) => <MessageView key={message.id} message={message} />)
          ) : (
            <p className="muted" style={{ padding: 8 }}>Select a conversation.</p>
          )}
        </div>
        <form className="composer" onSubmit={send}>
          {current?.status === "closed" ? <p className="muted">This conversation has ended. The visitor can no longer reply.</p> : null}
          {pendingFile || uploadProgress !== null ? (
            <div className="upload-bar">
              <span className="upload-name">{pendingFile?.name ?? "Uploading"}</span>
              {uploadProgress !== null ? (
                <span className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadProgress * 100)}>
                  <span style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                </span>
              ) : (
                <button className="btn btn-link" type="button" onClick={() => setPendingFile(null)}>Remove</button>
              )}
            </div>
          ) : null}
          <div className="composer-row">
            <label className={`btn btn-outline btn-sm attach${current?.status === "closed" ? " is-disabled" : ""}`}>
              Attach
              <input
                type="file"
                disabled={sending || current?.status === "closed"}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && file.size > UPLOAD_MAX_BYTES) alert("Files can be up to 50 MB.");
                  else setPendingFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <textarea
              className="textarea"
              rows={2}
              placeholder={current?.status === "closed" ? "This conversation has ended" : "Reply as an agent…"}
              value={reply}
              disabled={sending || current?.status === "closed"}
              onChange={(event) => setReply(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button className="btn btn-primary" type="submit" disabled={sending || current?.status === "closed" || (!reply.trim() && !pendingFile)}>
              {sending ? "Sending" : "Send"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PageTrail({ pages, now }: { pages: PageVisit[]; now: number }) {
  const listRef = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const grown = pages.length > count.current;
    count.current = pages.length;
    if (grown) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [pages]);
  return (
    <div className="pages">
      <p className="kicker">On the site</p>
      <div className="page-list" ref={listRef}>
        {pages.map((page) => (
          <div className={page.endedAt ? "page-visit" : "page-visit is-live"} key={`${page.path}-${page.startedAt}`}>
            <code>{pagePath(page.path)}</code>
            <span>{stayLabel(page, now)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Query strings are noise in the trail. Keep the path the visitor was on. */
function pagePath(path: string): string {
  const cut = path.search(/[?#]/);
  const clean = (cut === -1 ? path : path.slice(0, cut)) || "/";
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

function topicLabel(conversation: Conversation): string {
  return conversation.metadata?.topic?.trim() ?? "";
}

function isAiChat(conversation: Conversation): boolean {
  return conversation.metadata?.handler === "ai" && !conversation.assigneeName;
}

/** Work waiting on a person comes first. AI chats are their own list. Closed chats sink to the bottom. */
function splitQueues(conversations: Conversation[]): { needsYou: Conversation[]; ai: Conversation[]; open: Conversation[]; done: Conversation[] } {
  const needsYou: Conversation[] = [];
  const ai: Conversation[] = [];
  const open: Conversation[] = [];
  const done: Conversation[] = [];
  for (const conversation of conversations) {
    if (conversation.status === "closed") done.push(conversation);
    else if (isAiChat(conversation)) ai.push(conversation);
    else if (!conversation.assigneeName || conversation.unreadForAgent > 0 || conversation.metadata?.offline === "true") needsYou.push(conversation);
    else open.push(conversation);
  }
  return { needsYou, ai, open, done };
}

function stayLabel(page: PageVisit, now: number): string {
  const start = Date.parse(page.startedAt);
  const end = page.endedAt ? Date.parse(page.endedAt) : now;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const text = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return page.endedAt ? text : `${text} · here now`;
}

function Queue({
  title,
  tone,
  count,
  groups,
  loaded,
  empty,
  currentId,
  onOpen,
  onVisitor,
}: {
  title: string;
  tone?: "hot" | "quiet";
  count: number;
  groups: Group[];
  loaded: boolean;
  empty: string;
  currentId?: string;
  onOpen: (id: string) => void;
  onVisitor: (identifier: string) => void;
}) {
  return (
    <section className={["queue", tone ? `is-${tone}` : ""].filter(Boolean).join(" ")}>
      <div className="list-head">
        <span>{title}</span>
        {count ? <span className="queue-count">{count}</span> : null}
      </div>
      <div className="queue-body">
        {loaded && count === 0 ? <p className="queue-empty">{empty}</p> : null}
        {groups.map((group) => {
          const unread = group.conversations.reduce((sum, conversation) => sum + (conversation.unreadForAgent || 0), 0);
          return (
            <div key={group.key}>
              {group.identifier && group.conversations.length > 1 ? (
                <button className="group-head" type="button" onClick={() => onVisitor(group.identifier!)}>
                  <span className="who">
                    <strong>{group.conversations[0]?.visitorName || group.identifier}</strong>
                    <small>{group.identifier}</small>
                  </span>
                  {unread ? <span className="badge badge-primary">{unread}</span> : null}
                  <span className="group-count">{group.conversations.length}</span>
                </button>
              ) : null}
              {group.conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === currentId}
                  onOpen={() => onOpen(conversation.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ConversationRow({
  conversation,
  active,
  onOpen,
}: {
  conversation: Conversation;
  active: boolean;
  onOpen: () => void;
}) {
  const ai = isAiChat(conversation);
  const waiting = !ai && conversation.status !== "closed" && (!conversation.assigneeName || conversation.unreadForAgent > 0 || conversation.metadata?.offline === "true");
  const subject = topicLabel(conversation) || (conversation.metadata?.offline === "true" ? "Left a message" : conversation.metadata?.handler === "ai" ? "AI chat" : "Live chat");
  const when = formatMessageTime(conversation.updatedAt);
  return (
    <button type="button" className={["item", active ? "active" : "", waiting ? "is-waiting" : ""].filter(Boolean).join(" ")} onClick={onOpen}>
      <span className="item-top">
        <strong>{conversation.visitorName || "Visitor"}</strong>
        {conversation.unreadForAgent ? <span className="badge badge-primary">{conversation.unreadForAgent}</span> : null}
        <span className="item-time">{when}</span>
      </span>
      <span className="item-subject">{subject}</span>
      <span className="item-meta">
        {conversation.metadata?.offline === "true" ? <span className="badge">Email</span> : null}
        {conversation.status === "closed" ? (
          <span className="badge badge-outline">Closed</span>
        ) : ai ? (
          <span className="badge badge-outline">AI</span>
        ) : conversation.assigneeName ? (
          <span className="badge badge-outline">{conversation.assigneeName}</span>
        ) : (
          <span className="badge">Unassigned</span>
        )}
        {conversation.visitorEmail ? <span className="item-mail">{conversation.visitorEmail}</span> : null}
      </span>
    </button>
  );
}

function MessageView({ message }: { message: Message }) {
  const label = formatMessageTime(message.createdAt);
  const files = message.attachments ?? [];
  return (
    <div className={`msg ${message.role}`}>
      {message.actionLabel ? (
        <div className="bubble action-note">Provided {message.actionLabel}</div>
      ) : message.body ? (
        <div className="bubble">{message.agentName ? `${message.agentName}: ` : ""}{message.body}</div>
      ) : null}
      {files.map((file) => <FileLink key={file.id} file={file} />)}
      {label ? <time dateTime={message.createdAt}>{label}</time> : null}
    </div>
  );
}

function FileLink({ file }: { file: Attachment }) {
  const kind = fileKind(file);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function openCode() {
    setOpen(true);
    setCode("");
    setCodeError("");
    try {
      const response = await fetch(file.url, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not open the file.");
      const text = await response.text();
      setCode(text.length > 200_000 ? `${text.slice(0, 200_000)}\n\n… truncated` : text);
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "Could not open the file.");
    }
  }

  if (kind === "image") {
    return (
      <>
        <button className="file-link" type="button" onClick={() => setOpen(true)}>
          <img src={file.url} alt="" />
          <span className="file-row">
            <FileTypeIcon kind={kind} />
            <span>{file.name}</span>
          </span>
        </button>
        {open ? (
          <div className="file-stage" role="dialog" aria-modal="true" aria-label={file.name} onClick={() => setOpen(false)}>
            <button className="btn btn-outline file-stage-close" type="button" onClick={() => setOpen(false)}>Close</button>
            <img src={file.url} alt={file.name} onClick={(event) => event.stopPropagation()} />
          </div>
        ) : null}
      </>
    );
  }

  if (kind === "code") {
    return (
      <>
        <button className="file-link" type="button" onClick={() => void openCode()}>
          <span className="file-row">
            <FileTypeIcon kind={kind} />
            <span>{file.name}</span>
          </span>
        </button>
        {open ? (
          <div className="file-card" role="dialog" aria-modal="true" aria-label={file.name}>
            <header>
              <strong>{file.name}</strong>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setOpen(false)}>Close</button>
            </header>
            {codeError ? <p className="error">{codeError}</p> : <pre>{code || "Loading…"}</pre>}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="file-download">
      <span className="file-row">
        <FileTypeIcon kind={kind} />
        <span>{file.name}</span>
      </span>
      <a className="btn btn-outline btn-sm" href={file.url} download={file.name}>Download</a>
    </div>
  );
}

type FileKind = "image" | "video" | "audio" | "pdf" | "zip" | "code" | "text" | "file";

function fileKind(file: { name: string; mimeType: string }): FileKind {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (file.mimeType.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) return "video";
  if (file.mimeType.startsWith("audio/") || ["mp3", "wav", "m4a"].includes(ext)) return "audio";
  if (file.mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (["zip", "gz", "tgz"].includes(ext)) return "zip";
  if (["json", "js", "ts", "tsx", "jsx", "css", "html", "xml", "yml", "yaml"].includes(ext)) return "code";
  if (file.mimeType.startsWith("text/") || ["txt", "csv", "md"].includes(ext)) return "text";
  return "file";
}

function FileTypeIcon({ kind }: { kind: FileKind }) {
  const Icon = {
    image: FileImage,
    video: FileVideo,
    audio: FileAudio,
    pdf: FileText,
    zip: FileArchive,
    code: FileCode,
    text: FileText,
    file: File,
  }[kind];
  return <Icon className={`file-icon file-icon-${kind}`} size={18} strokeWidth={1.75} aria-hidden="true" />;
}

async function uploadFile(conversationId: string, file: File, onProgress: (fraction: number) => void): Promise<Attachment> {
  const started = await uploadJson<{ uploadId: string; chunkSize: number; chunkCount: number }>(
    `/api/conversations/${conversationId}/uploads`,
    {
      method: "POST",
      headers: {
        "x-filename": file.name,
        "x-file-type": file.type || "application/octet-stream",
        "x-file-size": String(file.size),
      },
    },
  );
  const chunkSize = started.chunkSize || UPLOAD_CHUNK_BYTES;
  let loaded = 0;
  for (let index = 0; index < started.chunkCount; index += 1) {
    const chunk = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size));
    await uploadJson(`/api/conversations/${conversationId}/uploads`, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "x-upload-id": started.uploadId,
        "x-chunk-index": String(index),
      },
      body: chunk,
    });
    loaded += chunk.size;
    onProgress(file.size === 0 ? 0 : loaded / file.size);
  }
  const finished = await uploadJson<{ attachment: Attachment }>(`/api/conversations/${conversationId}/uploads`, {
    method: "POST",
    headers: { "x-upload-id": started.uploadId },
  });
  return finished.attachment;
}

async function uploadJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Upload failed");
  return data;
}
