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
  return (
    <div className="settings">
      <div className="page-intro">
        <p className="kicker">Customers</p>
        <h1>Reviews</h1>
        <p className="muted">Thumbs after a chat ends. Skipped ratings are not part of the score.</p>
      </div>
      <section className="panel">
        <h2>{summary.score === null ? "No ratings yet" : `${Math.round(summary.score * 100)}% positive`}</h2>
        <p className="muted">{summary.up} up · {summary.down} down · {summary.skipped} skipped · {rated} rated</p>
        {summary.agents.length === 0 ? <p className="muted">Nobody has been rated yet.</p> : null}
        {summary.agents.map((agent) => (
          <div className="hook" key={agent.accountId || agent.name}>
            <div>
              <strong>{agent.name}</strong>
              <br />
              <small className="muted">{agent.up} up · {agent.down} down</small>
            </div>
            <span className="badge badge-outline">{agent.score === null ? "—" : `${Math.round(agent.score * 100)}%`}</span>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Comments</h2>
        {summary.reviews.filter((review) => review.comment).length === 0 ? <p className="muted">No comments yet.</p> : null}
        {summary.reviews.filter((review) => review.comment).map((review) => (
          <div className="hook" key={review.conversationId}>
            <div>
              <strong>{review.visitorName || "Visitor"}</strong>{" "}
              <span className={review.rating === "up" ? "badge badge-outline" : "badge badge-destructive"}>{review.rating === "up" ? "Up" : "Down"}</span>
              <br />
              <span>{review.comment}</span>
              <br />
              <small className="muted">{review.assigneeName || "Unassigned"} · {formatMessageTime(review.ratedAt) || review.ratedAt}</small>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
