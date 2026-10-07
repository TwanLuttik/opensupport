import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardFile } from "./dashboard.js";

test("a refresh of a dashboard screen returns the app shell", () => {
  const dir = mkdtempSync(join(tmpdir(), "osb-dash-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<script type=\"module\" src=\"/assets/index.js\"></script><div id=\"root\"></div>");
  writeFileSync(join(dir, "assets", "index.js"), "console.log(1)");
  const previous = process.env.OPEN_SUPPORT_DASHBOARD_DIR;
  process.env.OPEN_SUPPORT_DASHBOARD_DIR = dir;
  try {
    const ai = dashboardFile("/ai");
    assert.equal(ai?.type.startsWith("text/html"), true);
    assert.match(ai?.body.toString() ?? "", /src="\/assets\/index.js"/);
    const nested = dashboardFile("/settings/ai");
    assert.match(nested?.body.toString() ?? "", /src="\/assets\/index.js"/);
    assert.equal(dashboardFile("/settings/ai")?.type.startsWith("text/html"), true);
    assert.equal(dashboardFile("/settings/agent")?.type.startsWith("text/html"), true);
    assert.equal(dashboardFile("/statistics/ai")?.type.startsWith("text/html"), true);
    assert.equal(dashboardFile("/statistics/general")?.type.startsWith("text/html"), true);
    const asset = dashboardFile("/assets/index.js");
    assert.equal(asset?.type.startsWith("text/javascript"), true);
    assert.equal(dashboardFile("/assets/missing.js"), null);
  } finally {
    if (previous === undefined) delete process.env.OPEN_SUPPORT_DASHBOARD_DIR;
    else process.env.OPEN_SUPPORT_DASHBOARD_DIR = previous;
  }
});
