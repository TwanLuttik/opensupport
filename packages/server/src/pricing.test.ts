import assert from "node:assert/strict";
import test from "node:test";
import { estimateCost, modelPrice } from "./pricing.js";

test("a million nano input tokens costs ten cents", () => {
  assert.equal(estimateCost("gpt-4.1-nano", 1_000_000, 0), 0.1);
  assert.equal(estimateCost("gpt-4.1-nano", 0, 1_000_000), 0.4);
});

test("one reply mixes the input and output rates", () => {
  const cost = estimateCost("gpt-4o", 2_000, 100);
  assert.equal(cost, (2_000 / 1_000_000) * 2.5 + (100 / 1_000_000) * 10);
});

test("an unknown model is not given a made-up price", () => {
  assert.equal(modelPrice("claude-3"), null);
  assert.equal(estimateCost("claude-3", 5000, 200), 0);
});
