import assert from "node:assert/strict";
import test from "node:test";
import { SlidingWindow } from "./ratelimit.js";

test("the third request inside the window is refused and the next one waits", () => {
  const window = new SlidingWindow(10 * 60 * 1000);
  const start = Date.parse("2026-04-16T12:00:00.000Z");
  assert.equal(window.take("1.2.3.4", 2, start).allowed, true);
  assert.equal(window.take("1.2.3.4", 2, start + 1000).allowed, true);
  const blocked = window.take("1.2.3.4", 2, start + 2000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 598);
  assert.equal(window.take("5.6.7.8", 2, start + 2000).allowed, true);
  assert.equal(window.take("1.2.3.4", 2, start + 10 * 60 * 1000 + 1).allowed, true);
});
