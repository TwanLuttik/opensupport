"use client";

import type { CSSProperties, DragEvent, FormEvent, RefObject } from "react";
import { Camera } from "lucide-react";
import type { AiActionHandler, PublicConfig, SupportMessage } from "../types.js";
import { IconChat, IconClip, IconClose, IconSend } from "./icons.js";
import { HoursTable, OfflineForm, RatingPrompt, StartChoices, friendlyError } from "./parts.js";
import { MessageView, TypingIndicator, actionsForMessage, receiptFor } from "./messages.js";

export interface BubbleViewProps {
  rootRef: RefObject<HTMLDivElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  titleId: string;
  className?: string;
  rootStyle: CSSProperties;
  open: boolean;
  panelMounted: boolean;
  dragOver: boolean;
  config: PublicConfig;
  logoUrl: string;
  agentPhoto: string;
  ended: boolean;
  peopleHere: boolean;
  subtitle: string;
  started: boolean;
  closed: boolean;
  ending: boolean;
  showForm: boolean;
  isLive: boolean;
  formValues: Record<string, string>;
  setFormValues: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  formError: string | null;
  error: string | null;
  starting: boolean;
  ready: boolean;
  aiOffered: boolean;
  offlineEmail: string;
  setOfflineEmail: (value: string) => void;
  draft: string;
  setDraft: (value: string) => void;
  offlineSent: boolean;
  leaveMessage: boolean;
  setLeaveMessage: (value: boolean) => void;
  sessionLost: boolean;
  messages: SupportMessage[];
  assigneeName: string | null;
  agentName: string | null;
  agentReadAt: string | null;
  serverUrl: string;
  withAi: boolean;
  actions: AiActionHandler[];
  actionBusy: number | null;
  sending: boolean;
  showTranscript: boolean;
  waiting: boolean;
  aiThinking: boolean;
  aiLabel: string;
  peerTyping: boolean;
  rating: "up" | "down" | "skipped" | null;
  ratingChoice: "up" | "down" | null;
  ratingNote: string;
  ratingBusy: boolean;
  showArchive: boolean;
  setShowArchive: (value: boolean | ((current: boolean) => boolean)) => void;
  setRatingChoice: (value: "up" | "down" | null) => void;
  setRatingNote: (value: string) => void;
  pendingFile: File | null;
  uploadProgress: number | null;
  capturing: boolean;
  confirmEnd: boolean;
  setConfirmEnd: (value: boolean) => void;
  unseen: number;
  onToggle: (next: boolean) => void;
  onPanelHidden: (event: React.AnimationEvent<HTMLElement>) => void;
  onDragEnter: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent) => void;
  onStart: (topicId?: string, handler?: "human" | "ai") => void;
  onFormSubmit: (event: FormEvent) => void;
  onSubmit: (event: FormEvent) => void;
  onAction: (action: AiActionHandler) => void;
  onEnd: () => void;
  onRate: (next: "up" | "down" | "skipped") => void;
  onScreenshot: () => void;
  onChooseFile: (file: File | null) => void;
  onDraftChange: (value: string) => void;
  socketSend: (typing: boolean) => void;
}

