import assert from "node:assert/strict";
import test from "node:test";
import { currentRoute, pageAllowed } from "./pages.js";

const pages = ["/", "/docs", "/app/*"];

test("an empty allowlist shows the bubble everywhere", () => {
  assert.equal(pageAllowed("/billing", undefined), true);
  assert.equal(pageAllowed("/billing", []), true);
});

test("exact paths match only themselves and a star matches the prefix", () => {
  assert.equal(pageAllowed("/", pages), true);
  assert.equal(pageAllowed("/docs", pages), true);
  assert.equal(pageAllowed("/docs/start", pages), false);
  assert.equal(pageAllowed("/app", pages), true);
  assert.equal(pageAllowed("/app/settings", pages), true);
  assert.equal(pageAllowed("/application", pages), false);
  assert.equal(pageAllowed("/pricing", pages), false);
});

test("trailing slashes and a missing leading slash do not change the match", () => {
  assert.equal(pageAllowed("/docs/", ["docs"]), true);
  assert.equal(pageAllowed("/app/inbox/", ["/app/*"]), true);
  assert.equal(pageAllowed("/", ["/", "/docs/"]), true);
});

test("a blocklist hides matching paths and wins over the allowlist", () => {
  assert.equal(pageAllowed("/checkout", undefined, ["/checkout", "/admin/*"]), false);
  assert.equal(pageAllowed("/admin/users", undefined, ["/admin/*"]), false);
  assert.equal(pageAllowed("/docs", undefined, ["/checkout"]), true);
  assert.equal(pageAllowed("/app/billing", ["/app/*"], ["/app/billing"]), false);
  assert.equal(pageAllowed("/app/settings", ["/app/*"], ["/app/billing"]), true);
});

test("a Next base path and a hash route still match the patterns", () => {
  const hidden = ["/business/*", "/", "/pricing"];
  assert.equal(pageAllowed("/app/pricing", undefined, hidden, "/app"), false);
  assert.equal(pageAllowed("/app/business/settings", undefined, hidden, "/app"), false);
  assert.equal(pageAllowed("/app", undefined, hidden, "/app"), false);
  assert.equal(pageAllowed("/app/docs", undefined, hidden, "/app"), true);
  assert.equal(currentRoute({ pathname: "/", hash: "#/pricing" }), "/pricing");
  assert.equal(pageAllowed(currentRoute({ pathname: "/", hash: "#/pricing" }), undefined, hidden), false);
  assert.equal(pageAllowed(currentRoute({ pathname: "/pricing", hash: "#top" }), undefined, hidden), false);
  assert.equal(pageAllowed(currentRoute({ pathname: "/docs", hash: "#install" }), undefined, hidden), true);
});
