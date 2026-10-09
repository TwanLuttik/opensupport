"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type AnimationEvent as ReactAnimationEvent, type CSSProperties, type DragEvent, type FormEvent } from "react";
import { Camera, File, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo, ThumbsDown, ThumbsUp } from "lucide-react";
import { capturePage } from "./screenshot.js";
import { clearStoredSession, createClient, isStaleSessionError, loadStoredSession, saveStoredSession } from "./client.js";
import { BUBBLE_RECONNECTS, connectLive, sendTyping, widgetSocketUrl } from "./live.js";
import type { AiActionHandler, Attachment, PublicConfig, StoredSession, SupportBubbleProps, SupportConversation, SupportMessage } from "./types.js";
import { UPLOAD_MAX_BYTES } from "./client.js";

const DEFAULT_CONFIG: PublicConfig = {
  title: "Support",
  subtitle: "We typically reply within a few minutes.",
  accentColor: "#111827",
  theme: {
    id: "ink",
    colors: {
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
    },
  },
  placeholder: "Write a message…",
  greeting: "Hi! How can we help?",
  formEnabled: false,
  formTitle: "Before we start",
  formSubmitLabel: "Start conversation",
  formFields: [],
  waitingMessage: "Waiting for an agent",
  quickActions: [],
  logoUrl: null,
};

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (sameDay) return time;
  const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  return `${day}, ${time}`;
}

