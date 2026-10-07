import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Built Vite dashboard. `pnpm --filter @open-support/dashboard build` writes it.
 * Dev can point elsewhere with OPEN_SUPPORT_DASHBOARD_DIR.
 */
export function dashboardDir(): string | null {
  if (process.env.OPEN_SUPPORT_DASHBOARD === "0") return null;
  const override = process.env.OPEN_SUPPORT_DASHBOARD_DIR;
  if (override) {
    const dir = resolve(override);
    return existsSync(join(dir, "index.html")) ? dir : null;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../dashboard/dist"),
    join(here, "../dashboard"),
  ];
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? null;
}

export interface DashboardFile {
  body: Buffer;
  type: string;
  /** HTML is not cached so a rebuilt dashboard shows up on refresh. */
  cacheControl: string;
}

/** Paths that render the dashboard app shell. Each screen is a real URL. */
export const DASHBOARD_PAGES = [
  "/",
  "/inbox",
  "/settings",
  "/settings/appearance",
  "/settings/start",
  "/settings/ai",
  "/settings/agent",
  "/settings/access",
  "/settings/notifications",
  "/settings/accounts",
  "/accounts",
  "/account",
  "/reviews",
  "/ai",
  "/statistics",
  "/statistics/ai",
  "/statistics/general",
  "/hours",
  "/docs",
  "/dashboard",
];

/**
 * File to serve for a dashboard URL, or null when the path is not a dashboard
 * asset. Screen paths return the app shell so a refresh stays on that screen.
 */
export function dashboardFile(pathname: string): DashboardFile | null {
  const root = dashboardDir();
  if (!root) return null;
  const request = pathname.replace(/\/+$/, "") || "/";
  const relative = (DASHBOARD_PAGES as readonly string[]).includes(request) ? "index.html" : request.replace(/^\//, "");
  const file = normalize(join(root, relative));
  if (file !== root && !file.startsWith(root + "/")) return null;
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  return {
    body: readFileSync(file),
    type,
    cacheControl: extname(file) === ".html" ? "no-store" : "public, max-age=3600",
  };
}

/** Shown when the dashboard has not been built yet. */
export function dashboardMissingHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Open Support</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f1ea; color: #1a1916; font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    main { width: min(560px, calc(100% - 48px)); border: 2px solid #1a1916; background: #faf8f3; padding: 28px; box-shadow: 10px 10px 0 #1c3d36; }
    h1 { font-family: Palatino, "Iowan Old Style", serif; font-weight: 560; font-size: 36px; margin: 0 0 8px; }
    code { background: #e7f0ea; padding: 1px 5px; }
  </style>
</head>
<body>
  <main>
    <p>Open Support</p>
    <h1>Dashboard is not built.</h1>
    <p>The inbox is a Vite app. Build it once, then refresh.</p>
    <p><code>pnpm --filter @open-support/dashboard build</code></p>
  </main>
</body>
</html>`;
}
