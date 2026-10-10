"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import { capturePage } from "./screenshot.js";
import { BubbleView } from "./bubble/view.js";
import { absoluteUrl, bubbleColors, currentLocation, mix, nextBasePath, playBoop } from "./bubble/parts.js";
import { mergeMessages } from "./bubble/messages.js";
import {
  clearStoredSession,
  createClient,
  isStaleSessionError,
  loadStoredSession,
  saveStoredSession,
} from "./client.js";
import {
  BUBBLE_RECONNECTS,
  connectLive,
  sendTyping,
  widgetSocketUrl,
} from "./live.js";
import { currentRoute, pageAllowed } from "./pages.js";
import type {
  AiActionHandler,
  PublicConfig,
  StoredSession,
  SupportBubbleProps,
  SupportConversation,
  SupportMessage,
} from "./types.js";
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

export function SupportBubble({
  serverUrl,
  identifier,
  visitor,
  actions = [],
  pollIntervalMs = 3000,
  onOpenChange,
  pages,
  hiddenPages,
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
  const [live, setLive] = useState<"connecting" | "open" | "polling">(
    "connecting",
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [agentReadAt, setAgentReadAt] = useState<string | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const basePath = nextBasePath();
  const [allowedHere, setAllowedHere] = useState(() =>
    pageAllowed(currentRoute(currentLocation(), basePath), pages, hiddenPages),
  );
  const typingStop = useRef(0);
  const pagesKey = `${pages?.join("\0") ?? ""}\n${hiddenPages?.join("\0") ?? ""}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () =>
      setAllowedHere(
        pageAllowed(
          currentRoute(window.location, nextBasePath()),
          pages,
          hiddenPages,
        ),
      );
    sync();
    const timer = window.setInterval(sync, 300);
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [hiddenPages, pages, pagesKey]);

  useEffect(() => {
    if (allowedHere || !open) return;
    setOpen(false);
    onOpenChange?.(false);
  }, [allowedHere, onOpenChange, open]);

  useEffect(() => {
    let cancelled = false;
    client
      .getConfig()
      .then((next) => {
        if (!cancelled) {
          setConfig({
            ...DEFAULT_CONFIG,
            ...next,
            quickActions: next.quickActions ?? [],
          });
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

  const noteAgents = useCallback(
    (incoming: SupportMessage[], notify: boolean) => {
      let fresh = 0;
      for (const message of incoming) {
        if (message.role !== "agent" || seenAgentIds.current.has(message.id))
          continue;
        seenAgentIds.current.add(message.id);
        if (notify && !openRef.current) fresh += 1;
      }
      if (fresh === 0) return;
      setUnseen((count) => count + fresh);
      playBoop(fresh);
    },
    [],
  );

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
      setError(
        err instanceof Error ? err.message : "Could not load the conversation.",
      );
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
    if (!hasSession || closed || !session || typeof window === "undefined")
      return;
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
    if (
      !hasSession ||
      !session ||
      closed ||
      typeof window === "undefined" ||
      typeof WebSocket === "undefined"
    ) {
      setLive("polling");
      return;
    }
    setLive("connecting");
    return connectLive({
      url: widgetSocketUrl(serverUrl, session),
      retries: BUBBLE_RECONNECTS,
      socketRef,
      onStatus: (status) => {
        setLive(
          status === "failed"
            ? "polling"
            : status === "open"
              ? "open"
              : "connecting",
        );
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
        if (
          data.conversation &&
          data.conversation.id === session.conversationId
        )
          applyConversation(data.conversation);
        if (
          data.type === "message" &&
          data.message &&
          data.message.conversationId === session.conversationId
        ) {
          noteAgents([data.message], true);
          setMessages((current) => mergeMessages(current, [data.message!]));
          setPeerTyping(false);
        }
        if (data.type === "read" && data.role === "agent" && data.readAt) {
          setAgentReadAt((current) =>
            current && current > data.readAt! ? current : data.readAt!,
          );
        }
        if (data.type === "typing" && data.role === "agent")
          setPeerTyping(Boolean(data.typing));
      },
    });
  }, [
    applyConversation,
    closed,
    conversationId,
    hasSession,
    noteAgents,
    serverUrl,
  ]);

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
  }, [
    applyConversation,
    client,
    closed,
    hasSession,
    live,
    messages,
    noteAgents,
    pollIntervalMs,
  ]);

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
    if (!session || !messages.some((message) => message.role === "agent"))
      return;
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
    if (
      event.target !== event.currentTarget ||
      event.animationName !== "osb-sink"
    )
      return;
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
        if (
          field.type === "email" &&
          value &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ) {
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
        ? Object.fromEntries(
            config.formFields.map((field) => [
              field.id,
              (formValues[field.id] ?? "").trim(),
            ]),
          )
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
        if (!draft.trim()) {
          setFormError("Tell us how we can help.");
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
      const session = {
        conversationId: started.conversation.id,
        visitorToken: started.visitorToken,
      };
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
      setError(
        err instanceof Error
          ? err.message
          : "Could not start the conversation.",
      );
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
      setError(
        err instanceof Error ? err.message : "Could not end the conversation.",
      );
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
      await client.rate(
        session,
        next,
        next === "skipped" ? undefined : ratingNote,
      );
      setRatingChoice(null);
      setRatingNote("");
      if (next === "skipped") {
        forgetConversation();
        return;
      }
      setRating(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your rating.",
      );
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
      setError(
        err instanceof Error ? err.message : "Could not take the screenshot.",
      );
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
    if (
      !event.dataTransfer.types.includes("Files") ||
      !started ||
      closed ||
      sending
    )
      return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragOver(event: DragEvent) {
    if (
      !event.dataTransfer.types.includes("Files") ||
      !started ||
      closed ||
      sending
    )
      return;
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

  async function postVisitorMessage(
    session: StoredSession,
    body: string,
    attachmentIds?: string[],
    actionLabel?: string,
  ) {
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
        const uploaded = await client.upload(
          session,
          { name: file.name, type: file.type, bytes: file },
          (loaded, total) => {
            setUploadProgress(total === 0 ? 0 : loaded / total);
          },
        );
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
  const ended = closed && !rating;
  const activeAgent = !ended && assigneeName ? assigneeName : null;
  const agentPhoto = activeAgent && assigneeAvatar ? absoluteUrl(serverUrl, assigneeAvatar) : "";
  const subtitle = ended
    ? "This conversation has ended"
    : activeAgent
      ? `${activeAgent} joined the conversation`
      : withAi && !closed
        ? `${aiLabel} is answering`
        : waiting
          ? config.waitingMessage
          : agentName && !closed
            ? `${agentName} is handling this`
            : peopleHere
              ? "We're online"
              : "We're away";
  const aiOffered = Boolean(config.ai?.enabled);
  const showForm = !started && isLive && config.formEnabled && config.formFields.length > 0;

  if (!allowedHere) return null;

  return (
    <BubbleView
      rootRef={rootRef}
      listRef={listRef}
      inputRef={inputRef}
      titleId={titleId}
      className={className}
      rootStyle={rootStyle}
      open={open}
      panelMounted={panelMounted}
      dragOver={dragOver}
      config={config}
      logoUrl={logoUrl}
      agentPhoto={agentPhoto}
      ended={ended}
      peopleHere={peopleHere}
      subtitle={subtitle}
      started={started}
      closed={closed}
      ending={ending}
      showForm={showForm}
      isLive={isLive}
      formValues={formValues}
      setFormValues={setFormValues}
      formError={formError}
      error={error}
      starting={starting}
      ready={ready}
      aiOffered={aiOffered}
      offlineEmail={offlineEmail}
      setOfflineEmail={setOfflineEmail}
      draft={draft}
      setDraft={setDraft}
      offlineSent={offlineSent}
      leaveMessage={leaveMessage}
      setLeaveMessage={setLeaveMessage}
      sessionLost={sessionLost}
      messages={messages}
      assigneeName={assigneeName}
      agentName={agentName}
      agentReadAt={agentReadAt}
      serverUrl={serverUrl}
      withAi={withAi}
      actions={actions}
      actionBusy={actionBusy}
      sending={sending}
      showTranscript={showTranscript}
      waiting={waiting}
      aiThinking={aiThinking}
      aiLabel={aiLabel}
      peerTyping={peerTyping}
      rating={rating}
      ratingChoice={ratingChoice}
      ratingNote={ratingNote}
      ratingBusy={ratingBusy}
      showArchive={showArchive}
      setShowArchive={setShowArchive}
      setRatingChoice={setRatingChoice}
      setRatingNote={setRatingNote}
      pendingFile={pendingFile}
      uploadProgress={uploadProgress}
      capturing={capturing}
      confirmEnd={confirmEnd}
      setConfirmEnd={setConfirmEnd}
      unseen={unseen}
      onToggle={toggle}
      onPanelHidden={panelHidden}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onStart={(topicId, handler) => void startConversation(topicId, handler)}
      onFormSubmit={onFormSubmit}
      onSubmit={(event) => void onSubmit(event)}
      onAction={(action) => void runAction(action)}
      onEnd={() => void endConversation()}
      onRate={(next) => void submitRating(next)}
      onScreenshot={() => void takeScreenshot()}
      onChooseFile={chooseFile}
      onDraftChange={setDraft}
      socketSend={(typing) => {
        if (!typing) window.clearTimeout(typingStop.current);
        sendTyping(socketRef.current, typing);
        if (typing) {
          window.clearTimeout(typingStop.current);
          typingStop.current = window.setTimeout(() => sendTyping(socketRef.current, false), 3000);
        }
      }}
    />
  );
}
