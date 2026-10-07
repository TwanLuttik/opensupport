import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ColorPicker } from "./ColorPicker.js";
import { Accounts } from "./Accounts.js";
import { api, authHeaders, uploadImage } from "./api.js";
import { Status } from "./components.js";
import { fieldId } from "./format.js";
import { COLOR_FIELDS, presetById, THEME_PRESETS, themeFromWidget } from "./themes.js";
import type { AiAction, AiSettingsView, ApiToken, BubbleThemeColors, BubbleThemeId, FormFieldDraft, NotifyEvent, QuickAction, SettingsView, Webhook, WidgetSettings } from "./types.js";

const EMPTY_STATUS = { text: "", ok: false };

const SECTIONS = [
  { to: "/settings/appearance", label: "Appearance", hint: "Theme, name, greeting", admin: false },
  { to: "/settings/start", label: "Start screen", hint: "Topics and the form", admin: false },
  { to: "/settings/ai", label: "AI models", hint: "OpenAI key and model", admin: false },
  { to: "/settings/agent", label: "AI agent", hint: "Knowledge and client actions", admin: false },
  { to: "/settings/access", label: "Access", hint: "Who can embed it", admin: false },
  { to: "/settings/notifications", label: "Notifications", hint: "Webhooks, Telegram, tokens", admin: false },
  { to: "/settings/accounts", label: "Accounts", hint: "People who can use the desk", admin: true },
] as const;

const OPENAI_MODELS = [
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "o4-mini", label: "o4-mini" },
] as const;

function blankField(count: number): FormFieldDraft {
  return { id: `field${count}`, label: "", type: "text", required: false, placeholder: "", options: [] };
}

