import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { AiUsage } from "./AiUsage.js";
import { api } from "./api.js";
import { Status } from "./components.js";

interface DeskStats {
  averageResponseSeconds: number | null;
  responseSamples: number;
  averageRating: number | null;
  ratingUp: number;
  ratingDown: number;
  ratingSkipped: number;
  averageConversationSeconds: number | null;
  conversationSamples: number;
}

const SECTIONS = [
  { to: "/statistics/general", label: "General", hint: "Response, rating, length" },
  { to: "/statistics/ai", label: "AI", hint: "Chats and cost" },
] as const;

export function Statistics() {
  return (
    <div className="settings">
      <div className="page-intro">
        <p className="kicker">Desk</p>
        <h1>Statistics</h1>
        <p className="muted">How the desk is doing, and what the AI has cost.</p>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Statistics">
          {SECTIONS.map((section) => (
            <NavLink key={section.to} to={section.to}>
              {section.label}
              <small>{section.hint}</small>
            </NavLink>
          ))}
        </nav>
        <div className="settings-section">
          <Routes>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<GeneralStats />} />
            <Route path="ai" element={<AiUsage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function GeneralStats() {
  const [stats, setStats] = useState<DeskStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ stats: DeskStats }>("/api/dashboard/stats")
      .then((data) => setStats(data.stats))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load statistics."));
  }, []);

  if (!stats) {
    return <Status text={error || "Loading statistics…"} ok={false} />;
  }

  const votes = stats.ratingUp + stats.ratingDown;
  return (
    <>
      <section className="panel">
        <h2>The desk</h2>
        <p className="muted">Averages across human chats. AI conversations are not included in the times.</p>
        <div className="stats">
          <Stat
            label="Response time"
            value={stats.averageResponseSeconds === null ? "—" : duration(stats.averageResponseSeconds)}
            hint={samples(stats.responseSamples, "accepted ticket")}
          />
          <Stat
            label="Rating"
            value={stats.averageRating === null ? "—" : `${Math.round(stats.averageRating * 100)}%`}
            hint={votes === 0 ? "No thumbs yet" : `${stats.ratingUp} up · ${stats.ratingDown} down`}
          />
          <Stat
            label="Conversation"
            value={stats.averageConversationSeconds === null ? "—" : duration(stats.averageConversationSeconds)}
            hint={samples(stats.conversationSamples, "closed chat")}
          />
        </div>
      </section>
      <section className="panel">
        <h2>Ratings</h2>
        <p className="muted">
          {stats.ratingSkipped
            ? `${stats.ratingSkipped} ${stats.ratingSkipped === 1 ? "visitor" : "visitors"} skipped the review.`
            : "Skipped reviews are not part of the score."}
        </p>
      </section>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function samples(count: number, noun: string): string {
  if (count === 0) return "Nothing to average yet";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}
