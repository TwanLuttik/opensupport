import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { api } from "./api.js";
import { AccountPage } from "./Account.js";
import { Docs } from "./Docs.js";
import { Hours } from "./Hours.js";
import { Inbox } from "./Inbox.js";
import { Messages, offlineAttention } from "./Messages.js";
import { connectDesk } from "./live.js";
import type { Conversation } from "./types.js";

function isOffline(conversation: Conversation): boolean {
  return conversation.metadata?.offline === "true";
}
import { Login } from "./Login.js";
import { Reviews } from "./Reviews.js";
import { Settings } from "./Settings.js";
import { Statistics } from "./Statistics.js";
import { useTheme } from "./theme.js";
import { ThemeButton } from "./ThemeButton.js";
import type { Account, LoginMode, SessionResponse } from "./types.js";

const PAGES = [
  { to: "/inbox", label: "Inbox", admin: false },
  { to: "/settings", label: "Settings", admin: false },
  { to: "/hours", label: "Hours", admin: false },
  { to: "/statistics", label: "Statistics", admin: false },
  { to: "/reviews", label: "Reviews", admin: true },
  { to: "/docs", label: "Docs", admin: false },
] as const;

function ProfileLink({ me }: { me: Account }) {
  return (
    <NavLink className="profile" to="/account" aria-label="Your account">
      <span className="who">{me.name}</span>
      {me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : <span className="profile-fallback" aria-hidden="true">{initials(me.name)}</span>}
    </NavLink>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function App() {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<LoginMode>("email");
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<Account | null>(null);
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem("osb_admin") || "");
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    api<SessionResponse>("/api/dashboard/session")
      .then((data) => {
        if (data.needsSetup) {
          setMode("setup");
          return;
        }
        if (!data.authenticated) return;
        setMe(data.account);
        setSignedIn(true);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let stopped = false;
    const known = new Map<string, Conversation>();
    const recount = () => {
      if (!stopped) setMessageCount(offlineAttention([...known.values()]));
    };
    api<{ conversations: Conversation[] }>("/api/conversations")
      .then((data) => {
        if (stopped) return;
        known.clear();
        for (const conversation of data.conversations) {
          if (isOffline(conversation)) known.set(conversation.id, conversation);
        }
        recount();
      })
      .catch(() => {});
    const stop = connectDesk((event) => {
      if (event.type !== "conversation" && event.type !== "message" && event.type !== "read") return;
      if (event.type === "read") {
        const current = known.get(event.conversationId);
        if (!current || event.role !== "agent") return;
        known.set(event.conversationId, { ...current, agentReadAt: event.readAt, unreadForAgent: 0 });
        recount();
        return;
      }
      if (!isOffline(event.conversation)) {
        if (known.delete(event.conversation.id)) recount();
        return;
      }
      const current = known.get(event.conversation.id);
      known.set(event.conversation.id, event.type === "message"
        ? { ...event.conversation, messages: current?.messages }
        : { ...current, ...event.conversation, messages: current?.messages });
      recount();
    });
    return () => {
      stopped = true;
      stop();
    };
  }, [signedIn, location.pathname]);

  useEffect(() => {
    if (!signedIn || !me) return;
    const accountId = me.id;
    let stopped = false;
    const beat = () => {
      api<{ account: Account | null }>("/api/dashboard/presence", { method: "POST", body: "{}" })
        .then((data) => {
          if (!stopped && data.account && data.account.id === accountId) setMe(data.account);
        })
        .catch(() => {});
    };
    const timer = window.setInterval(beat, 20000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [signedIn, me?.id]);

  async function setPresence(presence: "online" | "away") {
    if (!me || presenceBusy || me.presence === presence) return;
    setPresenceBusy(true);
    try {
      const data = await api<{ account: Account }>("/api/dashboard/presence", {
        method: "POST",
        body: JSON.stringify({ presence }),
      });
      setMe(data.account);
    } catch {
      /* The next heartbeat retries. */
    } finally {
      setPresenceBusy(false);
    }
  }

  const canManage = Boolean((me && me.role === "admin") || adminKey);

  async function signOut() {
    await api("/api/dashboard/session", { method: "DELETE" });
    sessionStorage.removeItem("osb_admin");
    setAdminKey("");
    setMe(null);
    setSignedIn(false);
    navigate("/inbox", { replace: true });
  }

  if (!ready) return null;
  if (!signedIn) {
    return (
      <Login
        mode={mode}
        theme={theme}
        onMode={setMode}
        onEnter={(account, key) => {
          setMe(account);
          setAdminKey(key);
          setSignedIn(true);
          if (window.location.pathname === "/") navigate("/inbox", { replace: true });
        }}
      />
    );
  }

  return (
    <div className="desk">
      <header className="app">
        <span className="mark" aria-hidden="true" />
        <span className="brand">
          <strong>Open Support</strong>
          <em>Desk</em>
        </span>
        <nav>
          {PAGES.filter((page) => !page.admin || canManage).map((page) => (
            <NavLink key={page.to} to={page.to}>
              {page.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <div className="header-tools">
          {me ? (
            <div className="presence" role="group" aria-label="Your status">
              <button
                type="button"
                className={me.presence === "online" ? "is-on" : ""}
                aria-pressed={me.presence === "online"}
                disabled={presenceBusy}
                onClick={() => void setPresence("online")}
              >
                <span className="presence-dot" aria-hidden="true" />
                Online
              </button>
              <button
                type="button"
                className={me.presence === "away" ? "is-on" : ""}
                aria-pressed={me.presence === "away"}
                disabled={presenceBusy}
                onClick={() => void setPresence("away")}
              >
                Away
              </button>
            </div>
          ) : null}
          <NavLink className="btn btn-outline btn-icon mail-link" to="/messages" aria-label={messageCount ? `Messages, ${messageCount} unresolved` : "Messages"}>
            <Mail size={16} strokeWidth={1.75} />
            {messageCount > 0 ? <span className="mail-badge">{messageCount > 9 ? "9+" : messageCount}</span> : null}
          </NavLink>
          {me ? <ProfileLink me={me} /> : <span className="who">Admin key</span>}
          <ThemeButton theme={theme} />
          <button className="btn btn-outline" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route path="/dashboard" element={<Navigate to="/inbox" replace />} />
          <Route path="/inbox/:conversationId?" element={<Inbox me={me} />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/settings/*" element={<Settings key={adminKey} adminKey={adminKey} canManage={canManage} />} />
          <Route path="/hours" element={<Hours />} />
          <Route path="/account" element={me ? <AccountPage me={me} onChange={setMe} /> : <Navigate to="/inbox" replace />} />
          <Route path="/accounts" element={<Navigate to="/settings/accounts" replace />} />
          <Route path="/statistics/*" element={<Statistics />} />
          <Route path="/ai" element={<Navigate to="/statistics/ai" replace />} />
          <Route path="/reviews" element={canManage ? <Reviews /> : <Navigate to="/inbox" replace />} />
          <Route path="/docs/*" element={<Docs />} />
          <Route path="*" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </main>
    </div>
  );
}