export function Settings({ adminKey, canManage }: { adminKey: string; canManage: boolean }) {
  const [widget, setWidget] = useState<WidgetSettings | null>(null);
  const [fields, setFields] = useState<FormFieldDraft[]>([]);
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [actionStatus, setActionStatus] = useState(EMPTY_STATUS);
  const [cors, setCors] = useState("");
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [telegram, setTelegram] = useState<SettingsView["telegram"] | null>(null);
  const [ai, setAi] = useState<AiSettingsView | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [aiStatus, setAiStatus] = useState(EMPTY_STATUS);
  const [contextStatus, setContextStatus] = useState(EMPTY_STATUS);
  const [tgToken, setTgToken] = useState("");
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [tokenError, setTokenError] = useState("");
  const [secret, setSecret] = useState("");
  const [newToken, setNewToken] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [widgetStatus, setWidgetStatus] = useState(EMPTY_STATUS);
  const [formStatus, setFormStatus] = useState(EMPTY_STATUS);
  const [accessStatus, setAccessStatus] = useState(EMPTY_STATUS);
  const [tgStatus, setTgStatus] = useState(EMPTY_STATUS);

  async function load() {
    const { settings } = await api<{ settings: SettingsView }>("/api/dashboard/settings");
    setWidget({ ...settings.widget, theme: themeFromWidget(settings.widget.theme, settings.widget.accentColor) });
    setFields(settings.widget.formFields.map((field) => ({ ...field, options: field.options.slice() })));
    setActions((settings.widget.quickActions ?? []).map((action) => ({ ...action })));
    setCors(settings.corsOrigin);
    setHooks(settings.webhooks);
    setTelegram(settings.telegram);
    setAi(settings.ai ?? { enabled: false, model: "gpt-4o-mini", agentName: "AI assistant", context: "", actions: [], hasApiKey: false, rateLimitEnabled: false, rateLimit: 20 });
    loadTokens();
  }

  async function loadTokens() {
    try {
      const data = await api<{ tokens: ApiToken[] }>("/api/tokens", { headers: authHeaders(adminKey) });
      setTokens(data.tokens);
      setTokenError("");
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Could not load tokens.");
    }
  }

  useEffect(() => {
    load().catch((error) => setWidgetStatus({ text: error instanceof Error ? error.message : "Could not load settings.", ok: false }));
    // Loaded once when settings opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchWidget(patch: Partial<WidgetSettings>) {
    setWidget((current) => (current ? { ...current, ...patch } : current));
  }

  async function saveWidget(patch: Partial<WidgetSettings>, setStatus: (status: typeof EMPTY_STATUS) => void) {
    const { settings } = await api<{ settings: SettingsView }>("/api/dashboard/settings");
    await api("/api/dashboard/widget", {
      method: "PUT",
      body: JSON.stringify({ ...settings.widget, ...patch }),
    });
    setStatus({ text: "Saved.", ok: true });
  }

  function updateField(index: number, patch: Partial<FormFieldDraft>) {
    setFields((current) => current.map((field, item) => (item === index ? { ...field, ...patch } : field)));
  }

  if (!widget || !telegram || !ai) {
    return (
      <div className="settings">
        <Status text={widgetStatus.text || "Loading settings…"} ok={false} />
      </div>
    );
  }

  return (
    <div className="settings">
      <div className="page-intro">
        <p className="kicker">Configuration</p>
        <h1>Settings</h1>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.filter((section) => !section.admin).map((section) => (
            <NavLink key={section.to} to={section.to}>
              {section.label}
              <small>{section.hint}</small>
            </NavLink>
          ))}
          {canManage ? <p className="settings-group">Admin</p> : null}
          {SECTIONS.filter((section) => section.admin && canManage).map((section) => (
            <NavLink key={section.to} to={section.to}>
              {section.label}
              <small>{section.hint}</small>
            </NavLink>
          ))}
        </nav>
        <div className="settings-section">
          <Routes>
            <Route index element={<Navigate to="appearance" replace />} />
            <Route
              path="appearance"
              element={
                <Appearance
                  widget={widget}
                  status={widgetStatus}
                  onChange={patchWidget}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    try {
                      const theme = themeFromWidget(widget.theme, widget.accentColor);
                      await saveWidget(
                        {
                          title: widget.title,
                          subtitle: widget.subtitle,
                          accentColor: theme.colors.accent,
                          theme,
                          placeholder: widget.placeholder,
                          greeting: widget.greeting,
                          waitingMessage: widget.waitingMessage,
                          logoUrl: widget.logoUrl,
                          showResponseTime: widget.showResponseTime,
                        },
                        setWidgetStatus,
                      );
                    } catch (error) {
                      setWidgetStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
                    }
                  }}
                />
              }
            />
            <Route
              path="start"
              element={
                <StartScreen
                  widget={widget}
                  actions={actions}
                  fields={fields}
                  actionStatus={actionStatus}
                  formStatus={formStatus}
                  onWidget={patchWidget}
                  onActions={setActions}
                  onFields={setFields}
                  onField={updateField}
                  onSaveActions={async (event) => {
                    event.preventDefault();
                    const used = new Set<string>();
                    const next = actions
                      .map((action, index) => ({ id: fieldId(action.label, index, used), label: action.label.trim() }))
                      .filter((action) => action.label);
                    try {
                      await saveWidget({ quickActions: next }, setActionStatus);
                      setActions(next);
                    } catch (error) {
                      setActionStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
                    }
                  }}
                  onSaveForm={async (event) => {
                    event.preventDefault();
                    const used = new Set<string>();
                    const next = fields
                      .map((field, index) => ({
                        id: fieldId(field.label, index, used),
                        label: field.label.trim(),
                        type: field.type,
                        required: Boolean(field.required),
                        placeholder: field.placeholder.trim(),
                        options: field.type === "select" ? field.options : [],
                      }))
                      .filter((field) => field.label);
                    try {
                      await saveWidget(
                        {
                          formEnabled: widget.formEnabled,
                          formTitle: widget.formTitle.trim() || "Before we start",
                          formSubmitLabel: widget.formSubmitLabel.trim() || "Start conversation",
                          formFields: next,
                        },
                        setFormStatus,
                      );
                      setFields(next);
                    } catch (error) {
                      setFormStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
                    }
                  }}
                />
              }
            />
            <Route
              path="access"
              element={
                <Access
                  cors={cors}
                  status={accessStatus}
                  onChange={setCors}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    try {
                      await api("/api/dashboard/access", {
                        method: "PUT",
                        body: JSON.stringify({ corsOrigin: cors.trim() }),
                      });
                      setAccessStatus({ text: "Saved.", ok: true });
                    } catch (error) {
                      setAccessStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
                    }
                  }}
                />
              }
            />
            <Route
              path="notifications"
              element={
                <Notifications
                  hooks={hooks}
                  hookUrl={hookUrl}
                  secret={secret}
                  telegram={telegram}
                  tgToken={tgToken}
                  tgStatus={tgStatus}
                  tokens={tokens}
                  tokenError={tokenError}
                  newToken={newToken}
                  onHookUrl={setHookUrl}
                  onTelegram={setTelegram}
                  onToken={setTgToken}
                  onAddWebhook={async (event) => {
                    event.preventDefault();
                    const events = [...new FormData(event.currentTarget).getAll("event")] as NotifyEvent[];
                    const created = await api<{ secret: string }>("/api/dashboard/webhooks", {
                      method: "POST",
                      body: JSON.stringify({ url: hookUrl.trim(), events, enabled: true }),
                    });
                    setSecret(created.secret);
                    setHookUrl("");
                    await load();
                  }}
                  onTestWebhook={async (id) => {
                    const result = await api<{ result: { ok: boolean; error?: string } }>(`/api/dashboard/webhooks/${id}/test`, {
                      method: "POST",
                      body: "{}",
                    });
                    alert(result.result.ok ? "Delivered" : result.result.error || "Failed");
                  }}
                  onRemoveWebhook={async (id) => {
                    await api(`/api/dashboard/webhooks/${id}`, { method: "DELETE" });
                    await load();
                  }}
                  onSaveTelegram={async (event) => {
                    event.preventDefault();
                    const body: Record<string, unknown> = {
                      enabled: telegram.enabled,
                      chatId: telegram.chatId?.trim() || null,
                      notifyOn: telegram.notifyOn,
                    };
                    if (tgToken.trim()) body.botToken = tgToken.trim();
                    try {
                      await api("/api/dashboard/telegram", { method: "PUT", body: JSON.stringify(body) });
                      setTgToken("");
                      setTgStatus({ text: "Saved.", ok: true });
                      await load();
                    } catch (error) {
                      setTgStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
                    }
                  }}
                  onTestTelegram={async () => {
                    try {
                      await api("/api/dashboard/telegram/test", { method: "POST", body: "{}" });
                      setTgStatus({ text: "Test message sent.", ok: true });
                    } catch (error) {
                      setTgStatus({ text: error instanceof Error ? error.message : "Test failed.", ok: false });
                    }
                  }}
                  onCreateToken={async (event) => {
                    event.preventDefault();
                    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
                    const created = await api<{ token: string }>("/api/tokens", {
                      method: "POST",
                      headers: authHeaders(adminKey),
                      body: JSON.stringify({ name }),
                    });
                    setNewToken(created.token);
                    event.currentTarget.reset();
                    await loadTokens();
                  }}
                  onRevokeToken={async (id) => {
                    await api(`/api/tokens/${id}`, { method: "DELETE", headers: authHeaders(adminKey) });
                    await loadTokens();
                  }}
                />
              }
            />
            <Route
              path="ai"
              element={
                <AiModels
                  ai={ai}
                  apiKey={aiKey}
                  status={aiStatus}
                  onChange={setAi}
                  onKey={setAiKey}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const body: Record<string, unknown> = {
                      enabled: ai.enabled,
                      model: ai.model,
                      agentName: ai.agentName.trim() || "AI assistant",
                      rateLimitEnabled: ai.rateLimitEnabled,
                      rateLimit: Number(ai.rateLimit) || 20,
                    };
                    if (aiKey.trim()) body.apiKey = aiKey.trim();
                    try {
                      const saved = await api<{ ai: AiSettingsView }>("/api/dashboard/ai", {
                        method: "PUT",
                        body: JSON.stringify(body),
                      });
                      setAi(saved.ai);
                      setAiKey("");
                      setAiStatus({ text: "Saved.", ok: true });
                    } catch (error) {
                      setAiStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
                    }
                  }}
                  onClearKey={async () => {
                    try {
                      const saved = await api<{ ai: AiSettingsView }>("/api/dashboard/ai", {
                        method: "PUT",
                        body: JSON.stringify({
                          enabled: ai.enabled,
                          model: ai.model,
                          agentName: ai.agentName.trim() || "AI assistant",
                          rateLimitEnabled: ai.rateLimitEnabled,
                          rateLimit: Number(ai.rateLimit) || 20,
                          apiKey: "",
                        }),
                      });
                      setAi(saved.ai);
                      setAiKey("");
                      setAiStatus({ text: "API key removed.", ok: true });
                    } catch (error) {
                      setAiStatus({ text: error instanceof Error ? error.message : "Could not remove the key.", ok: false });
                    }
                  }}
                />
              }
            />
            <Route
              path="agent"
              element={
                <AiAgent
                  ai={ai}
                  status={contextStatus}
                  onChange={setAi}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const used = new Set<number>();
                    const actions = (ai.actions ?? [])
                      .map((action) => ({
                        id: action.id,
                        label: action.label.trim(),
                        description: action.description.trim(),
                      }))
                      .filter((action) => action.label && action.description && !used.has(action.id) && used.add(action.id));
                    try {
                      const saved = await api<{ ai: AiSettingsView }>("/api/dashboard/ai/context", {
                        method: "PUT",
                        body: JSON.stringify({ context: ai.context, actions }),
                      });
                      setAi(saved.ai);
                      setContextStatus({ text: "Saved.", ok: true });
                    } catch (error) {
                      setContextStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
                    }
                  }}
                />
              }
            />
            <Route path="accounts" element={canManage ? <Accounts adminKey={adminKey} embedded /> : <Navigate to="/settings/appearance" replace />} />
            <Route path="*" element={<Navigate to="/settings/appearance" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function Appearance({
  widget,
  status,
  onChange,
  onSubmit,
}: {
  widget: WidgetSettings;
  status: typeof EMPTY_STATUS;
  onChange: (patch: Partial<WidgetSettings>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const theme = themeFromWidget(widget.theme, widget.accentColor);

  function chooseTheme(id: BubbleThemeId) {
    if (id === "custom") {
      onChange({ theme: { id: "custom", colors: { ...theme.colors } }, accentColor: theme.colors.accent });
      return;
    }
    const preset = presetById(id);
    if (!preset) return;
    onChange({ theme: { id: preset.id, colors: { ...preset.colors } }, accentColor: preset.colors.accent });
  }

  function paint(key: keyof BubbleThemeColors, value: string) {
    const colors = { ...theme.colors, [key]: value };
    onChange({
      theme: { id: "custom", colors },
      accentColor: key === "accent" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : colors.accent,
    });
  }

  return (
    <Panel
      title="Appearance"
      summary="Pick a bubble theme, or customize the colors. Visitors see the change after you save."
      onSubmit={onSubmit}
      status={status}
      saveLabel="Save appearance"
    >
      <ThemePicker themeId={theme.id} colors={theme.colors} title={widget.title} onChoose={chooseTheme} onPaint={paint} />
      <Field label="Title" htmlFor="title">
        <input className="input" id="title" value={widget.title} required onChange={(event) => onChange({ title: event.target.value })} />
      </Field>
      <Field label="Subtitle" htmlFor="subtitle">
        <input className="input" id="subtitle" value={widget.subtitle} required onChange={(event) => onChange({ subtitle: event.target.value })} />
      </Field>
      <Field label="Greeting" htmlFor="greeting" hint="The first line on the start screen.">
        <textarea className="textarea" id="greeting" rows={3} required value={widget.greeting} onChange={(event) => onChange({ greeting: event.target.value })} />
      </Field>
      <Field label="Composer placeholder" htmlFor="placeholder">
        <input className="input" id="placeholder" value={widget.placeholder} required onChange={(event) => onChange({ placeholder: event.target.value })} />
      </Field>
      <Field label="Waiting message" htmlFor="waiting" hint="Shown until someone assigns the ticket.">
        <input className="input" id="waiting" value={widget.waitingMessage} required onChange={(event) => onChange({ waitingMessage: event.target.value })} />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={widget.showResponseTime}
          onChange={(event) => onChange({ showResponseTime: event.target.checked })}
        />
        Show the average time to accept a ticket in the bubble
      </label>
      <LogoField logoUrl={widget.logoUrl} onChange={(logoUrl) => onChange({ logoUrl })} />
    </Panel>
  );
}

function ThemePicker({
  themeId,
  colors,
  title,
  onChoose,
  onPaint,
}: {
  themeId: BubbleThemeId;
  colors: BubbleThemeColors;
  title: string;
  onChoose: (id: BubbleThemeId) => void;
  onPaint: (key: keyof BubbleThemeColors, value: string) => void;
}) {
  return (
    <div className="theme-block">
      <p className="field-label">Theme</p>
      <div className="theme-grid" role="radiogroup" aria-label="Bubble theme">
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={themeId === preset.id}
            className={themeId === preset.id ? "theme-card is-selected" : "theme-card"}
            onClick={() => onChoose(preset.id)}
          >
            <ThemeSwatch colors={preset.colors} title={preset.name} />
            <span>
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={themeId === "custom"}
          className={themeId === "custom" ? "theme-card is-selected" : "theme-card"}
          onClick={() => onChoose("custom")}
        >
          <ThemeSwatch colors={colors} title="Custom" />
          <span>
            <strong>Custom</strong>
            <small>Change any color below.</small>
          </span>
        </button>
      </div>
      <ThemePreview colors={colors} title={title || "Support"} />
      <div className="theme-colors">
        {COLOR_FIELDS.map((field) => (
          <ColorField
            key={field.key}
            label={field.label}
            value={colors[field.key]}
            onChange={(value) => onPaint(field.key, value)}
          />
        ))}
      </div>
      <p className="muted">Editing a color switches the theme to Custom. Pick a template again to restore its palette.</p>
    </div>
  );
}

function ThemeSwatch({ colors, title }: { colors: BubbleThemeColors; title: string }) {
  return (
    <span className="theme-swatch" style={{ background: colors.canvas }} aria-hidden="true">
      <span className="theme-swatch-bar" style={{ background: colors.header, color: colors.headerText }}>{title}</span>
      <span className="theme-swatch-row">
        <span style={{ background: colors.agentBubble, color: colors.ink }}>Hi</span>
        <span style={{ background: colors.accent, color: colors.accentText }}>Hello</span>
      </span>
    </span>
  );
}

function ThemePreview({ colors, title }: { colors: BubbleThemeColors; title: string }) {
  return (
    <div className="theme-preview" style={{ background: colors.panel, color: colors.ink, borderColor: colors.ink }} aria-hidden="true">
      <div className="theme-preview-head" style={{ background: colors.header, color: colors.headerText }}>
        <strong>{title}</strong>
        <span>We&apos;re online</span>
      </div>
      <div className="theme-preview-body" style={{ background: colors.canvas }}>
        <span className="theme-preview-agent" style={{ background: colors.agentBubble, color: colors.ink, borderColor: colors.muted }}>
          Hi! How can we help?
        </span>
        <span className="theme-preview-visitor" style={{ background: colors.accent, color: colors.accentText }}>
          The checkout button is broken
        </span>
      </div>
      <div className="theme-preview-compose" style={{ background: colors.composer, color: colors.muted, borderColor: colors.ink }}>
        <span>Write a message…</span>
        <span style={{ background: colors.accent, color: colors.accentText }}>Send</span>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <ColorPicker label={label} value={value} onChange={onChange} />;
}

function LogoField({ logoUrl, onChange }: { logoUrl: string | null; onChange: (logoUrl: string | null) => void }) {
  const [error, setError] = useState("");

  async function choose(file: File | null) {
    if (!file) return;
    setError("");
    try {
      const saved = await uploadImage<{ logoUrl: string | null }>("/api/dashboard/logo", file);
      onChange(saved.logoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the logo.");
    }
  }

  return (
    <div>
      <label className="field-label" htmlFor="logo">Business logo</label>
      <div className="row">
        {logoUrl ? <img className="logo-preview" src={logoUrl} alt="" /> : <span className="muted">The bubble uses a chat icon until you add one.</span>}
        <label className="btn btn-outline btn-sm">
          {logoUrl ? "Replace logo" : "Upload logo"}
          <input
            id="logo"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(event) => {
              void choose(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
        {logoUrl ? (
          <button
            className="btn btn-link"
            type="button"
            onClick={async () => {
              await api("/api/dashboard/logo", { method: "DELETE" });
              onChange(null);
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">Shown in the bubble until an agent with a profile picture joins. PNG, JPEG, GIF, or WebP, up to 2 MB.</p>
    </div>
  );
}

function StartScreen({
  widget,
  actions,
  fields,
  actionStatus,
  formStatus,
  onWidget,
  onActions,
  onFields,
  onField,
  onSaveActions,
  onSaveForm,
}: {
  widget: WidgetSettings;
  actions: QuickAction[];
  fields: FormFieldDraft[];
  actionStatus: typeof EMPTY_STATUS;
  formStatus: typeof EMPTY_STATUS;
  onWidget: (patch: Partial<WidgetSettings>) => void;
  onActions: (actions: QuickAction[]) => void;
  onFields: (fields: FormFieldDraft[]) => void;
  onField: (index: number, patch: Partial<FormFieldDraft>) => void;
  onSaveActions: (event: FormEvent) => void;
  onSaveForm: (event: FormEvent) => void;
}) {
  return (
    <>
      <Panel title="Quick actions" summary="Each button starts a chat about that topic. Leave this empty for one start button." onSubmit={onSaveActions} status={actionStatus} saveLabel="Save topics">
        {actions.length === 0 ? <p className="muted">No topics yet.</p> : null}
        {actions.map((action, index) => (
          <div className="row" key={`${action.id}-${index}`} style={{ marginTop: 8 }}>
            <input
              className="input grow"
              type="text"
              maxLength={40}
              value={action.label}
              placeholder="Billing question"
              aria-label={`Topic ${index + 1}`}
              onChange={(event) => onActions(actions.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))}
            />
            <button className="btn btn-destructive btn-sm" type="button" onClick={() => onActions(actions.filter((_, item) => item !== index))}>
              Remove
            </button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-outline btn-sm" type="button" disabled={actions.length >= 8} onClick={() => onActions([...actions, { id: `topic${actions.length + 1}`, label: "" }])}>
            Add topic
          </button>
        </div>
      </Panel>
      <Panel title="Pre-chat form" summary="Ask for details before the conversation starts. A field named name or email fills the visitor card." onSubmit={onSaveForm} status={formStatus} saveLabel="Save form">
        <label className="switch">
          <span>
            <strong>Ask before starting</strong>
            <span className="muted">Visitors fill this in, then the chat opens.</span>
          </span>
          <input type="checkbox" checked={widget.formEnabled} onChange={(event) => onWidget({ formEnabled: event.target.checked })} />
        </label>
        {widget.formEnabled ? (
          <>
            <div className="split">
              <Field label="Form title" htmlFor="form-title">
                <input className="input" id="form-title" value={widget.formTitle} required onChange={(event) => onWidget({ formTitle: event.target.value })} />
              </Field>
              <Field label="Button label" htmlFor="form-submit">
                <input className="input" id="form-submit" value={widget.formSubmitLabel} required onChange={(event) => onWidget({ formSubmitLabel: event.target.value })} />
              </Field>
            </div>
            {fields.length === 0 ? <p className="muted">No fields yet.</p> : null}
            {fields.map((field, index) => (
              <div className="field-row" key={`${field.id}-${index}`}>
                <input className="input" type="text" value={field.label} placeholder="Label" aria-label="Field label" onChange={(event) => onField(index, { label: event.target.value })} />
                <select className="input" value={field.type} aria-label="Field type" onChange={(event) => onField(index, { type: event.target.value as FormFieldDraft["type"] })}>
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Select</option>
                </select>
                <input className="input" type="text" value={field.placeholder} placeholder="Placeholder" aria-label="Placeholder" onChange={(event) => onField(index, { placeholder: event.target.value })} />
                <label className="check">
                  <input type="checkbox" checked={field.required} onChange={(event) => onField(index, { required: event.target.checked })} />
                  Required
                </label>
                <button className="btn btn-destructive btn-sm" type="button" onClick={() => onFields(fields.filter((_, item) => item !== index))}>
                  Remove
                </button>
                {field.type === "select" ? (
                  <input
                    className="input field-options"
                    type="text"
                    value={field.options.join(", ")}
                    placeholder="Choices, separated by commas"
                    onChange={(event) => onField(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
                  />
                ) : null}
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => onFields([...fields, blankField(fields.length + 1)])}>
                Add field
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Turn this on when you want a name, email, or a question before the first message.</p>
        )}
      </Panel>
    </>
  );
}

function AiModels({
  ai,
  apiKey,
  status,
  onChange,
  onKey,
  onSubmit,
  onClearKey,
}: {
  ai: AiSettingsView;
  apiKey: string;
  status: typeof EMPTY_STATUS;
  onChange: (ai: AiSettingsView) => void;
  onKey: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClearKey: () => void;
}) {
  return (
    <Panel
      title="AI models"
      summary="Connect an OpenAI key and pick the model visitors can talk to. The key stays on this server."
      onSubmit={onSubmit}
      status={status}
      saveLabel="Save model"
    >
      <label className="switch">
        <span>
          <strong>Let visitors talk to the AI</strong>
          <span className="muted">The bubble offers the AI when this is on and a key is saved.</span>
        </span>
        <input type="checkbox" checked={ai.enabled} onChange={(event) => onChange({ ...ai, enabled: event.target.checked })} />
      </label>
      <Field label="Model" htmlFor="ai-model" hint="OpenAI chat models. Smaller models answer faster and cost less.">
        <select id="ai-model" value={ai.model} onChange={(event) => onChange({ ...ai, model: event.target.value })}>
          {OPENAI_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
          {OPENAI_MODELS.some((model) => model.id === ai.model) ? null : <option value={ai.model}>{ai.model}</option>}
        </select>
      </Field>
      <Field label="Agent name" htmlFor="ai-name" hint="Shown on replies in the bubble.">
        <input
          className="input"
          id="ai-name"
          value={ai.agentName}
          required
          maxLength={80}
          onChange={(event) => onChange({ ...ai, agentName: event.target.value })}
        />
      </Field>
      <Field
        label="OpenAI API key"
        htmlFor="ai-key"
        hint={ai.hasApiKey ? "A key is already saved. Leave this blank to keep it." : "Starts with sk-. It is never shown again."}
      >
        <input
          className="input"
          id="ai-key"
          type="password"
          autoComplete="off"
          placeholder={ai.hasApiKey ? "Key saved" : "sk-..."}
          value={apiKey}
          onChange={(event) => onKey(event.target.value)}
        />
      </Field>
      <label className="switch">
        <span>
          <strong>Limit questions per visitor</strong>
          <span className="muted">Each internet address can only ask the AI this many times in 10 minutes.</span>
        </span>
        <input type="checkbox" checked={ai.rateLimitEnabled} onChange={(event) => onChange({ ...ai, rateLimitEnabled: event.target.checked })} />
      </label>
      {ai.rateLimitEnabled ? (
        <Field label="Questions per 10 minutes" htmlFor="ai-limit" hint="A visitor who goes over this sees a short wait instead of another answer.">
          <input
            className="input"
            id="ai-limit"
            type="number"
            min={1}
            max={1000}
            required
            value={ai.rateLimit}
            onChange={(event) => onChange({ ...ai, rateLimit: Number(event.target.value) })}
          />
        </Field>
      ) : null}
      {ai.hasApiKey ? (
        <div className="row">
          <button className="btn btn-destructive btn-sm" type="button" onClick={onClearKey}>
            Remove saved key
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

function nextActionId(actions: AiAction[]): number {
  const used = new Set(actions.map((action) => action.id));
  for (let id = 1; id <= 99; id += 1) {
    if (!used.has(id)) return id;
  }
  return 99;
}

function AiAgent({
  ai,
  status,
  onChange,
  onSubmit,
}: {
  ai: AiSettingsView;
  status: typeof EMPTY_STATUS;
  onChange: (ai: AiSettingsView) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const actions = ai.actions ?? [];
  function setActions(next: AiAction[]) {
    onChange({ ...ai, actions: next });
  }
  return (
    <>
      <Panel
        title="AI agent"
        summary="Write the facts the agent should use. It answers from this text and the conversation, and says so when it does not know."
        onSubmit={onSubmit}
        status={status}
        saveLabel="Save knowledge"
      >
        <Field
          label="Knowledge"
          htmlFor="ai-context"
          hint="Product facts, policies, and how you want replies to sound. Up to 50,000 characters. Visitors never see this page."
        >
          <textarea
            className="textarea"
            id="ai-context"
            rows={14}
            maxLength={50000}
            placeholder={"We ship in the EU within 3 business days.\nRefunds are available for 30 days.\nThe Pro plan includes priority support."}
            value={ai.context}
            onChange={(event) => onChange({ ...ai, context: event.target.value })}
          />
        </Field>
        <p className="muted">{ai.context.length.toLocaleString()} / 50,000</p>
        {!ai.enabled || !ai.hasApiKey ? (
          <p className="muted">Turn the agent on and save an OpenAI key under AI models before visitors can use this.</p>
        ) : null}
      </Panel>
      <Panel
        title="Client actions"
        summary="Each action tells the agent it can ask the visitor's page for something. The description is added to the agent's knowledge. The page supplies the button and the text it sends."
        onSubmit={onSubmit}
        status={status}
        saveLabel="Save actions"
      >
        {actions.length === 0 ? <p className="muted">No actions yet. The agent will only answer from the knowledge above.</p> : null}
        {actions.map((action, index) => (
          <div className="action-draft" key={`${action.id}-${index}`}>
            <div className="row">
              <label className="action-id" htmlFor={`ai-action-id-${index}`}>
                Id
                <input
                  className="input"
                  id={`ai-action-id-${index}`}
                  type="number"
                  min={1}
                  max={99}
                  required
                  value={action.id}
                  onChange={(event) =>
                    setActions(actions.map((item, itemIndex) => (itemIndex === index ? { ...item, id: Number(event.target.value) } : item)))
                  }
                />
              </label>
              <label className="grow" htmlFor={`ai-action-label-${index}`}>
                Name
                <input
                  className="input"
                  id={`ai-action-label-${index}`}
                  maxLength={80}
                  required
                  value={action.label}
                  placeholder="Current plan"
                  onChange={(event) =>
                    setActions(actions.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))
                  }
                />
              </label>
              <button className="btn btn-destructive btn-sm" type="button" onClick={() => setActions(actions.filter((_, item) => item !== index))}>
                Remove
              </button>
            </div>
            <label htmlFor={`ai-action-description-${index}`}>
              What it does
              <textarea
                className="textarea"
                id={`ai-action-description-${index}`}
                rows={3}
                maxLength={500}
                required
                placeholder="Looks up the signed-in visitor's plan and renewal date. Ask for it when the question depends on their subscription."
                value={action.description}
                onChange={(event) =>
                  setActions(actions.map((item, itemIndex) => (itemIndex === index ? { ...item, description: event.target.value } : item)))
                }
              />
            </label>
            <p className="muted">The agent reads this and can ask the page with %%[{Number.isInteger(action.id) ? action.id : "?"}].</p>
          </div>
        ))}
        <div className="row">
          <button
            className="btn btn-outline btn-sm"
            type="button"
            disabled={actions.length >= 20}
            onClick={() => setActions([...actions, { id: nextActionId(actions), label: "", description: "" }])}
          >
            Add action
          </button>
        </div>
      </Panel>
    </>
  );
}

function Access({
  cors,
  status,
  onChange,
  onSubmit,
}: {
  cors: string;
  status: typeof EMPTY_STATUS;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Panel title="Who can embed the bubble" summary="Use * for any site, or list origins separated by commas." onSubmit={onSubmit} status={status} saveLabel="Save access">
      <Field label="Allowed origins" htmlFor="cors" hint="Example: https://app.example.com, http://localhost:3000">
        <input className="input" id="cors" value={cors} required onChange={(event) => onChange(event.target.value)} />
      </Field>
    </Panel>
  );
}

function Notifications(props: {
  hooks: Webhook[];
  hookUrl: string;
  secret: string;
  telegram: SettingsView["telegram"];
  tgToken: string;
  tgStatus: typeof EMPTY_STATUS;
  tokens: ApiToken[];
  tokenError: string;
  newToken: string;
  onHookUrl: (value: string) => void;
  onTelegram: (telegram: SettingsView["telegram"]) => void;
  onToken: (value: string) => void;
  onAddWebhook: (event: FormEvent<HTMLFormElement>) => void;
  onTestWebhook: (id: string) => void;
  onRemoveWebhook: (id: string) => void;
  onSaveTelegram: (event: FormEvent) => void;
  onTestTelegram: () => void;
  onCreateToken: (event: FormEvent<HTMLFormElement>) => void;
  onRevokeToken: (id: string) => void;
}) {
  const { telegram } = props;
  return (
    <>
      <Panel title="Webhooks" summary="We POST JSON when a conversation starts or a visitor writes. The signing secret is shown once." onSubmit={props.onAddWebhook} status={EMPTY_STATUS} saveLabel="Add webhook">
        <Field label="URL" htmlFor="hook-url">
          <input className="input" id="hook-url" type="url" required placeholder="https://example.com/hooks/support" value={props.hookUrl} onChange={(event) => props.onHookUrl(event.target.value)} />
        </Field>
        <div className="checks">
          <label className="check"><input type="checkbox" name="event" value="conversation.created" defaultChecked /> New conversation</label>
          <label className="check"><input type="checkbox" name="event" value="message.created" defaultChecked /> New message</label>
        </div>
        {props.secret ? <p className="secret">Signing secret, shown once: {props.secret}</p> : null}
        <div>
          {props.hooks.length === 0 ? <p className="muted">No webhooks yet.</p> : null}
          {props.hooks.map((hook) => (
            <div className="hook" key={hook.id}>
              <div>
                <code>{hook.url}</code>
                <br />
                <small className="muted">{(hook.events.length ? hook.events : ["all events"]).join(", ")}{hook.enabled ? "" : " · disabled"}</small>
              </div>
              <div className="row">
                <button className="btn btn-outline btn-sm" type="button" onClick={() => props.onTestWebhook(hook.id)}>Test</button>
                <button className="btn btn-destructive btn-sm" type="button" onClick={() => props.onRemoveWebhook(hook.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Telegram" summary="Replies in the bot chat are posted back to the visitor." onSubmit={props.onSaveTelegram} status={props.tgStatus} saveLabel="Save Telegram" extra={<button className="btn btn-outline btn-sm" type="button" onClick={props.onTestTelegram}>Send test</button>}>
        <label className="switch">
          <span>
            <strong>Send events to Telegram</strong>
            <span className="muted">Needs a bot token from @BotFather and a chat id.</span>
          </span>
          <input type="checkbox" checked={telegram.enabled} onChange={(event) => props.onTelegram({ ...telegram, enabled: event.target.checked })} />
        </label>
        {telegram.enabled ? (
          <>
            <Field label="Bot token" htmlFor="tg-token" hint={telegram.hasBotToken ? "A token is already saved. Leave this blank to keep it." : "Paste the token from BotFather."}>
              <input className="input" id="tg-token" type="password" autoComplete="off" placeholder={telegram.hasBotToken ? "Token saved" : "123456:ABC..."} value={props.tgToken} onChange={(event) => props.onToken(event.target.value)} />
            </Field>
            <Field label="Chat id" htmlFor="tg-chat">
              <input className="input" id="tg-chat" type="text" placeholder="-1001234567890" value={telegram.chatId ?? ""} onChange={(event) => props.onTelegram({ ...telegram, chatId: event.target.value })} />
            </Field>
            <div className="checks">
              <label className="check">
                <input type="checkbox" checked={telegram.notifyOn.includes("conversation.created")} onChange={(event) => props.onTelegram({ ...telegram, notifyOn: toggle(telegram.notifyOn, "conversation.created", event.target.checked) })} />
                New conversation
              </label>
              <label className="check">
                <input type="checkbox" checked={telegram.notifyOn.includes("message.created")} onChange={(event) => props.onTelegram({ ...telegram, notifyOn: toggle(telegram.notifyOn, "message.created", event.target.checked) })} />
                New message
              </label>
            </div>
          </>
        ) : null}
      </Panel>
      <Panel title="API tokens" summary="For your own tools. The full token is shown once." onSubmit={props.onCreateToken} status={EMPTY_STATUS} saveLabel="Create token">
        <Field label="Name" htmlFor="token-name" hint="Something you will recognize, like Helpdesk.">
          <input className="input" id="token-name" name="name" type="text" required placeholder="Helpdesk" />
        </Field>
        {props.newToken ? <p className="secret">Copy this token now. It will not be shown again. {props.newToken}</p> : null}
        {props.tokenError ? <p className="error">{props.tokenError}</p> : null}
        <div>
          {props.tokens.length === 0 ? <p className="muted">No tokens yet.</p> : null}
          {props.tokens.map((token) => (
            <div className="hook" key={token.id}>
              <div>
                <strong>{token.name}</strong>
                <br />
                <code>{token.tokenPrefix}…</code>
                {token.revokedAt ? <small className="muted"> revoked</small> : null}
              </div>
              {!token.revokedAt ? (
                <button className="btn btn-destructive btn-sm" type="button" onClick={() => props.onRevokeToken(token.id)}>Revoke</button>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function toggle(current: NotifyEvent[], eventName: NotifyEvent, checked: boolean): NotifyEvent[] {
  return checked ? [...current, eventName] : current.filter((item) => item !== eventName);
}

function Panel({
  title,
  summary,
  onSubmit,
  status,
  saveLabel,
  extra,
  children,
}: {
  title: string;
  summary: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  status: typeof EMPTY_STATUS;
  saveLabel: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <form onSubmit={onSubmit}>
        <h2>{title}</h2>
        <p className="muted">{summary}</p>
        {children}
        <Status text={status.text} ok={status.ok} />
        <div className="row">
          <button className="btn btn-primary" type="submit">{saveLabel}</button>
          {extra}
        </div>
      </form>
    </section>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  );
}
