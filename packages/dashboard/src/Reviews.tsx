import { useEffect, useState } from "react";
import { api } from "./api.js";
import { formatMessageTime } from "./format.js";
import { Status } from "./components.js";

interface AgentScore {
  accountId: string | null;
  name: string;
  up: number;
  down: number;
  score: number | null;
}

interface Review {
  conversationId: string;
  visitorName: string | null;
  assigneeName: string | null;
  rating: "up" | "down";
  comment: string | null;
  ratedAt: string;
}

interface Summary {
  up: number;
  down: number;
  skipped: number;
  score: number | null;
  agents: AgentScore[];
  reviews: Review[];
}

export function Reviews() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ reviews: Summary }>("/api/dashboard/reviews")
      .then((data) => setSummary(data.reviews))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load reviews."));
  }, []);

  if (!summary) {
    return (
      <div className="settings">
        <Status text={error || "Loading reviews…"} ok={false} />
      </div>
    );
  }

  const rated = summary.up + summary.down;
  const comments = summary.reviews.filter((review) => review.comment);
  return (
    <div className="settings">
      <div className="page-intro">
        <p className="kicker">Customers</p>
        <h1>Reviews</h1>
        <p className="muted">Thumbs after a chat ends. Skipped ratings are not part of the score.</p>
      </div>
      <section className="panel">
        <h2>Score</h2>
        <div className="stats">
          <Stat label="Positive" value={summary.score === null ? "—" : `${Math.round(summary.score * 100)}%`} hint={rated === 0 ? "No ratings yet" : `${rated} rated`} />
          <Stat label="Up" value={String(summary.up)} hint="Thumbs up" />
          <Stat label="Down" value={String(summary.down)} hint="Thumbs down" />
          <Stat label="Skipped" value={String(summary.skipped)} hint="Not in the score" />
        </div>
      </section>
      <section className="panel">
        <h2>By agent</h2>
        {summary.agents.length === 0 ? (
          <p className="muted">Nobody has been rated yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Up</th>
                <th className="num">Down</th>
                <th className="num">Rated</th>
                <th className="num">Positive</th>
              </tr>
            </thead>
            <tbody>
              {summary.agents.map((agent) => (
                <tr key={agent.accountId || agent.name}>
                  <td>{agent.name}</td>
                  <td className="num">{agent.up}</td>
                  <td className="num">{agent.down}</td>
                  <td className="num">{agent.up + agent.down}</td>
                  <td className="num">{agent.score === null ? "—" : `${Math.round(agent.score * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="panel">
        <h2>Ratings</h2>
        {summary.reviews.length === 0 ? (
          <p className="muted">No ratings yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Visitor</th>
                <th>Agent</th>
                <th>Rating</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {summary.reviews.map((review) => (
                <tr key={review.conversationId}>
                  <td className="nowrap">{formatMessageTime(review.ratedAt) || review.ratedAt}</td>
                  <td>{review.visitorName || "Visitor"}</td>
                  <td>{review.assigneeName || "Unassigned"}</td>
                  <td>
                    <span className={review.rating === "up" ? "badge badge-outline" : "badge badge-destructive"}>
                      {review.rating === "up" ? "Up" : "Down"}
                    </span>
                  </td>
                  <td className="clip">{review.comment || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {comments.length === 0 && summary.reviews.length > 0 ? <p className="muted">No written comments yet.</p> : null}
      </section>
    </div>
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
