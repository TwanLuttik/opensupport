import assert from "node:assert/strict";
import test from "node:test";
import { resolveServerUrl } from "./next.js";

test("resolveServerUrl prefers an explicit server and falls back to Next's public env", () => {
  const previous = process.env.NEXT_PUBLIC_SUPPORT_URL;
  process.env.NEXT_PUBLIC_SUPPORT_URL = "https://support.example.com";
  try {
    assert.equal(resolveServerUrl("http://localhost:8787"), "http://localhost:8787");
    assert.equal(resolveServerUrl(), "https://support.example.com");
    delete process.env.NEXT_PUBLIC_SUPPORT_URL;
    assert.throws(() => resolveServerUrl(), /NEXT_PUBLIC_SUPPORT_URL/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_URL;
    else process.env.NEXT_PUBLIC_SUPPORT_URL = previous;
  }
});