export function BubbleView(props: BubbleViewProps) {
  const {
    rootRef, listRef, inputRef, titleId, className, rootStyle, open, panelMounted, dragOver,
    config, logoUrl, agentPhoto, ended, peopleHere, subtitle, started, closed, ending,
    showForm, isLive, formValues, setFormValues, formError, error, starting, ready, aiOffered,
    offlineEmail, setOfflineEmail, draft, setDraft, offlineSent, leaveMessage, setLeaveMessage,
    sessionLost, messages, assigneeName, agentName, agentReadAt, serverUrl, withAi, actions,
    actionBusy, sending, showTranscript, waiting, aiThinking, aiLabel, peerTyping, rating, ratingChoice, ratingNote,
    ratingBusy, showArchive, setShowArchive, setRatingChoice, setRatingNote, pendingFile,
    uploadProgress, capturing, confirmEnd, setConfirmEnd, unseen, onToggle,
    onPanelHidden, onDragEnter, onDragOver, onDragLeave, onDrop, onStart, onFormSubmit, onSubmit,
    onAction, onEnd, onRate, onScreenshot, onChooseFile, onDraftChange, socketSend,
  } = props;
  return (
    <div
      className={["osb-root", className].filter(Boolean).join(" ")}
      style={rootStyle}
      ref={rootRef}
    >
      {panelMounted ? (
        <section
          className={[
            "osb-panel",
            dragOver ? "is-drop" : "",
            open ? "" : "is-closing",
          ]
            .filter(Boolean)
            .join(" ")}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-hidden={open ? undefined : true}
          onAnimationEnd={onPanelHidden}
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
                  <span
                    className={
                      !ended && peopleHere
                        ? "osb-status-dot is-online"
                        : "osb-status-dot"
                    }
                    aria-hidden="true"
                  />
                  <span>{subtitle}</span>
                </p>
              </div>
            </div>
            <div className="osb-header-actions">
              {started && !closed ? (
                <button
                  type="button"
                  className="osb-end"
                  onClick={() => setConfirmEnd(true)}
                  disabled={ending}
                >
                  End chat
                </button>
              ) : null}
              <button
                type="button"
                className="osb-icon-button"
                onClick={() => onToggle(false)}
                aria-label="Close chat"
              >
                <IconClose />
              </button>
            </div>
          </header>
          <div className="osb-messages" ref={listRef}>
            {!started && showForm ? (
              <form className="osb-form" onSubmit={onFormSubmit}>
                {isLive ? (
                  <p className="osb-form-greeting">{config.greeting}</p>
                ) : null}
                {isLive && config.responseTime?.label ? (
                  <p className="osb-response">{config.responseTime.label}</p>
                ) : null}
                {!isLive ? <HoursTable hours={config.officeHours} /> : null}
                {isLive ? <h3>{config.formTitle}</h3> : null}
                {isLive
                  ? config.formFields.map((field) => {
                      const fieldId = `${titleId}-${field.id}`;
                      return (
                        <label
                          key={field.id}
                          className="osb-field"
                          htmlFor={fieldId}
                        >
                          <span>
                            {field.label}
                            {field.required ? (
                              <span className="osb-required"> *</span>
                            ) : null}
                          </span>
                          {field.type === "textarea" ? (
                            <textarea
                              id={fieldId}
                              rows={3}
                              required={field.required}
                              placeholder={field.placeholder}
                              value={formValues[field.id] ?? ""}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }))
                              }
                            />
                          ) : field.type === "select" ? (
                            <select
                              id={fieldId}
                              required={field.required}
                              value={formValues[field.id] ?? ""}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">
                                {field.placeholder || "Choose…"}
                              </option>
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
                                setFormValues((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }))
                              }
                            />
                          )}
                        </label>
                      );
                    })
                  : null}
                {isLive && (config.quickActions ?? []).length > 0 ? (
                  <div className="osb-topics">
                    <span className="osb-topics-label">
                      Talk to a person about
                    </span>
                    {(config.quickActions ?? []).map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="osb-topic"
                        disabled={starting || !ready}
                        onClick={() =>
                          onStart(action.id, "human")
                        }
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {formError || error ? (
                  <p className="osb-error">
                    {friendlyError(formError || error || "")}
                  </p>
                ) : null}
                {aiOffered ? (
                  <div className="osb-topics">
                    <button
                      type="button"
                      className="osb-start"
                      disabled={starting || !ready}
                      onClick={() => onStart(undefined, "ai")}
                    >
                      {starting
                        ? "Starting…"
                        : `Chat with ${config.ai?.agentName?.trim() || "AI assistant"}`}
                    </button>
                    {isLive && (config.quickActions ?? []).length === 0 ? (
                      <button
                        type="button"
                        className="osb-topic"
                        disabled={starting || !ready}
                        onClick={() =>
                          onStart(undefined, "human")
                        }
                      >
                        {starting ? "Starting…" : "Talk to a person"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="submit"
                    className="osb-start"
                    disabled={starting || !ready}
                  >
                    {starting ? "Starting…" : config.formSubmitLabel}
                  </button>
                )}
              </form>
            ) : null}
            {!started && !isLive && !aiOffered ? (
              <OfflineForm
                message={
                  config.officeHours?.closedMessage ||
                  "We are away right now. Leave your email and we will write back."
                }
                email={offlineEmail}
                note={draft}
                sent={offlineSent}
                busy={starting}
                error={formError || error}
                onEmail={setOfflineEmail}
                onNote={setDraft}
                onSubmit={() => onStart()}
              />
            ) : null}
            {!started && (isLive || aiOffered) && !showForm && leaveMessage ? (
              <OfflineForm
                message={
                  config.officeHours?.closedMessage ||
                  "We are away right now. Leave your email and we will write back."
                }
                email={offlineEmail}
                note={draft}
                sent={offlineSent}
                busy={starting}
                error={formError || error}
                onEmail={setOfflineEmail}
                onNote={setDraft}
                onBack={() => setLeaveMessage(false)}
                onSubmit={() => onStart()}
              />
            ) : null}
            {!started && (isLive || aiOffered) && !showForm && !leaveMessage ? (
              <div className="osb-welcome">
                {sessionLost ? (
                  <p className="osb-hint">
                    This conversation is no longer available. You can start a
                    new one.
                  </p>
                ) : isLive ? (
                  <p>{config.greeting}</p>
                ) : null}
                {isLive && config.responseTime?.label ? (
                  <p className="osb-response">{config.responseTime.label}</p>
                ) : null}
                {!isLive ? <HoursTable hours={config.officeHours} /> : null}
                <StartChoices
                  config={config}
                  starting={starting}
                  disabled={starting || !ready}
                  aiOffered={aiOffered}
                  peopleAway={!isLive}
                  awayMessage={config.officeHours?.closedMessage}
                  aiName={config.ai?.agentName}
                  onStart={onStart}
                  onLeaveMessage={!isLive ? () => setLeaveMessage(true) : undefined}
                />
                {error ? (
                  <p className="osb-error">{friendlyError(error)}</p>
                ) : null}
              </div>
            ) : null}
            {showTranscript && messages.length === 0 && !ready ? (
              <p className="osb-hint">{config.greeting}</p>
            ) : null}
            {showTranscript
              ? messages.map((message, index) => (
                  <MessageView
                    key={message.id}
                    message={message}
                    waitingMessage={config.waitingMessage}
                    previous={messages[index - 1]}
                    next={messages[index + 1]}
                    serverUrl={serverUrl}
                    assigneeName={assigneeName}
                    readAt={receiptFor(
                      message,
                      messages[index + 1],
                      agentReadAt,
                    )}
                    actions={
                      withAi && !closed && index === messages.length - 1
                        ? actionsForMessage(message, actions)
                        : []
                    }
                    actionBusy={actionBusy}
                    disabled={sending || closed}
                    onAction={onAction}
                  />
                ))
              : null}
            {waiting ? (
              <p className="osb-waiting" role="status">
                <span className="osb-waiting-dot" aria-hidden="true" />
                {config.waitingMessage}
                {config.responseTime?.label ? (
                  <span className="osb-response">
                    {config.responseTime.label}
                  </span>
                ) : null}
              </p>
            ) : null}
            {aiThinking ? (
              <TypingIndicator name={aiLabel} />
            ) : peerTyping ? (
              <TypingIndicator name={assigneeName || agentName || "Support"} />
            ) : null}
            {showTranscript && error ? (
              <p className="osb-error">{error}</p>
            ) : null}
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
                  onSubmit={onRate}
                />
                {rating ? (
                  <StartChoices
                    config={config}
                    starting={starting}
                    disabled={starting}
                    aiOffered={aiOffered}
                    aiName={config.ai?.agentName}
                    onStart={onStart}
                    fallback="Start a new conversation"
                  />
                ) : null}
                <button
                  type="button"
                  className="osb-archive"
                  onClick={() => setShowArchive((value) => !value)}
                  aria-expanded={showArchive}
                >
                  {showArchive ? "Hide archive" : "Archive"}
                </button>
                {showArchive ? (
                  <div className="osb-archive-list">
                    {messages.length === 0 ? (
                      <p className="osb-hint">Nothing was said.</p>
                    ) : null}
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
                  <span className="osb-upload-name">
                    {pendingFile?.name ?? "Uploading"}
                  </span>
                  {uploadProgress !== null ? (
                    <span
                      className="osb-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(uploadProgress * 100)}
                    >
                      <span
                        style={{
                          width: `${Math.round(uploadProgress * 100)}%`,
                        }}
                      />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="osb-upload-clear"
                      onClick={() => onChooseFile(null)}
                      aria-label="Remove file"
                    >
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
                  onClick={onScreenshot}
                >
                  {capturing ? (
                    <span className="osb-spinner osb-spinner-ink" />
                  ) : (
                    <Camera size={18} strokeWidth={1.75} />
                  )}
                </button>
                <label className="osb-attach" data-tip="Attach a file">
                  <span className="osb-sr">Attach a file, up to 50 MB</span>
                  <IconClip />
                  <input
                    type="file"
                    disabled={sending}
                    aria-label="Attach a file"
                    onChange={(event) => {
                      onChooseFile(event.target.files?.[0] ?? null);
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
                  placeholder={
                    closed ? "This conversation is closed" : config.placeholder
                  }
                  rows={1}
                  disabled={closed || sending}
                  onChange={(event) => {
                    const value = event.target.value;
                    onDraftChange(value);
                    if (!value.trim()) {
                      socketSend(false);
                      return;
                    }
                    socketSend(true);
                    window.setTimeout(() => socketSend(false), 3000);
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
                  disabled={
                    closed ||
                    sending ||
                    (draft.trim().length === 0 && !pendingFile)
                  }
                >
                  {sending ? <span className="osb-spinner" /> : <IconSend />}
                </button>
              </div>
            </form>
          ) : null}
          {!started || closed ? (
            <p className="osb-credit">
              <a
                href="https://opensupport.dev"
                target="_blank"
                rel="noreferrer"
              >
                OpenSupport
              </a>
              <span>Created by CoatCheck Technology, Inc.</span>
            </p>
          ) : null}
          {confirmEnd ? (
            <div
              className="osb-confirm"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${titleId}-end`}
            >
              <div className="osb-confirm-card">
                <h3 id={`${titleId}-end`}>End this chat?</h3>
                <p>
                  You will not be able to send more messages in this
                  conversation.
                </p>
                <div className="osb-confirm-actions">
                  <button
                    type="button"
                    className="osb-topic"
                    onClick={() => setConfirmEnd(false)}
                    disabled={ending}
                  >
                    Keep chatting
                  </button>
                  <button
                    type="button"
                    className="osb-start"
                    onClick={onEnd}
                    disabled={ending}
                  >
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
        onClick={() => onToggle(!open)}
      >
        {open ? (
          <IconClose />
        ) : logoUrl ? (
          <img className="osb-launcher-logo" src={logoUrl} alt="" />
        ) : (
          <IconChat />
        )}
        {unseen > 0 && !open ? (
          <span className="osb-badge">{unseen > 9 ? "9+" : unseen}</span>
        ) : null}
      </button>
    </div>
  );
}