function mergeMessages(current: SupportMessage[], incoming: SupportMessage[]): SupportMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function IconChat() {
  return (
    <svg className="osb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5.2 4.8A2.2 2.2 0 0 1 7.4 2.6h9.2a2.2 2.2 0 0 1 2.2 2.2v7.2a2.2 2.2 0 0 1-2.2 2.2H9.1L5.6 17.4a.9.9 0 0 1-1.4-.7V4.8Z"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="osb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconClip() {
  return (
    <svg className="osb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7.1 7.2a4.2 4.2 0 0 1-6-6L12 5.5"
      />
    </svg>
  );
}

function IconSend() {
  return (
    <svg className="osb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.2 11.1 19.4 3.6c.7-.3 1.4.4 1.1 1.1l-6.4 16.2c-.3.8-1.4.8-1.8.1l-2.2-4.8-4.8-2.2c-.7-.4-.7-1.5.1-1.9Z"
      />
    </svg>
  );
}

export function SupportBubble({
  serverUrl,
  identifier,
  visitor,
  actions = [],
  pollIntervalMs = 3000,
  onOpenChange,
  className,
}: SupportBubbleProps) {
  const titleId = useId();
  const client = useMemo(() => createClient(serverUrl), [serverUrl]);
  const [open, setOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [assigneeName, setAssigneeName] = useState<string | null>(null);
  const [assigneeAvatar, setAssigneeAvatar] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | "skipped" | null>(null);
  const [ratingChoice, setRatingChoice] = useState<"up" | "down" | null>(null);
  const [ratingNote, setRatingNote] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [offlineEmail, setOfflineEmail] = useState(visitor?.email ?? "");
  const [offlineSent, setOfflineSent] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [withAi, setWithAi] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [staffOnline, setStaffOnline] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const sessionRef = useRef<StoredSession | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenAgentIds = useRef(new Set<string>());
  const openRef = useRef(open);
  openRef.current = open;
  const socketRef = useRef<WebSocket | null>(null);
  const [live, setLive] = useState<"connecting" | "open" | "polling">("connecting");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [agentReadAt, setAgentReadAt] = useState<string | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const typingStop = useRef(0);

  useEffect(() => {
    let cancelled = false;
    client
      .getConfig()
      .then((next) => {
        if (!cancelled) {
          setConfig({ ...DEFAULT_CONFIG, ...next, quickActions: next.quickActions ?? [] });
          setStaffOnline(Boolean(next.staffOnline));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Support is unavailable right now.");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refreshStatus = () => {
      client
        .getConfig()
        .then((next) => {
          if (!cancelled) setStaffOnline(Boolean(next.staffOnline));
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refreshStatus, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, open]);

  const applyConversation = useCallback((conversation: SupportConversation) => {
    setClosed(conversation.status === "closed");
    setAgentName(conversation.agentName);
    setAssigneeName(conversation.assigneeName ?? null);
    setAssigneeAvatar(conversation.assigneeAvatarUrl ?? null);
    setRating(conversation.rating ?? null);
    if (conversation.agentReadAt) setAgentReadAt(conversation.agentReadAt);
    if (conversation.metadata?.handler === "ai") setWithAi(true);
  }, []);

  const noteAgents = useCallback((incoming: SupportMessage[], notify: boolean) => {
    let fresh = 0;
    for (const message of incoming) {
      if (message.role !== "agent" || seenAgentIds.current.has(message.id)) continue;
      seenAgentIds.current.add(message.id);
      if (notify && !openRef.current) fresh += 1;
    }
    if (fresh === 0) return;
    setUnseen((count) => count + fresh);
    playBoop(fresh);
  }, []);

  const refresh = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const thread = await client.getThread(session);
    setMessages(thread.messages);
    noteAgents(thread.messages, false);
    applyConversation(thread.conversation);
    setConversationId(thread.conversation.id);
    setReady(true);
  }, [applyConversation, client, noteAgents]);

  useEffect(() => {
    sessionRef.current = loadStoredSession(serverUrl);
    setHasSession(Boolean(sessionRef.current));
    if (!sessionRef.current) {
      setReady(true);
      return;
    }
    refresh().catch((err: unknown) => {
      if (isStaleSessionError(err)) {
        setSessionLost(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load the conversation.");
    });
  }, [refresh, serverUrl]);

  useEffect(() => {
    if (!sessionLost || !sessionRef.current) return;
    sessionRef.current = null;
    setHasSession(false);
    setConversationId(null);
    setMessages([]);
    setClosed(false);
    setConfirmEnd(false);
    setReady(true);
    clearStoredSession(serverUrl);
  }, [serverUrl, sessionLost]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!hasSession || closed || !session || typeof window === "undefined") return;
    let last = "";
    const report = () => {
      const current = sessionRef.current;
      if (!current) return;
      const path = window.location.pathname.slice(0, 300) || "/";
      if (path === last) return;
      last = path;
      client.reportPage(current, path).catch(() => undefined);
    };
    report();
    const timer = window.setInterval(report, 1000);
    window.addEventListener("popstate", report);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", report);
    };
  }, [client, closed, hasSession]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!hasSession || !session || closed || typeof window === "undefined" || typeof WebSocket === "undefined") {
      setLive("polling");
      return;
    }
    setLive("connecting");
    return connectLive({
      url: widgetSocketUrl(serverUrl, session),
      retries: BUBBLE_RECONNECTS,
      socketRef,
      onStatus: (status) => {
        setLive(status === "failed" ? "polling" : status === "open" ? "open" : "connecting");
        if (status !== "open") setPeerTyping(false);
      },
      onEvent: (event) => {
        const data = event as {
          type?: string;
          message?: SupportMessage;
          conversation?: SupportConversation;
          role?: string;
          readAt?: string;
          typing?: boolean;
        };
        if (data.conversation && data.conversation.id === session.conversationId) applyConversation(data.conversation);
        if (data.type === "message" && data.message && data.message.conversationId === session.conversationId) {
          noteAgents([data.message], true);
          setMessages((current) => mergeMessages(current, [data.message!]));
          setPeerTyping(false);
        }
        if (data.type === "read" && data.role === "agent" && data.readAt) {
          setAgentReadAt((current) => (current && current > data.readAt! ? current : data.readAt!));
        }
        if (data.type === "typing" && data.role === "agent") setPeerTyping(Boolean(data.typing));
      },
    });
  }, [applyConversation, closed, conversationId, hasSession, noteAgents, serverUrl]);

  useEffect(() => {
    if (!hasSession || closed || live !== "polling") return;
    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;
      const last = messages.at(-1)?.createdAt;
      client
        .getThread(session, last)
        .then((thread) => {
          if (thread.messages.length > 0) {
            noteAgents(thread.messages, true);
            setMessages((current) => mergeMessages(current, thread.messages));
          }
          applyConversation(thread.conversation);
        })
        .catch(() => undefined);
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [applyConversation, client, closed, hasSession, live, messages, noteAgents, pollIntervalMs]);

  useEffect(() => {
    if (!confirmEnd) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !ending) setConfirmEnd(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmEnd, ending]);

  useEffect(() => {
    if (!open) return;
    setUnseen(0);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open, peerTyping]);

  useEffect(() => {
    if (!open || !hasSession || closed) return;
    const session = sessionRef.current;
    if (!session || !messages.some((message) => message.role === "agent")) return;
    const timer = window.setTimeout(() => {
      client.markRead(session).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [client, closed, hasSession, messages, open]);

  useEffect(() => {
    if (!open || !hasSession || closed || sending) {
      window.clearTimeout(typingStop.current);
      sendTyping(socketRef.current, false);
    }
  }, [closed, hasSession, open, sending]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
  }, [draft, open]);

  function toggle(next: boolean) {
    setOpen(next);
    if (next) setPanelMounted(true);
    onOpenChange?.(next);
    if (next) setUnseen(0);
  }

  function panelHidden(event: ReactAnimationEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || event.animationName !== "osb-sink") return;
    setPanelMounted(false);
  }

  function forgetConversation() {
    sessionRef.current = null;
    setHasSession(false);
    setSessionLost(false);
    setConversationId(null);
    setMessages([]);
    setAgentName(null);
    setAssigneeName(null);
    setAssigneeAvatar(null);
    setClosed(false);
    setConfirmEnd(false);
    setShowArchive(false);
    setRating(null);
    setRatingChoice(null);
    setRatingNote("");
    setFormValues({});
    setFormError(null);
    setWithAi(false);
    setAiThinking(false);
    setDraft("");
    setPendingFile(null);
    setUploadProgress(null);
    setDragOver(false);
    setPeerTyping(false);
    setAgentReadAt(null);
    window.clearTimeout(typingStop.current);
    sendTyping(socketRef.current, false);
    clearStoredSession(serverUrl);
  }

  async function startConversation(topicId?: string, handler?: "human" | "ai") {
    if (starting) return;
    if (sessionRef.current && !closed) return;
    if (closed) forgetConversation();
    const needsForm = config.formEnabled && config.formFields.length > 0;
    if (needsForm) {
      for (const field of config.formFields) {
        const value = (formValues[field.id] ?? "").trim();
        if (field.required && !value) {
          setFormError(`${field.label} is required.`);
          return;
        }
        if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          setFormError(`${field.label} must be an email.`);
          return;
        }
      }
    }
    setStarting(true);
    setError(null);
    setFormError(null);
    try {
      const fields = needsForm
        ? Object.fromEntries(config.formFields.map((field) => [field.id, (formValues[field.id] ?? "").trim()]))
        : undefined;
      const topic = topicId ?? (needsForm ? formValues.topic : undefined);
      const away = !isLive && handler !== "ai";
      if (away) {
        const email = (offlineEmail || visitor?.email || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setFormError("Email is required so we can reply.");
          setStarting(false);
          return;
        }
      }
      const started = await client.start({
        visitorName: visitor?.name,
        visitorEmail: away ? offlineEmail.trim() : visitor?.email,
        identifier: identifier?.trim() || undefined,
        metadata: visitor?.metadata,
        fields,
        topic,
        offline: away || undefined,
        message: away ? draft.trim() : undefined,
        handler: !away && handler === "ai" ? "ai" : undefined,
      });
      const session = { conversationId: started.conversation.id, visitorToken: started.visitorToken };
      sessionRef.current = session;
      setHasSession(true);
      saveStoredSession(serverUrl, session);
      setMessages(started.messages);
      noteAgents(started.messages, false);
      applyConversation(started.conversation);
      setConversationId(started.conversation.id);
      setWithAi(handler === "ai" && !away);
      if (away) {
        setOfflineSent(true);
        setClosed(false);
        setHasSession(false);
        sessionRef.current = null;
        clearStoredSession(serverUrl);
      }
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the conversation.");
    } finally {
      setStarting(false);
    }
  }

  async function endConversation() {
    const session = sessionRef.current;
    if (!session || ending || closed) return;
    setEnding(true);
    setError(null);
    try {
      const conversation = await client.close(session);
      applyConversation(conversation);
      setConfirmEnd(false);
      setShowArchive(false);
    } catch (err) {
      if (isStaleSessionError(err)) {
        setSessionLost(true);
        setConfirmEnd(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not end the conversation.");
    } finally {
      setEnding(false);
    }
  }

  async function submitRating(next: "up" | "down" | "skipped") {
    const session = sessionRef.current;
    if (!session || ratingBusy || rating) return;
    setRatingBusy(true);
    setError(null);
    try {
      const conversation = await client.rate(session, next, next === "skipped" ? undefined : ratingNote);
      applyConversation(conversation);
      setRatingChoice(null);
      setRatingNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your rating.");
    } finally {
      setRatingBusy(false);
    }
  }

  async function takeScreenshot() {
    if (capturing || sending || closed) return;
    setCapturing(true);
    setError(null);
    try {
      chooseFile(await capturePage(rootRef.current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not take the screenshot.");
    } finally {
      setCapturing(false);
    }
  }

  function chooseFile(file: File | null) {
    if (!file) {
      setPendingFile(null);
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setError("Files can be up to 50 MB.");
      return;
    }
    setError(null);
    setPendingFile(file);
  }

  function onDragEnter(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files") || !started || closed || sending) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragOver(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files") || !started || closed || sending) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }

  function onDrop(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (!started || closed || sending) return;
    const file = event.dataTransfer.files[0];
    if (file) chooseFile(file);
  }

  async function postVisitorMessage(session: StoredSession, body: string, attachmentIds?: string[], actionLabel?: string) {
    const message = await client.send(session, body, attachmentIds, actionLabel);
    noteAgents([message], false);
    setMessages((current) => mergeMessages(current, [message]));
    if (withAi && body.trim()) {
      setAiThinking(true);
      const reply = await client.askAi(session);
      noteAgents([reply], false);
      setMessages((current) => mergeMessages(current, [reply]));
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    const session = sessionRef.current;
    const file = pendingFile;
    if ((!body && !file) || !session || sending || closed) return;
    setSending(true);
    setError(null);
    try {
      let attachmentIds: string[] | undefined;
      if (file) {
        setUploadProgress(0);
        const uploaded = await client.upload(session, { name: file.name, type: file.type, bytes: file }, (loaded, total) => {
          setUploadProgress(total === 0 ? 0 : loaded / total);
        });
        attachmentIds = [uploaded.id];
      }
      await postVisitorMessage(session, body, attachmentIds);
      setDraft("");
      setPendingFile(null);
    } catch (err) {
      if (isStaleSessionError(err)) {
        setSessionLost(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSending(false);
      setAiThinking(false);
      setUploadProgress(null);
    }
  }

  async function runAction(action: AiActionHandler) {
    const session = sessionRef.current;
    if (!session || sending || closed || actionBusy !== null) return;
    setActionBusy(action.id);
    setSending(true);
    setError(null);
    try {
      const body = (await action.handler()).trim();
      if (!body) return;
      await postVisitorMessage(session, body, undefined, action.label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run that action.");
    } finally {
      setActionBusy(null);
      setSending(false);
      setAiThinking(false);
    }
  }

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    void startConversation();
  }

  const colors = bubbleColors(config);
  const rootStyle = {
    "--osb-accent": colors.accent,
    "--osb-accent-text": colors.accentText,
    "--osb-header": colors.header,
    "--osb-header-text": colors.headerText,
    "--osb-panel": colors.panel,
    "--osb-canvas": colors.canvas,
    "--osb-ink": colors.ink,
    "--osb-muted": colors.muted,
    "--osb-agent": colors.agentBubble,
    "--osb-composer": colors.composer,
    "--osb-line": mix(colors.ink, 0.12),
  } as CSSProperties;
  const logoUrl = config.logoUrl ? absoluteUrl(serverUrl, config.logoUrl) : "";
  const started = hasSession;
  const waiting = started && !closed && !assigneeName && !withAi;
  const showTranscript = started && !closed;
  const aiLabel = config.ai?.agentName?.trim() || agentName || "AI assistant";
  const isLive = !config.officeHours?.enabled || config.officeHours.open;
  const peopleHere = staffOnline && isLive;
  // A closed chat is over, so the header goes back to the desk instead of the agent who joined.
  const activeAgent = !closed && assigneeName ? assigneeName : null;
  const agentPhoto = activeAgent && assigneeAvatar ? absoluteUrl(serverUrl, assigneeAvatar) : "";
  const subtitle = closed
    ? "This conversation has ended"
    : activeAgent
      ? `${activeAgent} joined the conversation`
      : withAi
        ? `${aiLabel} is answering`
        : waiting
          ? config.waitingMessage
          : agentName
            ? `${agentName} is handling this`
            : peopleHere
              ? "We're online"
              : "We're away";
  const aiOffered = Boolean(config.ai?.enabled);
  const showForm = !started && (isLive || aiOffered) && config.formEnabled && config.formFields.length > 0;

  return (
    <div className={["osb-root", className].filter(Boolean).join(" ")} style={rootStyle} ref={rootRef}>
      {panelMounted ? (
        <section
          className={["osb-panel", dragOver ? "is-drop" : "", open ? "" : "is-closing"].filter(Boolean).join(" ")}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-hidden={open ? undefined : true}
          onAnimationEnd={panelHidden}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <header className="osb-header">
            <div className="osb-brand">
              <span className="osb-avatar" aria-hidden="true">
                {agentPhoto ? (
                  <img src={agentPhoto} alt="" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="" />
                ) : (
                  <IconChat />
                )}
              </span>
              <div className="osb-heading">
                <h2 id={titleId}>{config.title}</h2>
                <p className="osb-status">
                  <span className={!closed && peopleHere ? "osb-status-dot is-online" : "osb-status-dot"} aria-hidden="true" />
                  <span>{subtitle}</span>
                </p>
              </div>
            </div>
            <div className="osb-header-actions">
              {started && !closed ? (
                <button type="button" className="osb-end" onClick={() => setConfirmEnd(true)} disabled={ending}>
                  End chat
                </button>
              ) : null}
              <button type="button" className="osb-icon-button" onClick={() => toggle(false)} aria-label="Close chat">
                <IconClose />
              </button>
            </div>
          </header>
          <div className="osb-messages" ref={listRef}>
            {!started && showForm ? (
              <form className="osb-form" onSubmit={onFormSubmit}>
                <p className="osb-form-greeting">{config.greeting}</p>
                {config.responseTime?.label ? <p className="osb-response">{config.responseTime.label}</p> : null}
                <h3>{config.formTitle}</h3>
                {config.formFields.map((field) => {
                  const fieldId = `${titleId}-${field.id}`;
                  return (
                    <label key={field.id} className="osb-field" htmlFor={fieldId}>
                      <span>
                        {field.label}
                        {field.required ? <span className="osb-required"> *</span> : null}
                      </span>
                      {field.type === "textarea" ? (
                        <textarea
                          id={fieldId}
                          rows={3}
                          required={field.required}
                          placeholder={field.placeholder}
                          value={formValues[field.id] ?? ""}
                          onChange={(event) =>
                            setFormValues((current) => ({ ...current, [field.id]: event.target.value }))
                          }
                        />
                      ) : field.type === "select" ? (
                        <select
                          id={fieldId}
                          required={field.required}
                          value={formValues[field.id] ?? ""}
                          onChange={(event) =>
                            setFormValues((current) => ({ ...current, [field.id]: event.target.value }))
                          }
                        >
                          <option value="">{field.placeholder || "Choose…"}</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={fieldId}
                          type={field.type === "email" ? "email" : "text"}
                          required={field.required}
                          placeholder={field.placeholder}
                          value={formValues[field.id] ?? ""}
                          onChange={(event) =>
                            setFormValues((current) => ({ ...current, [field.id]: event.target.value }))
                          }
                        />
                      )}
                    </label>
                  );
                })}
                {isLive && (config.quickActions ?? []).length > 0 ? (
                  <div className="osb-topics">
                    <span className="osb-topics-label">Talk to a person about</span>
                    {(config.quickActions ?? []).map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="osb-topic"
                        disabled={starting || !ready}
                        onClick={() => void startConversation(action.id, "human")}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {formError || error ? <p className="osb-error">{formError || error}</p> : null}
                {aiOffered ? (
                  <div className="osb-topics">
                    <button type="button" className="osb-start" disabled={starting || !ready} onClick={() => void startConversation(undefined, "ai")}>
                      {starting ? "Starting…" : `Chat with ${config.ai?.agentName?.trim() || "AI assistant"}`}
                    </button>
                    {isLive && (config.quickActions ?? []).length === 0 ? (
                      <button type="button" className="osb-topic" disabled={starting || !ready} onClick={() => void startConversation(undefined, "human")}>
                        {starting ? "Starting…" : "Talk to a person"}
                      </button>
                    ) : isLive ? null : (
                      <p className="osb-hint">{config.officeHours?.closedMessage || "We are away right now. Leave your email and we will write back."}</p>
                    )}
                  </div>
                ) : (
                  <button type="submit" className="osb-start" disabled={starting || !ready}>
                    {starting ? "Starting…" : config.formSubmitLabel}
                  </button>
                )}
              </form>
            ) : null}
            {!started && !isLive && !aiOffered ? (
              <OfflineForm
                message={config.officeHours?.closedMessage || "We are away right now. Leave your email and we will write back."}
                email={offlineEmail}
                note={draft}
                sent={offlineSent}
                busy={starting}
                error={formError || error}
                onEmail={setOfflineEmail}
                onNote={setDraft}
                onSubmit={() => void startConversation()}
              />
            ) : null}
            {!started && (isLive || aiOffered) && !showForm && leaveMessage ? (
              <OfflineForm
                message={config.officeHours?.closedMessage || "We are away right now. Leave your email and we will write back."}
                email={offlineEmail}
                note={draft}
                sent={offlineSent}
                busy={starting}
                error={formError || error}
                onEmail={setOfflineEmail}
                onNote={setDraft}
                onBack={() => setLeaveMessage(false)}
                onSubmit={() => void startConversation()}
              />
            ) : null}
            {!started && (isLive || aiOffered) && !showForm && !leaveMessage ? (
              <div className="osb-welcome">
                {sessionLost ? <p className="osb-hint">This conversation is no longer available. You can start a new one.</p> : <p>{config.greeting}</p>}
                {config.responseTime?.label ? <p className="osb-response">{config.responseTime.label}</p> : null}
                {!isLive ? <HoursTable hours={config.officeHours} /> : null}
                <StartChoices
                  config={config}
                  starting={starting}
                  disabled={starting || !ready}
                  aiOffered={aiOffered}
                  peopleAway={!isLive}
                  awayMessage={config.officeHours?.closedMessage}
                  aiName={config.ai?.agentName}
                  onStart={(topicId, handler) => void startConversation(topicId, handler)}
                  onLeaveMessage={() => setLeaveMessage(true)}
                />
                {error ? <p className="osb-error">{error}</p> : null}
              </div>
            ) : null}
            {showTranscript && messages.length === 0 && !ready ? <p className="osb-hint">{config.greeting}</p> : null}
            {showTranscript
              ? messages.map((message, index) => (
                  <MessageView
                    key={message.id}
                    message={message}
                    previous={messages[index - 1]}
                    next={messages[index + 1]}
                    serverUrl={serverUrl}
                    assigneeName={assigneeName}
                    readAt={receiptFor(message, messages[index + 1], agentReadAt)}
                    actions={withAi && !closed && index === messages.length - 1 ? actionsForMessage(message, actions) : []}
                    actionBusy={actionBusy}
                    disabled={sending || closed}
                    onAction={(action) => void runAction(action)}
                  />
                ))
              : null}
            {waiting ? (
              <p className="osb-waiting" role="status">
                <span className="osb-waiting-dot" aria-hidden="true" />
                {config.waitingMessage}
                {config.responseTime?.label ? <span className="osb-response">{config.responseTime.label}</span> : null}
              </p>
            ) : null}
            {aiThinking ? <TypingIndicator name={aiLabel} /> : peerTyping ? <TypingIndicator name={assigneeName || agentName || "Support"} /> : null}
            {showTranscript && error ? <p className="osb-error">{error}</p> : null}
            {dragOver ? <p className="osb-drop">Drop to attach</p> : null}
            {closed ? (
              <div className="osb-welcome">
                <p className="osb-hint">This conversation has ended.</p>
                <RatingPrompt
                  rating={rating}
                  choice={ratingChoice}
                  note={ratingNote}
                  busy={ratingBusy}
                  onChoice={setRatingChoice}
                  onNote={setRatingNote}
                  onSubmit={(next) => void submitRating(next)}
                />
                {rating ? (
                  <StartChoices
                    config={config}
                    starting={starting}
                    disabled={starting}
                    aiOffered={aiOffered}
                    aiName={config.ai?.agentName}
                    onStart={(topicId, handler) => void startConversation(topicId, handler)}
                    fallback="Start a new conversation"
                  />
                ) : null}
                <button type="button" className="osb-archive" onClick={() => setShowArchive((value) => !value)} aria-expanded={showArchive}>
                  {showArchive ? "Hide archive" : "Archive"}
                </button>
                {showArchive ? (
                  <div className="osb-archive-list">
                    {messages.length === 0 ? <p className="osb-hint">Nothing was said.</p> : null}
                    {messages.map((message, index) => (
                      <MessageView
                        key={message.id}
                        message={message}
                        previous={messages[index - 1]}
                        next={messages[index + 1]}
                        serverUrl={serverUrl}
                        assigneeName={assigneeName}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {started && !closed ? (
          <form className="osb-composer" onSubmit={onSubmit}>
            {pendingFile || uploadProgress !== null ? (
              <div className="osb-upload">
                <span className="osb-upload-name">{pendingFile?.name ?? "Uploading"}</span>
                {uploadProgress !== null ? (
                  <span className="osb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadProgress * 100)}>
                    <span style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                  </span>
                ) : (
                  <button type="button" className="osb-upload-clear" onClick={() => setPendingFile(null)} aria-label="Remove file">
                    Remove
                  </button>
                )}
              </div>
            ) : null}
            <div className="osb-composer-row">
              <button
                type="button"
                className="osb-attach"
                aria-label="Screenshot this page"
                data-tip="Screenshot this page"
                disabled={sending || capturing}
                onClick={() => void takeScreenshot()}
              >
                {capturing ? <span className="osb-spinner osb-spinner-ink" /> : <Camera size={18} strokeWidth={1.75} />}
              </button>
              <label className="osb-attach" data-tip="Attach a file">
                <span className="osb-sr">Attach a file, up to 50 MB</span>
                <IconClip />
                <input
                  type="file"
                  disabled={sending}
                  aria-label="Attach a file"
                  onChange={(event) => {
                    chooseFile(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              <label className="osb-sr" htmlFor={`${titleId}-input`}>
                Message
              </label>
              <textarea
                ref={inputRef}
                id={`${titleId}-input`}
                value={draft}
                placeholder={closed ? "This conversation is closed" : config.placeholder}
                rows={1}
                disabled={closed || sending}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft(value);
                  if (!value.trim()) {
                    window.clearTimeout(typingStop.current);
                    sendTyping(socketRef.current, false);
                    return;
                  }
                  sendTyping(socketRef.current, true);
                  window.clearTimeout(typingStop.current);
                  typingStop.current = window.setTimeout(() => sendTyping(socketRef.current, false), 3000);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="submit"
                className={sending ? "osb-send is-sending" : "osb-send"}
                aria-label={sending ? "Sending message" : "Send message"}
                disabled={closed || sending || (draft.trim().length === 0 && !pendingFile)}
              >
                {sending ? <span className="osb-spinner" /> : <IconSend />}
              </button>
            </div>
          </form>
          ) : null}
          {!started || closed ? (
            <p className="osb-credit">
              <a href="https://opensupport.dev" target="_blank" rel="noreferrer">OpenSupport</a>
              <span>Created by CoatCheck Technology, Inc.</span>
            </p>
          ) : null}
          {confirmEnd ? (
            <div className="osb-confirm" role="dialog" aria-modal="true" aria-labelledby={`${titleId}-end`}>
              <div className="osb-confirm-card">
                <h3 id={`${titleId}-end`}>End this chat?</h3>
                <p>You will not be able to send more messages in this conversation.</p>
                <div className="osb-confirm-actions">
                  <button type="button" className="osb-topic" onClick={() => setConfirmEnd(false)} disabled={ending}>
                    Keep chatting
                  </button>
                  <button type="button" className="osb-start" onClick={() => void endConversation()} disabled={ending}>
                    {ending ? "Ending…" : "End chat"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      <button
        type="button"
        className="osb-launcher"
        aria-expanded={open}
        aria-label={open ? "Close support chat" : "Open support chat"}
        onClick={() => toggle(!open)}
      >
        {open ? <IconClose /> : logoUrl ? <img className="osb-launcher-logo" src={logoUrl} alt="" /> : <IconChat />}
        {unseen > 0 && !open ? <span className="osb-badge">{unseen > 9 ? "9+" : unseen}</span> : null}
      </button>
    </div>
  );
}

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
function bubbleColors(config: PublicConfig): NonNullable<PublicConfig["theme"]>["colors"] {
  const colors = { ...INK_COLORS, ...(config.theme?.colors ?? {}) };
  const accent = /^#[0-9a-fA-F]{6}$/.test(config.accentColor) ? config.accentColor : colors.accent;
  if (!config.theme) {
    colors.accent = accent;
    colors.header = accent;
  }
  return colors;
}

function mix(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A short two-note boop. One extra note marks a burst of replies. */
function playBoop(count: number): void {
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

function absoluteUrl(serverUrl: string, path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${serverUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function HoursTable({ hours }: { hours: PublicConfig["officeHours"] }) {
  const days = hours?.days ?? [];
  if (days.length !== 7) return null;
  const rows = groupHours(days);
  return (
    <div className="osb-hours">
      <span className="osb-topics-label">People are here</span>
      {rows.map((row) => (
        <div className="osb-hour" key={row.label}>
          <span>{row.label}</span>
          <span>{row.hours}</span>
        </div>
      ))}
    </div>
  );
}

function groupHours(days: Array<{ open: number | null; close: number | null }>): Array<{ label: string; hours: string }> {
  const rows: Array<{ label: string; hours: string }> = [];
  let index = 0;
  while (index < days.length) {
    const signature = hourSignature(days[index]!);
    let end = index;
    while (end + 1 < days.length && hourSignature(days[end + 1]!) === signature) end += 1;
    rows.push({
      label: index === end ? WEEKDAYS[index]! : `${WEEKDAYS[index]!.slice(0, 3)}–${WEEKDAYS[end]!.slice(0, 3)}`,
      hours: signature || "Closed",
    });
    index = end + 1;
  }
  return rows;
}

function hourSignature(day: { open: number | null; close: number | null }): string {
  if (day.open === null || day.close === null) return "";
  return `${clock(day.open)}–${clock(day.close)}`;
}

function clock(minutes: number): string {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function StartChoices({
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
  const topics = peopleAway ? [] : config.quickActions ?? [];
  const label = aiName?.trim() || "AI assistant";
  const busy = starting ? "Starting…" : null;
  if (!aiOffered) {
    return (
      <div className="osb-topics">
        {topics.map((action) => (
          <button key={action.id} type="button" className="osb-topic" onClick={() => onStart(action.id, "human")} disabled={disabled}>
            {action.label}
          </button>
        ))}
        <button type="button" className="osb-start" onClick={() => onStart(undefined, "human")} disabled={disabled}>
          {busy ?? fallback}
        </button>
      </div>
    );
  }
  return (
    <div className="osb-topics">
      <button type="button" className="osb-start" onClick={() => onStart(undefined, "ai")} disabled={disabled}>
        {busy ?? `Chat with ${label}`}
      </button>
      {topics.length > 0 ? <span className="osb-topics-label">Or talk to a person about</span> : null}
      {topics.map((action) => (
        <button key={action.id} type="button" className="osb-topic" onClick={() => onStart(action.id, "human")} disabled={disabled}>
          {action.label}
        </button>
      ))}
      {peopleAway ? (
        <button type="button" className="osb-archive" onClick={onLeaveMessage} disabled={disabled}>
          {awayMessage || "We are away. Leave a message for a person"}
        </button>
      ) : topics.length === 0 ? (
        <button type="button" className="osb-topic" onClick={() => onStart(undefined, "human")} disabled={disabled}>
          {busy ?? "Talk to a person"}
        </button>
      ) : null}
    </div>
  );
}

function OfflineForm({
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
  if (sent) return <div className="osb-welcome"><p>Thanks. We will reply by email.</p></div>;
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
        <span>Email<span className="osb-required"> *</span></span>
        <input id="osb-offline-email" type="email" required value={email} onChange={(event) => onEmail(event.target.value)} />
      </label>
      <label className="osb-field" htmlFor="osb-offline-note">
        <span>How can we help?</span>
        <textarea id="osb-offline-note" rows={4} required value={note} onChange={(event) => onNote(event.target.value)} />
      </label>
      {error ? <p className="osb-error">{error}</p> : null}
      <button type="submit" className="osb-start" disabled={busy}>{busy ? "Sending…" : "Leave a message"}</button>
    </form>
  );
}

function RatingPrompt({
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
  if (rating === "up" || rating === "down") return <p className="osb-hint">Thanks for the rating.</p>;
  if (rating === "skipped") return null;
  return (
    <div className="osb-rating">
      <p>How was this chat?</p>
      <div className="osb-votes">
        <button type="button" className={choice === "up" ? "is-selected" : ""} aria-pressed={choice === "up"} aria-label="Thumbs up" disabled={busy} onClick={() => onChoice("up")}>
          <ThumbsUp size={18} strokeWidth={1.75} />
        </button>
        <button type="button" className={choice === "down" ? "is-selected" : ""} aria-pressed={choice === "down"} aria-label="Thumbs down" disabled={busy} onClick={() => onChoice("down")}>
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
          <textarea value={note} maxLength={500} rows={2} placeholder="Add a comment (optional)" onChange={(event) => onNote(event.target.value)} />
          <button type="submit" className="osb-start" disabled={busy}>{busy ? "Sending…" : "Send rating"}</button>
        </form>
      ) : null}
      <button type="button" className="osb-archive" onClick={() => onSubmit("skipped")} disabled={busy}>Skip</button>
    </div>
  );
}

function TypingIndicator({ name }: { name: string }) {
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

/** The latest visitor message shows when an agent has read up to it. */
function receiptFor(message: SupportMessage, next: SupportMessage | undefined, agentReadAt: string | null): string | null {
  if (message.role !== "visitor" || !agentReadAt || message.createdAt > agentReadAt) return null;
  if (next?.role === "visitor" && next.createdAt <= agentReadAt) return null;
  return message.readAt && message.readAt > agentReadAt ? message.readAt : agentReadAt;
}

function actionsForMessage(message: SupportMessage, actions: AiActionHandler[]): AiActionHandler[] {
  const ids = message.actionIds ?? [];
  if (message.role !== "agent" || ids.length === 0) return [];
  const byId = new Map(actions.map((action) => [action.id, action]));
  const matched: AiActionHandler[] = [];
  for (const id of ids) {
    const action = byId.get(id);
    if (action && !matched.some((item) => item.id === action.id)) matched.push(action);
  }
  return matched;
}

function MessageView({
  message,
  previous,
  next,
  serverUrl,
  assigneeName,
  readAt = null,
  actions = [],
  actionBusy = null,
  disabled = false,
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
  onAction?: (action: AiActionHandler) => void;
}) {
  const time = formatMessageTime(message.createdAt);
  const files = message.attachments ?? [];
  const name = speakerName(message, assigneeName);
  const continues = sameGroup(previous, message, assigneeName);
  const opensNext = sameGroup(message, next, assigneeName);
  return (
    <article className={["osb-message", `osb-message-${message.role}`, continues ? "is-continued" : ""].filter(Boolean).join(" ")}>
      {name && !continues ? <span className="osb-agent">{name}</span> : null}
      {message.actionLabel ? (
        <div className="osb-provided">
          <span className="osb-provided-mark" aria-hidden="true" />
          <span>Provided {message.actionLabel}</span>
        </div>
      ) : message.body ? (
        <div className="osb-bubble">
          <p>{message.body}</p>
        </div>
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

/** Same speaker inside the same clock minute reads as one group. */
function sameGroup(previous: SupportMessage | undefined, message: SupportMessage | undefined, assigneeName?: string | null): boolean {
  if (!previous || !message || previous.role !== message.role || previous.role === "system") return false;
  if (speakerName(previous, assigneeName) !== speakerName(message, assigneeName)) return false;
  const before = new Date(previous.createdAt);
  const after = new Date(message.createdAt);
  if (Number.isNaN(before.getTime()) || Number.isNaN(after.getTime())) return false;
  return (
    before.getFullYear() === after.getFullYear() &&
    before.getMonth() === after.getMonth() &&
    before.getDate() === after.getDate() &&
    before.getHours() === after.getHours() &&
    before.getMinutes() === after.getMinutes()
  );
}

/** The desk stores its own replies as "You". Visitors should see the agent who joined. */
function speakerName(message: SupportMessage, assigneeName?: string | null): string | null {
  if (message.role !== "agent") return null;
  const stored = message.agentName?.trim();
  if (stored && stored.toLowerCase() !== "you") return stored;
  return assigneeName?.trim() || null;
}

function FileView({ file, serverUrl }: { file: Attachment; serverUrl: string }) {
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
  return <Icon className={`osb-file-icon osb-file-icon-${kind}`} size={18} strokeWidth={1.75} aria-hidden="true" />;
}
