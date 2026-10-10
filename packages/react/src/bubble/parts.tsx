"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { PublicConfig } from "../types.js";

const INK_COLORS: NonNullable<PublicConfig["theme"]>["colors"] = {
  accent: "#111827",
  accentText: "#ffffff",
  header: "#111827",
  headerText: "#ffffff",
  panel: "#ffffff",
  canvas: "#f4f5f7",
  ink: "#16181d",
  muted: "#6d727c",
  agentBubble: "#ffffff",
  composer: "#ffffff",
};

/** Server themes win. Older configs only carry an accent, which still paints the header. */
export function bubbleColors(config: PublicConfig): NonNullable<PublicConfig["theme"]>["colors"] {
  const colors = { ...INK_COLORS, ...(config.theme?.colors ?? {}) };
  const accent = /^#[0-9a-fA-F]{6}$/.test(config.accentColor) ? config.accentColor : colors.accent;
  if (!config.theme) {
    colors.accent = accent;
    colors.header = accent;
  }
  return colors;
}

export function mix(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A short two-note boop. One extra note marks a burst of replies. */
export function playBoop(count: number): void {
  const audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!audio) return;
  const context = new audio();
  const now = context.currentTime;
  const notes = count > 1 ? [660, 880, 990] : [660, 880];
  for (const [index, frequency] of notes.entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const start = now + index * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.17);
  }
  window.setTimeout(() => void context.close(), 700);
}


export function currentLocation(): { pathname: string; hash: string } {
  if (typeof window === "undefined") return { pathname: "/", hash: "" };
  return { pathname: window.location.pathname || "/", hash: window.location.hash || "" };
}

/** Next inlines this when the app is served from a subpath. An empty value means the site root. */
export function nextBasePath(): string {
  const value = process.env.NEXT_PUBLIC_BASE_PATH;
  return typeof value === "string" ? value : "";
}


