/**
 * Standard OpenAI prices in USD per million tokens.
 * Input is what we send (knowledge and the conversation). Output is the reply.
 * Cached repeats are billed cheaper, but we only store the full input, so this estimate uses the standard rate.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "o4-mini": { input: 1.1, output: 4.4 },
};

export function modelPrice(model: string): { input: number; output: number } | null {
  return PRICES[model] ?? null;
}

/** USD for one reply. Unknown models cost nothing we can quote. */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const price = modelPrice(model);
  if (!price) return 0;
  return (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
}
