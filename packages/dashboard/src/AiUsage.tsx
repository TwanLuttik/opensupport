import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Status } from "./components.js";
import { formatMessageTime } from "./format.js";

interface UsageModel {
  model: string;
  replies: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
}

interface UsageEntry {
  id: string;
  conversationId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
  estimatedCostUsd: number;
}

interface Usage {
  conversations: number;
  messages: number;
  replies: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  models: UsageModel[];
  recent: UsageEntry[];
}

const MODEL_NAMES: Record<string, string> = {
  "gpt-4.1-nano": "GPT-4.1 nano",
  "gpt-4.1-mini": "GPT-4.1 mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4o-mini": "GPT-4o mini",
  "gpt-4o": "GPT-4o",
  "o4-mini": "o4-mini",
};

export function AiUsage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ usage: Usage }>("/api/dashboard/ai/usage")
      .then((data) => setUsage(data.usage))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load AI usage."));
  }, []);

  if (!usage) {
    return <Status text={error || "Loading AI usage…"} ok={false} />;
  }

  const quiet = usage.conversations === 0 && usage.replies === 0;
  return (
    <>
      <section className="panel">
        <h2>{quiet ? "No AI chats yet" : money(usage.estimatedCostUsd)}</h2>
        <p className="muted">
          {quiet
            ? "Start a chat with the AI assistant and the numbers will show up here."
            : "Estimated from OpenAI’s standard prices. Repeated questions can cost less when OpenAI reuses them, so this is the high end."}
        </p>
        <div className="stats">
          <Stat label="Chats" value={String(usage.conversations)} hint="Visitors who chose the AI" />
          <Stat label="Questions" value={String(usage.messages)} hint="Messages those visitors sent" />
          <Stat label="Answers" value={String(usage.replies)} hint="Replies the AI wrote back" />
          <Stat label="Read" value={words(usage.promptTokens)} hint="Including your knowledge" />
          <Stat label="Written" value={words(usage.completionTokens)} hint="What the AI wrote back" />
          <Stat label="Cost" value={money(usage.estimatedCostUsd)} hint="Estimate, not the invoice" />
        </div>
      </section>
      <section className="panel">
        <h2>By model</h2>
        {usage.models.length === 0 ? (
          <p className="muted">No answers yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Model</th>
                <th className="num">Answers</th>
                <th className="num">Read</th>
                <th className="num">Written</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.models.map((model) => (
                <tr key={model.model}>
                  <td>{modelName(model.model)}</td>
                  <td className="num">{model.replies.toLocaleString()}</td>
                  <td className="num">{words(model.promptTokens)}</td>
                  <td className="num">{words(model.completionTokens)}</td>
                  <td className="num">{money(model.estimatedCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="panel">
        <h2>Latest answers</h2>
        {usage.recent.length === 0 ? (
          <p className="muted">Nothing has been answered yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Model</th>
                <th className="num">Read</th>
                <th className="num">Written</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.recent.map((entry) => (
                <tr key={entry.id}>
                  <td className="nowrap">{formatMessageTime(entry.createdAt) || entry.createdAt}</td>
                  <td>{modelName(entry.model)}</td>
                  <td className="num">{words(entry.promptTokens)}</td>
                  <td className="num">{words(entry.completionTokens)}</td>
                  <td className="num">{money(entry.estimatedCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

function modelName(id: string): string {
  return MODEL_NAMES[id] ?? id;
}

/** Tokens are hard to picture. A token is roughly three quarters of a word. */
function words(tokens: number): string {
  const count = Math.max(0, Math.round(tokens * 0.75));
  return `${count.toLocaleString()} ${count === 1 ? "word" : "words"}`;
}

function money(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
