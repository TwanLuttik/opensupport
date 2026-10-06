import type { AiSettings, Message } from "./types.js";

export const OPENAI_SECRET_KEY = "openai:key";

/** Models the dashboard offers. The id is what OpenAI expects. */
export const OPENAI_MODELS = [
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "o4-mini", label: "o4-mini" },
] as const;

export const DEFAULT_AI_MODEL = OPENAI_MODELS[0].id;

const OPENAI_MODEL_IDS: ReadonlySet<string> = new Set(OPENAI_MODELS.map((model) => model.id));

export function isOpenAiModel(id: string): boolean {
  return OPENAI_MODEL_IDS.has(id);
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Turns the saved knowledge and the transcript into a chat the model can answer. */
export function buildAiMessages(ai: AiSettings, messages: Message[]): ChatTurn[] {
  const knowledge = ai.context.trim();
  const instructions = [
    `You are ${ai.agentName}, a support agent answering in a website chat.`,
    "Reply in plain text, in the visitor's language, and keep it short.",
    "Use only the knowledge below and the conversation. If the answer is not there, say so and offer to connect them with a person.",
    "Do not invent policies, prices, or account details.",
  ];
  if (knowledge) {
    instructions.push("", "Knowledge:", knowledge);
  }
  const turns: ChatTurn[] = [{ role: "system", content: instructions.join("\n") }];
  for (const message of messages) {
    const body = message.body.trim();
    if (!body) continue;
    if (message.role === "visitor") turns.push({ role: "user", content: body });
    else if (message.role === "agent") turns.push({ role: "assistant", content: body });
  }
  return turns;
}

export interface OpenAiReply {
  body: string;
  /** Tokens the model read, including the knowledge and the transcript. */
  promptTokens: number;
  /** Tokens in the reply. */
  completionTokens: number;
}

interface OpenAiChoice {
  message?: { content?: string | null };
}

interface OpenAiResponse {
  choices?: OpenAiChoice[];
  error?: { message?: string };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** Rough stand-in when a provider omits usage. About four characters per token. */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

/** Replaced in tests so a reply never leaves the process. */
let completeOpenAiImpl = completeOpenAi;

export function setOpenAiCompleter(impl: typeof completeOpenAi | null): void {
  completeOpenAiImpl = impl ?? completeOpenAi;
}

export function runOpenAi(
  input: { apiKey: string; model: string; messages: ChatTurn[] },
  fetchImpl?: typeof fetch,
): Promise<OpenAiReply> {
  return completeOpenAiImpl(input, fetchImpl);
}

/** Calls OpenAI chat completions. Tests pass fetchImpl so the network is never hit. */
export async function completeOpenAi(
  input: { apiKey: string; model: string; messages: ChatTurn[] },
  fetchImpl: typeof fetch = fetch,
): Promise<OpenAiReply> {
  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: 0.3,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Request failed";
    throw Object.assign(new Error(`Could not reach OpenAI: ${detail}`), { statusCode: 502 });
  }
  const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) {
    const detail = payload.error?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(detail), { statusCode: response.status === 401 ? 400 : 502 });
  }
  const body = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!body) {
    throw Object.assign(new Error("The model returned an empty reply"), { statusCode: 502 });
  }
  const reply = body.slice(0, 8000);
  const promptTokens = payload.usage?.prompt_tokens ?? input.messages.reduce((sum, turn) => sum + estimateTokens(turn.content), 0);
  const completionTokens = payload.usage?.completion_tokens ?? estimateTokens(reply);
  return { body: reply, promptTokens, completionTokens };
}
