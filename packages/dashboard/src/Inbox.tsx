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
  const [pages, setPages] = useState<PageVisit[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const live = useMemo(() => conversations.filter((conversation) => conversation.metadata?.offline !== "true"), [conversations]);
  const messagesLeft = useMemo(() => conversations.filter((conversation) => conversation.metadata?.offline === "true"), [conversations]);
  const groups = useMemo(() => groupConversations(live), [live]);

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
    if (!current) return;
    await api(`/api/conversations/${current.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "closed" }),
    });
    await openConversation(current.id);
  }

  const mine = Boolean(me && current?.assigneeName && current.assigneeId === me.id);

  return (
    <div className="inbox">
      <aside className="list">
        <div className="list-head">Live chat{live.length ? ` · ${live.length}` : ""}</div>
        <div>
          {loaded && live.length === 0 ? <p className="muted" style={{ padding: 18 }}>No live chats.</p> : null}
          {groups.map((group) => {
            if (!group.identifier) {
              const conversation = group.conversations[0]!;
              return (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === current?.id}
                  onOpen={() => openConversation(conversation.id)}
                />
              );
            }
            const unread = group.conversations.reduce((sum, conversation) => sum + (conversation.unreadForAgent || 0), 0);
            const latest = group.conversations[0]!;
            return (
              <div key={group.key}>
                <button className="group-head" type="button" onClick={() => openVisitor(group.identifier!)}>
                  <span className="who">
                    <strong>{latest.visitorName || group.identifier}</strong>
                    <small>{group.identifier}</small>
                  </span>
                  {unread ? <span className="badge badge-primary">{unread}</span> : null}
                  <span className="group-count">{group.conversations.length}</span>
                </button>
                {group.conversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === current?.id}
                    onOpen={() => openConversation(conversation.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div className="list-head">Messages{messagesLeft.length ? ` · ${messagesLeft.length}` : ""}</div>
        <div>
          {loaded && messagesLeft.length === 0 ? <p className="muted" style={{ padding: 18 }}>No messages left behind.</p> : null}
          {messagesLeft.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === current?.id}
              onOpen={() => openConversation(conversation.id)}
            />
          ))}
        </div>
      </aside>
      <section className="thread">
        <div className="thread-bar">
          {current ? (
            <span className="thread-meta">
              <strong>{current.visitorName || "Visitor"}</strong>
              {current.identifier ? <span className="badge badge-outline">{current.identifier}</span> : null}
              {topicLabel(current) ? <span className="badge badge-primary">{topicLabel(current)}</span> : null}
              {current.metadata?.offline === "true" ? <span className="badge badge-outline">Email</span> : null}
              {current.assigneeName ? (
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
              {current ? (
                <button className="btn btn-primary btn-sm" type="button" onClick={assign} disabled={mine || assigning}>
                  {mine ? "Assigned to you" : current.assigneeName ? "Reassign to me" : "Assign to me"}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
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
            <label className="btn btn-outline btn-sm attach">
              Attach
              <input
                type="file"
                disabled={sending}
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
              placeholder="Reply as an agent…"
              value={reply}
              disabled={sending}
              onChange={(event) => setReply(event.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={sending || (!reply.trim() && !pendingFile)}>
              {sending ? "Sending" : "Send"}
            </button>
            <button className="btn btn-outline" type="button" onClick={closeTicket}>Close</button>
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
            <code>{page.path}</code>
            <span>{stayLabel(page, now)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function topicLabel(conversation: Conversation): string {
  return conversation.metadata?.topic?.trim() ?? "";
}

function stayLabel(page: PageVisit, now: number): string {
  const start = Date.parse(page.startedAt);
  const end = page.endedAt ? Date.parse(page.endedAt) : now;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const text = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return page.endedAt ? text : `${text} · here now`;
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
  return (
    <div className={active ? "item active" : "item"} onClick={onOpen}>
      <strong>{conversation.visitorName || "Visitor"}</strong>{" "}
      {conversation.unreadForAgent ? <span className="badge badge-primary">{conversation.unreadForAgent}</span> : null}{" "}
      {conversation.assigneeName ? (
        <span className="badge badge-outline">{conversation.assigneeName}</span>
      ) : (
        <span className="badge">unassigned</span>
      )}
      {conversation.metadata?.offline === "true" ? null : conversation.status === "closed" ? <span className="badge badge-outline">closed</span> : null}
      <br />
      <small>{topicLabel(conversation) || conversation.visitorEmail || conversation.id}</small>
    </div>
  );
}

function MessageView({ message }: { message: Message }) {
  const label = formatMessageTime(message.createdAt);
  const files = message.attachments ?? [];
  return (
    <div className={`msg ${message.role}`}>
      {message.body ? <div className="bubble">{message.agentName ? `${message.agentName}: ` : ""}{message.body}</div> : null}
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
