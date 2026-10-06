import { useState, type FormEvent } from "react";
import { api, uploadImage } from "./api.js";
import { Status } from "./components.js";
import type { Account } from "./types.js";

export function AccountPage({ me, onChange }: { me: Account; onChange: (account: Account) => void }) {
  const [name, setName] = useState(me.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState({ text: "", ok: false });
  const [photoStatus, setPhotoStatus] = useState({ text: "", ok: false });
  const [saving, setSaving] = useState(false);

  async function choose(file: File | null) {
    if (!file) return;
    setPhotoStatus({ text: "", ok: false });
    try {
      const data = await uploadImage<{ account: Account }>("/api/dashboard/avatar", file);
      if (data.account) {
        onChange(data.account);
        setPhotoStatus({ text: "Picture updated.", ok: true });
      }
    } catch (error) {
      setPhotoStatus({ text: error instanceof Error ? error.message : "Could not upload the picture.", ok: false });
    }
  }

  async function removePhoto() {
    setPhotoStatus({ text: "", ok: false });
    try {
      const data = await api<{ account: Account }>("/api/dashboard/avatar", { method: "DELETE" });
      if (data.account) {
        onChange(data.account);
        setPhotoStatus({ text: "Picture removed.", ok: true });
      }
    } catch (error) {
      setPhotoStatus({ text: error instanceof Error ? error.message : "Could not remove the picture.", ok: false });
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus({ text: "", ok: false });
    try {
      const data = await api<{ account: Account }>("/api/dashboard/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      if (data.account) {
        onChange(data.account);
        setName(data.account.name);
      }
      setCurrentPassword("");
      setNewPassword("");
      setStatus({ text: "Saved.", ok: true });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings">
      <div className="page-intro">
        <p className="kicker">You</p>
        <h1>Account</h1>
        <p className="muted">Customers see this name and picture when you take a ticket.</p>
      </div>
      <section className="panel">
        <h2>Profile picture</h2>
        <p className="muted">PNG, JPEG, GIF, or WebP, up to 2 MB.</p>
        <div className="account-photo">
          {me.avatarUrl ? (
            <img src={me.avatarUrl} alt="" />
          ) : (
            <span aria-hidden="true">{initials(me.name)}</span>
          )}
          <div className="row">
            <label className="btn btn-outline btn-sm">
              {me.avatarUrl ? "Replace picture" : "Upload picture"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                hidden
                onChange={(event) => {
                  void choose(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
            {me.avatarUrl ? (
              <button className="btn btn-link" type="button" onClick={() => void removePhoto()}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <Status text={photoStatus.text} ok={photoStatus.ok} />
      </section>
      <section className="panel">
        <form onSubmit={(event) => void save(event)}>
          <h2>Details</h2>
          <div className="split">
            <div>
              <label className="field-label" htmlFor="account-name">Name</label>
              <input className="input" id="account-name" value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="account-email">Email</label>
              <input className="input" id="account-email" value={me.email} readOnly />
            </div>
          </div>
          <p className="muted">Leave the password fields blank to keep the current one.</p>
          <div className="split">
            <div>
              <label className="field-label" htmlFor="current-password">Current password</label>
              <input
                className="input"
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="new-password">New password</label>
              <input
                className="input"
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
          </div>
          <Status text={status.text} ok={status.ok} />
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving" : "Save account"}
          </button>
        </form>
      </section>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