export function absoluteUrl(serverUrl: string, path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${serverUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function HoursTable({ hours }: { hours: PublicConfig["officeHours"] }) {
  const days = hours?.days ?? [];
  if (days.length !== 7) return null;
  const rows = groupHours(days);
  return (
    <div className="osb-hours">
      <span className="osb-topics-label">Open hours</span>
      {rows.map((row) => (
        <div className="osb-hour" key={row.label}>
          <span>{row.label}</span>
          <span>{row.hours}</span>
        </div>
      ))}
    </div>
  );
}

function groupHours(
  days: Array<{ open: number | null; close: number | null }>,
): Array<{ label: string; hours: string }> {
  const rows: Array<{ label: string; hours: string }> = [];
  let index = 0;
  while (index < days.length) {
    const signature = hourSignature(days[index]!);
    let end = index;
    while (end + 1 < days.length && hourSignature(days[end + 1]!) === signature)
      end += 1;
    rows.push({
      label:
        index === end
          ? WEEKDAYS[index]!
          : `${WEEKDAYS[index]!.slice(0, 3)}–${WEEKDAYS[end]!.slice(0, 3)}`,
      hours: signature || "Closed",
    });
    index = end + 1;
  }
  return rows;
}

function hourSignature(day: {
  open: number | null;
  close: number | null;
}): string {
  if (day.open === null || day.close === null) return "";
  return `${clock(day.open)}–${clock(day.close)}`;
}

function clock(minutes: number): string {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function StartChoices({
  config,
  starting,
  disabled,
  aiOffered = false,
  peopleAway = false,
  awayMessage,
  aiName,
  onStart,
  onLeaveMessage,
  fallback = "Start a conversation",
}: {
  config: PublicConfig;
  starting: boolean;
  disabled: boolean;
  aiOffered?: boolean;
  peopleAway?: boolean;
  awayMessage?: string;
  aiName?: string;
  onStart: (topicId?: string, handler?: "human" | "ai") => void;
  onLeaveMessage?: () => void;
  fallback?: string;
}) {
  const topics = peopleAway ? [] : (config.quickActions ?? []);
  const label = aiName?.trim() || "AI assistant";
  const busy = starting ? "Starting…" : null;
  if (!aiOffered) {
    if (peopleAway && onLeaveMessage) {
      return (
        <div className="osb-topics">
          <p className="osb-hint">
            {awayMessage ||
              "We are away right now. Leave your email and we will write back."}
          </p>
          <button
            type="button"
            className="osb-start"
            onClick={onLeaveMessage}
            disabled={disabled}
          >
            Leave a message
          </button>
        </div>
      );
    }
    return (
      <div className="osb-topics">
        {topics.map((action) => (
          <button
            key={action.id}
            type="button"
            className="osb-topic"
            onClick={() => onStart(action.id, "human")}
            disabled={disabled}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="osb-start"
          onClick={() => onStart(undefined, "human")}
          disabled={disabled}
        >
          {busy ?? fallback}
        </button>
      </div>
    );
  }
  return (
    <div className="osb-topics">
      <button
        type="button"
        className="osb-start"
        onClick={() => onStart(undefined, "ai")}
        disabled={disabled}
      >
        {busy ?? `Chat with ${label}`}
      </button>
      {topics.length > 0 ? (
        <span className="osb-topics-label">Or talk to a person about</span>
      ) : null}
      {topics.map((action) => (
        <button
          key={action.id}
          type="button"
          className="osb-topic"
          onClick={() => onStart(action.id, "human")}
          disabled={disabled}
        >
          {action.label}
        </button>
      ))}
      {peopleAway ? (
        <>
          <p className="osb-hint">
            {awayMessage ||
              "We are away right now. Leave your email and we will write back."}
          </p>
          {onLeaveMessage ? (
            <button
              type="button"
              className="osb-topic"
              onClick={onLeaveMessage}
              disabled={disabled}
            >
              Leave a message
            </button>
          ) : null}
        </>
      ) : topics.length === 0 ? (
        <button
          type="button"
          className="osb-topic"
          onClick={() => onStart(undefined, "human")}
          disabled={disabled}
        >
          {busy ?? "Talk to a person"}
        </button>
      ) : null}
    </div>
  );
}

/** Zod's default empty-string message is not something a visitor should read. */
export function friendlyError(error: string): string {
  if (/at least 1 character/i.test(error)) return "Tell us how we can help.";
  return error;
}

export function OfflineForm({
  message,
  email,
  note,
  sent,
  busy,
  error,
  onEmail,
  onNote,
  onBack,
  onSubmit,
}: {
  message: string;
  email: string;
  note: string;
  sent: boolean;
  busy: boolean;
  error: string | null;
  onEmail: (value: string) => void;
  onNote: (value: string) => void;
  onBack?: () => void;
  onSubmit: () => void;
}) {
  if (sent)
    return (
      <div className="osb-welcome">
        <p>Thanks. We will reply by email.</p>
      </div>
    );
  return (
    <form
      className="osb-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {onBack ? (
        <button type="button" className="osb-back" onClick={onBack}>
          Back
        </button>
      ) : null}
      <p className="osb-form-greeting">{message}</p>
      <label className="osb-field" htmlFor="osb-offline-email">
        <span>
          Email<span className="osb-required"> *</span>
        </span>
        <input
          id="osb-offline-email"
          type="email"
          required
          value={email}
          onChange={(event) => onEmail(event.target.value)}
        />
      </label>
      <label className="osb-field" htmlFor="osb-offline-note">
        <span>How can we help?</span>
        <textarea
          id="osb-offline-note"
          rows={4}
          required
          value={note}
          onChange={(event) => onNote(event.target.value)}
        />
      </label>
      {error ? <p className="osb-error">{friendlyError(error)}</p> : null}
      <button type="submit" className="osb-start" disabled={busy}>
        {busy ? "Sending…" : "Leave a message"}
      </button>
    </form>
  );
}

export function RatingPrompt({
  rating,
  choice,
  note,
  busy,
  onChoice,
  onNote,
  onSubmit,
}: {
  rating: "up" | "down" | "skipped" | null;
  choice: "up" | "down" | null;
  note: string;
  busy: boolean;
  onChoice: (choice: "up" | "down") => void;
  onNote: (note: string) => void;
  onSubmit: (rating: "up" | "down" | "skipped") => void;
}) {
  if (rating === "up" || rating === "down")
    return <p className="osb-hint">Thanks for the rating.</p>;
  if (rating === "skipped") return null;
  return (
    <div className="osb-rating">
      <p>How was this chat?</p>
      <div className="osb-votes">
        <button
          type="button"
          className={choice === "up" ? "is-selected" : ""}
          aria-pressed={choice === "up"}
          aria-label="Thumbs up"
          disabled={busy}
          onClick={() => onChoice("up")}
        >
          <ThumbsUp size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={choice === "down" ? "is-selected" : ""}
          aria-pressed={choice === "down"}
          aria-label="Thumbs down"
          disabled={busy}
          onClick={() => onChoice("down")}
        >
          <ThumbsDown size={18} strokeWidth={1.75} />
        </button>
      </div>
      {choice ? (
        <form
          className="osb-rating-note"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(choice);
          }}
        >
          <textarea
            value={note}
            maxLength={500}
            rows={2}
            placeholder="Add a comment (optional)"
            onChange={(event) => onNote(event.target.value)}
          />
          <button type="submit" className="osb-start" disabled={busy}>
            {busy ? "Sending…" : "Send rating"}
          </button>
        </form>
      ) : null}
      <button
        type="button"
        className="osb-archive"
        onClick={() => onSubmit("skipped")}
        disabled={busy}
      >
        Skip
      </button>
    </div>
  );
}
