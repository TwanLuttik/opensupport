import assert from "node:assert/strict";
import test from "node:test";
import { BUBBLE_RECONNECTS, widgetSocketUrl } from "./live.js";

test("the bubble socket carries the conversation and visitor token", () => {
  assert.equal(BUBBLE_RECONNECTS, 3);
  assert.equal(
    widgetSocketUrl("https://support.example/", { conversationId: "cnv_1", visitorToken: "a b" }),
    "wss://support.example/api/widget/live?conversation=cnv_1&token=a%20b",
  );
  assert.equal(
    widgetSocketUrl("http://127.0.0.1:8787", { conversationId: "cnv_1", visitorToken: "secret" }),
    "ws://127.0.0.1:8787/api/widget/live?conversation=cnv_1&token=secret",
  );
});
