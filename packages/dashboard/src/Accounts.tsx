import { useEffect, useState, type FormEvent } from "react";
import { api, authHeaders } from "./api.js";
import { Status } from "./components.js";
import type { Account } from "./types.js";

export function Accounts({ adminKey, embedded = false }: { adminKey: string; embedded?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState({ text: "", ok: false });
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
      setStatus({ text: "Account created.", ok: true });
      await load();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not create the account.", ok: false });
    }
  }

  const panel = (
      <section className="panel">
        <h2>People</h2>
        <p className="muted">Admins can add accounts. Agents can use the inbox. Passwords are set here and are not shown again.</p>
        <form onSubmit={create}>
          <div className="split">
            <div>
              <label className="field-label" htmlFor="account-name">Name</label>
              <input className="input" id="account-name" name="name" type="text" required />
            </div>
            <div>
              <label className="field-label" htmlFor="account-email">Email</label>
              <input className="input" id="account-email" name="email" type="email" required />
            </div>
          </div>
          <div className="split">
            <div>
              <label className="field-label" htmlFor="account-password">Password</label>
              <input className="input" id="account-password" name="password" type="password" minLength={8} required />
            </div>
            <div>
              <label className="field-label" htmlFor="account-role">Role</label>
              <select className="input" id="account-role" name="role" defaultValue="agent">
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <Status text={status.text} ok={status.ok} />
          <button className="btn btn-primary" type="submit">Create account</button>
        </form>
        <div>
          {accounts.map((account) => (
            <div className="hook" key={account.id}>
              <div>
                <strong>{account.name}</strong> <span className="badge badge-outline">{account.role}</span>
                {account.disabledAt ? <span className="badge badge-destructive">disabled</span> : null}
                <br />
                <small className="muted">{account.email}</small>
              </div>
              <div className="row">
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={async () => {
                    const password = prompt(`New password for ${account.email} (at least 8 characters)`);
                    if (!password) return;
                    try {
                      await api(`/api/dashboard/accounts/${account.id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ password }),
                      });
                      setStatus({ text: "Password updated.", ok: true });
                    } catch (error) {
                      setStatus({ text: error instanceof Error ? error.message : "Could not update the password.", ok: false });
                    }
                  }}
                >
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
            </div>
          ))}
        </div>
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
