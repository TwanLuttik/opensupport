import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type Phase = "welcome" | "chat" | "confirm" | "ended";

interface DemoMessage {
  id: number;
  role: "visitor" | "agent" | "system";
  body: string;
  name?: string;
  read?: boolean;
}

const TOPICS = [
  { id: "exports", label: "Exports", reply: "Looking now. Which plan is the workspace on?" },
  { id: "billing", label: "Billing", reply: "I can look that up. Which month is the invoice for?" },
  { id: "account", label: "Account", reply: "Sure. What would you like to change on the account?" },
] as const;

const FALLBACK =
  "This preview stays on the page. A real bubble would send that message to your own server.";

const TYPING_MS = 700;

let nextId = 1;

function message(role: DemoMessage["role"], body: string, extra: Partial<DemoMessage> = {}): DemoMessage {
  nextId += 1;
  return { id: nextId, role, body, ...extra };
}

function replyFor(text: string): string {
  const topic = TOPICS.find((item) => item.label.toLowerCase() === text.trim().toLowerCase());
  if (topic) return topic.reply;
  if (/export|date range/i.test(text)) return TOPICS[0].reply;
  if (/bill|invoice/i.test(text)) return TOPICS[1].reply;
  if (/account|admin/i.test(text)) return TOPICS[2].reply;
  return FALLBACK;
}

/** A self-contained preview of the bubble. Nothing here talks to the support server or the desk. */
export function BubbleStage() {
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>("welcome");
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const node = bodyRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, typing, phase, open]);

  useEffect(() => {
    return () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    };
  }, []);

  function queueReply(text: string) {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    setTyping(true);
    replyTimer.current = setTimeout(() => {
      setTyping(false);
      setMessages((current) => {
        const withRead = current.map((item) => (item.role === "visitor" ? { ...item, read: true } : item));
        return [...withRead, message("agent", replyFor(text), { name: "Sam" })];
      });
    }, TYPING_MS);
  }

  function begin(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    setPhase("chat");
    setDraft("");
    setRating(null);
    setMessages((current) => [
      ...current,
      message("system", "Hi! How can we help?"),
      message("visitor", trimmed),
    ]);
    queueReply(trimmed);
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing || phase !== "chat") return;
    setDraft("");
    setMessages((current) => [...current, message("visitor", trimmed)]);
    queueReply(trimmed);
  }

  function endChat() {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    setTyping(false);
    setPhase("ended");
    setMessages((current) => [...current, message("system", "This conversation has ended.")]);
  }

  function restart() {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    setTyping(false);
    setDraft("");
    setRating(null);
    setMessages([]);
    setPhase("welcome");
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(draft);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  return (
    <div className={open ? "stage" : "stage is-shut"}>
      {open ? (
        <div className="panel" role="dialog" aria-labelledby="demo-bubble-title">
          <div className="panel-head">
            <span className="avatar">
              <ChatMark />
            </span>
            <span>
              <strong id="demo-bubble-title">Support</strong>
              <em>
                <i /> We're online
              </em>
            </span>
            <span className="panel-tools">
              {phase === "chat" ? (
                <button className="panel-end" type="button" onClick={() => setPhase("confirm")}>
                  End chat
                </button>
              ) : null}
              <button className="panel-close" type="button" aria-label="Close chat" onClick={() => setOpen(false)}>
                <CloseMark />
              </button>
            </span>
          </div>
          <div className="panel-body" ref={bodyRef}>
            {phase === "welcome" ? (
              <div className="welcome">
                <p className="greeting">Hi! How can we help?</p>
                <p className="welcome-note">This is a preview. It does not reach a desk.</p>
                <div className="topics">
                  {TOPICS.map((topic) => (
                    <button key={topic.id} className="topic" type="button" onClick={() => begin(topic.label)}>
                      {topic.label}
                    </button>
                  ))}
                </div>
                <button className="start" type="button" onClick={() => begin("The export button does nothing after I pick a date range.")}>
                  Start a conversation
                </button>
              </div>
            ) : (
              <>
                {messages.map((item) =>
                  item.role === "system" ? (
                    <p className="system" key={item.id}>
                      {item.body}
                    </p>
                  ) : item.role === "visitor" ? (
                    <div className="visitor-wrap" key={item.id}>
                      <p className="visitor">{item.body}</p>
                      {item.read ? <span className="read">Read</span> : null}
                    </div>
                  ) : (
                    <p className="agent" key={item.id}>
                      <span>{item.name}</span>
                      {item.body}
                    </p>
                  ),
                )}
                {typing ? (
                  <p className="agent typing" aria-label="Sam is typing">
                    <span>Sam</span>
                    <i />
                    <i />
                    <i />
                  </p>
                ) : null}
                {phase === "ended" ? (
                  <div className="ended">
                    <p>How was this preview?</p>
                    <div className="rate">
                      <button type="button" aria-pressed={rating === "up"} onClick={() => setRating("up")}>
                        Yes
                      </button>
                      <button type="button" aria-pressed={rating === "down"} onClick={() => setRating("down")}>
                        No
                      </button>
                    </div>
                    {rating ? <p className="welcome-note">Thanks. Nothing was sent.</p> : null}
                    <button className="start" type="button" onClick={restart}>
                      Start again
                    </button>
                  </div>
                ) : null}
              </>
            )}
            {phase === "confirm" ? (
              <div className="confirm" role="alertdialog" aria-labelledby="demo-end-title">
                <p id="demo-end-title">End this chat?</p>
                <div className="rate">
                  <button type="button" onClick={() => setPhase("chat")}>
                    Keep chatting
                  </button>
                  <button type="button" onClick={endChat}>
                    End chat
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {phase === "chat" ? (
            <form className="panel-compose" onSubmit={onSubmit}>
              <textarea
                rows={1}
                value={draft}
                placeholder="Write a message…"
                aria-label="Message"
                disabled={typing}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKey}
              />
              <button className="send" type="submit" aria-label="Send" disabled={typing || draft.trim().length === 0}>
                <Arrow />
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
      <button
        className="launcher"
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close support chat" : "Open support chat"}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <CloseMark /> : <ChatMark />}
      </button>
    </div>
  );
}

function ChatMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M6 16.5 4.2 19.2c-.4.6.1 1.4.8 1.3L9 20.2A8 8 0 1 0 6 16.5Z" fill="currentColor" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CloseMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
