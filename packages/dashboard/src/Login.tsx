import { useState, type FormEvent } from "react";
import { api } from "./api.js";
import { type ThemeController } from "./theme.js";
import { ThemeButton } from "./ThemeButton.js";
import type { Account, LoginMode } from "./types.js";

export function Login({
  mode,
  theme,
  onMode,
  onEnter,
}: {
  mode: LoginMode;
  theme: ThemeController;
  onMode: (mode: LoginMode) => void;
  onEnter: (account: Account | null, adminKey: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>, run: (data: FormData) => Promise<void>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await run(new FormData(event.currentTarget));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <ThemeButton theme={theme} />
      <div className="card">
        {mode === "setup" ? (
          <form
            onSubmit={(event) =>
              submit(event, async (data) => {
                const created = await api<{ account: Account }>("/api/dashboard/setup", {
                  method: "POST",
                  body: JSON.stringify({
                    name: String(data.get("name") ?? "").trim(),
                    email: String(data.get("email") ?? "").trim(),
                    password: String(data.get("password") ?? ""),
                  }),
                });
                onEnter(created.account, "");
              })
            }
          >
            <p className="kicker">First run</p>
            <h1>Create the admin</h1>
            <p className="muted">This server has no accounts yet. The first account is an admin and can add everyone else.</p>
            <label className="field-label" htmlFor="setup-name">Name</label>
            <input className="input" id="setup-name" name="name" type="text" autoComplete="name" required />
            <label className="field-label" htmlFor="setup-email">Email</label>
            <input className="input" id="setup-email" name="email" type="email" autoComplete="username" required />
            <label className="field-label" htmlFor="setup-password">Password</label>
            <input className="input" id="setup-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <p className="error">{error}</p>
            <button className="btn btn-primary" type="submit" disabled={busy}>Create account</button>
          </form>
        ) : null}

        {mode === "email" ? (
          <form
            onSubmit={(event) =>
              submit(event, async (data) => {
                const signedIn = await api<{ account: Account }>("/api/dashboard/session", {
                  method: "POST",
                  body: JSON.stringify({
                    email: String(data.get("email") ?? "").trim(),
                    password: String(data.get("password") ?? ""),
                  }),
                });
                sessionStorage.removeItem("osb_admin");
                onEnter(signedIn.account, "");
              })
            }
          >
            <p className="kicker">Open Support</p>
            <h1>Sign in.</h1>
            <p className="muted">Sign in with the email and password an admin gave you.</p>
            <label className="field-label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required />
            <label className="field-label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
            <p className="error">{error}</p>
            <button className="btn btn-primary" type="submit" disabled={busy}>Sign in</button>
            <button className="btn btn-link switcher" type="button" onClick={() => onMode("key")}>
              Use the admin key instead
            </button>
          </form>
        ) : null}

        {mode === "key" ? (
          <form
            onSubmit={(event) =>
              submit(event, async (data) => {
                const key = String(data.get("adminKey") ?? "").trim();
                await api("/api/dashboard/session", {
                  method: "POST",
                  body: JSON.stringify({ adminKey: key }),
                });
                sessionStorage.setItem("osb_admin", key);
                onEnter(null, key);
              })
            }
          >
            <p className="kicker">Recovery</p>
            <h1>Admin key</h1>
            <p className="muted">The key printed on first boot, or <code>ADMIN_KEY</code>. Use it to recover access, then create an account.</p>
            <label className="field-label" htmlFor="admin-key">Admin key</label>
            <input className="input" id="admin-key" name="adminKey" type="password" autoComplete="current-password" required />
            <p className="error">{error}</p>
            <button className="btn btn-primary" type="submit" disabled={busy}>Sign in</button>
            <button className="btn btn-link switcher" type="button" onClick={() => onMode("email")}>
              Use email instead
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
