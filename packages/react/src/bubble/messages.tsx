"use client";

import { useEffect, useState } from "react";
import { File, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo } from "lucide-react";
import type { AiActionHandler, Attachment, SupportMessage } from "../types.js";

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  if (sameDay) return time;
  const day = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${day}, ${time}`;
}

export function mergeMessages(
  current: SupportMessage[],
  incoming: SupportMessage[],
): SupportMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function TypingIndicator({ name }: { name: string }) {
  return (
    <article className="osb-message osb-message-agent" aria-live="polite">
      <span className="osb-agent">{name}</span>
      <div className="osb-bubble osb-typing" role="status">
        <span className="osb-sr">{name} is writing a reply</span>
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

export function receiptFor(
  message: SupportMessage,
  next: SupportMessage | undefined,
  agentReadAt: string | null,
): string | null {
  if (
    message.role !== "visitor" ||
    !agentReadAt ||
    message.createdAt > agentReadAt
  )
    return null;
  if (next?.role === "visitor" && next.createdAt <= agentReadAt) return null;
  return message.readAt && message.readAt > agentReadAt
    ? message.readAt
    : agentReadAt;
}

export function actionsForMessage(
  message: SupportMessage,
  actions: AiActionHandler[],
): AiActionHandler[] {
  const ids = message.actionIds ?? [];
  if (message.role !== "agent" || ids.length === 0) return [];
  const byId = new Map(actions.map((action) => [action.id, action]));
  const matched: AiActionHandler[] = [];
  for (const id of ids) {
    const action = byId.get(id);
    if (action && !matched.some((item) => item.id === action.id))
      matched.push(action);
  }
  return matched;
}

export function MessageView({
  message,
  previous,
  next,
  serverUrl,
  assigneeName,
  readAt = null,
  actions = [],
  actionBusy = null,
  disabled = false,
  waitingMessage,
  onAction,
}: {
  message: SupportMessage;
  previous?: SupportMessage;
  next?: SupportMessage;
  serverUrl: string;
  assigneeName?: string | null;
  readAt?: string | null;
  actions?: AiActionHandler[];
  actionBusy?: number | null;
  disabled?: boolean;
  waitingMessage?: string;
  onAction?: (action: AiActionHandler) => void;
}) {
  const time = formatMessageTime(message.createdAt);
  const files = message.attachments ?? [];
  const name = speakerName(message, assigneeName);
  const continues = sameGroup(previous, message, assigneeName);
  const opensNext = sameGroup(message, next, assigneeName);
  return (
    <article
      className={[
        "osb-message",
        `osb-message-${message.role}`,
        continues ? "is-continued" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {name && !continues ? <span className="osb-agent">{name}</span> : null}
      {message.actionLabel ? (
        <div className="osb-provided">
          <span className="osb-provided-mark" aria-hidden="true" />
          <span>Provided {message.actionLabel}</span>
        </div>
      ) : message.body ? (
        <JoinedBody message={message} waitingMessage={waitingMessage} assigneeName={assigneeName} />
      ) : null}
      {files.length > 0 ? (
        <div className="osb-files">
          {files.map((file) => (
            <FileView key={file.id} file={file} serverUrl={serverUrl} />
          ))}
        </div>
      ) : null}
      {actions.length > 0 ? (
        <div className="osb-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="osb-action"
              disabled={disabled || actionBusy !== null}
              onClick={() => onAction?.(action)}
            >
              {actionBusy === action.id ? "Sending…" : action.label}
            </button>
          ))}
        </div>
      ) : null}
      {time && !opensNext ? (
        <time className="osb-time" dateTime={message.createdAt}>
          {time}
          {readAt ? <span className="osb-read">Read</span> : null}
        </time>
      ) : null}
    </article>
  );
}

/** The waiting line becomes a check once a person has claimed the chat. */
export function joinedWaitingMessage(
  message: SupportMessage,
  waitingMessage: string,
  assigneeName?: string | null,
): SupportMessage {
  const name = assigneeName?.trim();
  if (message.role !== "system" || !name || message.body !== waitingMessage)
    return message;
  return { ...message, body: `${name} joined` };
}

function JoinedBody({
  message,
  waitingMessage,
  assigneeName,
}: {
  message: SupportMessage;
  waitingMessage?: string;
  assigneeName?: string | null;
}) {
  const joined = message.role === "system" && Boolean(assigneeName?.trim()) && message.body === waitingMessage;
  const settled = message.role === "system" && joinedNotice(message.body);
  const [shown, setShown] = useState(settled);
  useEffect(() => {
    if (!joined) return;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [joined]);
  if (!joined && !settled) {
    return (
      <div className="osb-bubble">
        <p>{message.body}</p>
      </div>
    );
  }
  const label = settled ? message.body : `${assigneeName?.trim()} joined`;
  const tight = shown || settled;
  return (
    <div className={tight ? "osb-bubble osb-joined is-settled" : "osb-bubble osb-joined"}>
      <span className="osb-join">
        <span className="osb-join-wait">{waitingMessage || message.body}</span>
        <span className="osb-join-done">
          <span className="osb-provided-mark" aria-hidden="true" />
          <span>{label}</span>
        </span>
      </span>
    </div>
  );
}

function joinedNotice(body: string): boolean {
  return / joined$/.test(body);
}

/** Same speaker inside the same clock minute reads as one group. */
function sameGroup(
  previous: SupportMessage | undefined,
  message: SupportMessage | undefined,
  assigneeName?: string | null,
): boolean {
  if (
    !previous ||
    !message ||
    previous.role !== message.role ||
    previous.role === "system"
  )
    return false;
  if (
    speakerName(previous, assigneeName) !== speakerName(message, assigneeName)
  )
    return false;
  const before = new Date(previous.createdAt);
  const after = new Date(message.createdAt);
  if (Number.isNaN(before.getTime()) || Number.isNaN(after.getTime()))
    return false;
  return (
    before.getFullYear() === after.getFullYear() &&
    before.getMonth() === after.getMonth() &&
    before.getDate() === after.getDate() &&
    before.getHours() === after.getHours() &&
    before.getMinutes() === after.getMinutes()
  );
}

/** The desk stores its own replies as "You". Visitors should see the agent who joined. */
function speakerName(
  message: SupportMessage,
  assigneeName?: string | null,
): string | null {
  if (message.role !== "agent") return null;
  const stored = message.agentName?.trim();
  if (stored && stored.toLowerCase() !== "you") return stored;
  return assigneeName?.trim() || null;
}

function FileView({
  file,
  serverUrl,
}: {
  file: Attachment;
  serverUrl: string;
}) {
  const href = `${serverUrl.replace(/\/+$/, "")}${file.url}`;
  const kind = fileKind(file);
  return (
    <a className="osb-file" href={href} target="_blank" rel="noreferrer">
      {kind === "image" ? <img src={href} alt="" /> : null}
      <span className="osb-file-row">
        <FileTypeIcon kind={kind} />
        <span>{file.name}</span>
      </span>
    </a>
  );
}

type FileKind =
  "image" | "video" | "audio" | "pdf" | "zip" | "code" | "text" | "file";

function fileKind(file: { name: string; mimeType: string }): FileKind {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (
    file.mimeType.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
  )
    return "image";
  if (
    file.mimeType.startsWith("video/") ||
    ["mp4", "webm", "mov"].includes(ext)
  )
    return "video";
  if (file.mimeType.startsWith("audio/") || ["mp3", "wav", "m4a"].includes(ext))
    return "audio";
  if (file.mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (["zip", "gz", "tgz"].includes(ext)) return "zip";
  if (
    [
      "json",
      "js",
      "ts",
      "tsx",
      "jsx",
      "css",
      "html",
      "xml",
      "yml",
      "yaml",
    ].includes(ext)
  )
    return "code";
  if (file.mimeType.startsWith("text/") || ["txt", "csv", "md"].includes(ext))
    return "text";
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
  return (
    <Icon
      className={`osb-file-icon osb-file-icon-${kind}`}
      size={18}
      strokeWidth={1.75}
      aria-hidden="true"
    />
  );
}
