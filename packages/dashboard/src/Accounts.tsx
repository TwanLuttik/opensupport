import { useEffect, useState, type FormEvent } from "react";
import { api, authHeaders } from "./api.js";
import { Status } from "./components.js";
import type { Account } from "./types.js";

export function Accounts({ adminKey, embedded = false }: { adminKey: string; embedded?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState({ text: "", ok: false });
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<Account | null>(null);
  const headers = authHeaders(adminKey);

  async function load() {
    const data = await api<{ accounts: Account[] }>("/api/dashboard/accounts", { headers });
    setAccounts(data.accounts);
  }

  useEffect(() => {
    load().catch((error) => setStatus({ text: error instanceof Error ? error.message : "Could not load accounts.", ok: false }));
    // Loaded once when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!creating && !passwordFor) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setCreating(false);
      setPasswordFor(null);
      setStatus({ text: "", ok: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, passwordFor]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus({ text: "", ok: false });
    try {
      await api("/api/dashboard/accounts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: String(data.get("name") ?? "").trim(),
          email: String(data.get("email") ?? "").trim(),
          password: String(data.get("password") ?? ""),
          role: String(data.get("role") ?? "agent"),
        }),
      });
      event.currentTarget.reset();
      setCreating(false);
      setStatus({ text: "Account created.", ok: true });
      await load();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not create the account.", ok: false });
    }
  }

  const panel = (
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>People</h2>
            <p className="muted">Admins can add accounts. Agents can use the inbox. Passwords are set here and are not shown again.</p>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => { setStatus({ text: "", ok: false }); setCreating(true); }}>
            New account
          </button>
        </div>
        <Status text={status.text} ok={status.ok} />
        <table className="people">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td className="muted">{account.email}</td>
                <td><span className="badge badge-outline">{account.role}</span></td>
                <td>{account.disabledAt ? <span className="badge badge-destructive">Disabled</span> : <span className="badge badge-outline">Active</span>}</td>
                <td>
                  <div className="row">
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => setPasswordFor(account)}>
                      Reset password
                    </button>
                    <button
                      className="btn btn-destructive btn-sm"
                      type="button"
                      onClick={async () => {
                        try {
                          await api(`/api/dashboard/accounts/${account.id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ disabled: !account.disabledAt }),
                          });
                          await load();
                        } catch (error) {
                          setStatus({ text: error instanceof Error ? error.message : "Could not update the account.", ok: false });
                        }
                      }}
                    >
                      {account.disabledAt ? "Enable" : "Disable"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {creating ? (
          <div className="confirm-dialog is-fixed" role="dialog" aria-modal="true" aria-labelledby="create-account-title">
            <form className="confirm-card" onSubmit={create}>
              <h2 id="create-account-title">New account</h2>
              <p className="muted">Passwords are set here and are not shown again.</p>
              <label className="field-label" htmlFor="account-name">Name</label>
              <input className="input" id="account-name" name="name" type="text" required autoFocus />
              <label className="field-label" htmlFor="account-email">Email</label>
              <input className="input" id="account-email" name="email" type="email" required />
              <label className="field-label" htmlFor="account-password">Password</label>
              <input className="input" id="account-password" name="password" type="password" minLength={8} required />
              <label className="field-label" htmlFor="account-role">Role</label>
              <select className="input" id="account-role" name="role" defaultValue="agent">
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
              <Status text={status.text} ok={status.ok} />
              <div className="row">
                <button className="btn btn-outline" type="button" onClick={() => { setCreating(false); setStatus({ text: "", ok: false }); }}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit">Create account</button>
              </div>
            </form>
          </div>
        ) : null}
        {passwordFor ? (
          <div className="confirm-dialog is-fixed" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
            <form
              className="confirm-card"
              onSubmit={async (event) => {
                event.preventDefault();
                const password = String(new FormData(event.currentTarget).get("password") ?? "");
                try {
                  await api(`/api/dashboard/accounts/${passwordFor.id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ password }),
                  });
                  setPasswordFor(null);
                  setStatus({ text: "Password updated.", ok: true });
                } catch (error) {
                  setStatus({ text: error instanceof Error ? error.message : "Could not update the password.", ok: false });
                }
              }}
            >
              <h2 id="reset-password-title">Reset password</h2>
              <p className="muted">New password for {passwordFor.email}. At least 8 characters.</p>
              <label className="field-label" htmlFor="reset-password">Password</label>
              <input className="input" id="reset-password" name="password" type="password" minLength={8} required autoFocus />
              <Status text={status.text} ok={status.ok} />
              <div className="row">
                <button className="btn btn-outline" type="button" onClick={() => { setPasswordFor(null); setStatus({ text: "", ok: false }); }}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit">Update password</button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
  );

  if (embedded) return panel;
  return (
    <div className="settings">
      <div className="page-intro">
        <p className="kicker">Access</p>
        <h1>People</h1>
        <p className="muted">Admins configure the desk. Agents work the queue.</p>
      </div>
      {panel}
    </div>
  );
}
