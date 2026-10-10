import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Check, RotateCcw } from "lucide-react";
import { api } from "./api.js";
import { formatMessageTime } from "./format.js";
import { connectDesk } from "./live.js";
import type { Conversation } from "./types.js";

function isOffline(conversation: Conversation): boolean {
  return conversation.metadata?.offline === "true";
}

function noteBody(conversation: Conversation): string {
  const visitor = [...(conversation.messages ?? [])].reverse().find((message) => message.role === "visitor" && message.body.trim());
  return visitor?.body.trim() || "No message was left.";
}

export function Messages() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const location = useLocation();

  const notes = useMemo(
    () => conversations.filter(isOffline).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [conversations],
  );
  const openNotes = notes.filter((note) => !note.resolvedAt);
  const doneNotes = notes.filter((note) => note.resolvedAt);
  const visible = showResolved ? notes : openNotes;
  const selected = notes.find((note) => note.id === selectedId) ?? visible[0] ?? null;
  const attention = openNotes.reduce((sum, note) => sum + Math.max(note.unreadForAgent, note.agentReadAt ? 0 : 1), 0);

  async function load() {
    const data = await api<{ conversations: Conversation[] }>("/api/conversations");
    const offline = data.conversations.filter(isOffline);
    const detailed = await Promise.all(
      offline.map((conversation) =>
        api<{ conversation: Conversation }>(`/api/conversations/${conversation.id}`).then((result) => result.conversation),
      ),
    );
    setConversations(detailed);
    setLoaded(true);
  }

  useEffect(() => {
    if (location.pathname !== "/messages") return;
    load().catch(() => setLoaded(true));
  }, [location.pathname]);

  useEffect(() => {
    return connectDesk((event) => {
      if (event.type !== "conversation" && event.type !== "message") return;
      if (!isOffline(event.conversation)) return;
      setConversations((current) => {
        const index = current.findIndex((conversation) => conversation.id === event.conversation.id);
        const next = event.type === "message"
          ? { ...event.conversation, messages: merge(index === -1 ? [] : current[index]?.messages ?? [], [event.message]) }
          : { ...current[index], ...event.conversation, messages: current[index]?.messages };
        if (index === -1) return [event.type === "message" ? next : event.conversation, ...current];
        const copy = current.slice();
        copy[index] = next;
        return copy;
      });
    });
  }, []);

  async function openNote(id: string) {
    setSelectedId(id);
    const note = conversations.find((conversation) => conversation.id === id);
    if (!note || note.agentReadAt && note.unreadForAgent === 0) return;
    try {
      const result = await api<{ conversation: Conversation }>(`/api/conversations/${id}/read`, { method: "POST", body: "{}" });
      setConversations((current) => current.map((conversation) => (
        conversation.id === id ? { ...conversation, ...result.conversation, messages: conversation.messages } : conversation
      )));
    } catch {
      /* Opening the note still shows it. */
    }
  }

  async function mark(resolved: boolean) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await api<{ conversation: Conversation }>(`/api/conversations/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ resolved }),
      });
      setConversations((current) => current.map((conversation) => (
        conversation.id === selected.id ? { ...conversation, ...result.conversation, messages: result.conversation.messages ?? conversation.messages } : conversation
      )));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update this message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inbox messages-desk">
      <aside className="list">
        <section className="queue is-hot">
          <div className="list-head">
            <span>Needs attention</span>
            {attention ? <span className="queue-count">{attention}</span> : null}
          </div>
          <div className="queue-body">
            {loaded && openNotes.length === 0 ? <p className="queue-empty">No unresolved messages.</p> : null}
            {openNotes.map((note) => (
              <NoteRow key={note.id} note={note} active={note.id === selected?.id} onOpen={() => void openNote(note.id)} />
            ))}
          </div>
        </section>
        <section className="queue is-quiet">
          <div className="list-head">
            <span>Resolved</span>
            <button className="btn btn-link" type="button" onClick={() => setShowResolved((value) => !value)}>
              {showResolved ? "Hide" : `Show ${doneNotes.length}`}
            </button>
          </div>
          {showResolved ? (
            <div className="queue-body">
              {doneNotes.length === 0 ? <p className="queue-empty">Nothing resolved yet.</p> : null}
              {doneNotes.map((note) => (
                <NoteRow key={note.id} note={note} active={note.id === selected?.id} onOpen={() => void openNote(note.id)} />
              ))}
            </div>
          ) : null}
        </section>
      </aside>
      <section className="thread">
        {selected ? (
          <>
            <div className="thread-bar">
              <span className="thread-meta">
                <strong>{selected.visitorName || "Visitor"}</strong>
                {selected.visitorEmail ? <span className="badge badge-outline">{selected.visitorEmail}</span> : null}
                {selected.resolvedAt ? <span className="badge badge-outline">Resolved</span> : <span className="badge">Unresolved</span>}
                {!selected.agentReadAt || selected.unreadForAgent > 0 ? <span className="badge badge-primary">Unread</span> : null}
              </span>
              <span className="spacer" />
              {selected.resolvedAt ? (
                <button className="btn btn-outline btn-sm" type="button" disabled={busy} onClick={() => void mark(false)}>
                  <RotateCcw size={14} strokeWidth={1.75} />
                  Reopen
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void mark(true)}>
                  <Check size={14} strokeWidth={1.75} />
                  {busy ? "Saving" : "Mark resolved"}
                </button>
              )}
            </div>
            <article className="offline-note">
              <p className="kicker">Left while the desk was closed</p>
              <h2>{noteBody(selected)}</h2>
              <p className="muted">
                {selected.visitorEmail || "No email"}
                {" · "}
                {formatMessageTime(selected.createdAt) || selected.createdAt}
                {selected.resolvedAt ? ` · Resolved ${formatMessageTime(selected.resolvedAt) || ""}` : ""}
              </p>
            </article>
            <div id="messages">
              {(selected.messages ?? []).map((message) => (
                <div className={`msg ${message.role}`} key={message.id}>
                  <div className="bubble">{message.body}</div>
                  <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="muted" style={{ padding: 20 }}>{loaded ? "No messages left outside open hours." : "Loading messages…"}</p>
        )}
      </section>
    </div>
  );
}

function NoteRow({ note, active, onOpen }: { note: Conversation; active: boolean; onOpen: () => void }) {
  const unread = !note.agentReadAt || note.unreadForAgent > 0;
  return (
    <button type="button" className={["item", active ? "active" : "", unread && !note.resolvedAt ? "is-waiting" : ""].filter(Boolean).join(" ")} onClick={onOpen}>
      <span className="item-top">
        <strong>{note.visitorName || note.visitorEmail || "Visitor"}</strong>
        {unread && !note.resolvedAt ? <span className="badge badge-primary">New</span> : null}
        <span className="item-time">{formatMessageTime(note.createdAt)}</span>
      </span>
      <span className="item-subject">{noteBody(note)}</span>
      <span className="item-meta">
        {note.resolvedAt ? <span className="badge badge-outline">Resolved</span> : <span className="badge">Unresolved</span>}
        {note.visitorEmail ? <span className="item-mail">{note.visitorEmail}</span> : null}
      </span>
    </button>
  );
}

function merge<T extends { id: string; createdAt: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Unread offline notes, plus resolved-but-still-unread ones, for the header badge. */
export function offlineAttention(conversations: Conversation[]): number {
  return conversations.filter(isOffline).reduce((sum, note) => {
    if (note.resolvedAt) return sum;
    return sum + Math.max(note.unreadForAgent, note.agentReadAt ? 0 : 1);
  }, 0);
}
