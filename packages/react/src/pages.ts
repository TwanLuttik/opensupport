/**
 * Whether the bubble should render on this path.
 * `pages` is an allowlist. Omit it to allow every path.
 * `hiddenPages` is a blocklist and wins when a path is on both lists.
 * `/` and `/docs` match that path only. `/app/*` matches `/app` and everything under it.
 * `basePath` is removed first, so a Next.js app mounted at `/app` still matches `/pricing`.
 */
export function pageAllowed(
  pathname: string,
  pages: readonly string[] | undefined,
  hiddenPages?: readonly string[] | undefined,
  basePath?: string,
): boolean {
  const path = routePath(pathname, basePath);
  if (matchesAny(path, hiddenPages)) return false;
  if (!pages || pages.length === 0) return true;
  return matchesAny(path, pages);
}

/**
 * The path the visitor is on. Next.js with a basePath keeps that prefix in
 * `location.pathname`, and a hash router keeps the route in `location.hash`.
 * Patterns are checked against both so `/pricing` hides `/app/pricing` and `#/pricing`.
 */
export function currentRoute(location: { pathname?: string; hash?: string } | undefined, basePath?: string): string {
  const pathname = routePath(location?.pathname || "/", basePath);
  const hashPath = hashRoute(location?.hash);
  if (!hashPath) return pathname;
  if (pathname === "/" || pathname === hashPath) return hashPath;
  return pathname;
}

function routePath(pathname: string, basePath?: string): string {
  const path = normalizePath(pathname);
  const base = normalizePath(basePath ?? "");
  if (!base || base === "/" || path === base) return path === base ? "/" : path;
  if (path.startsWith(`${base}/`)) return normalizePath(path.slice(base.length));
  return path;
}

function hashRoute(hash: string | undefined): string | null {
  if (!hash || hash === "#") return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw.split(/[?#]/)[0] ?? "";
  if (!path || (!path.startsWith("/") && !path.startsWith("!"))) return null;
  return normalizePath(path.startsWith("!") ? path.slice(1) : path);
}

function matchesAny(pathname: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => matchesPage(pathname, pattern));
}

function matchesPage(pathname: string, pattern: string): boolean {
  const rule = pattern.trim();
  if (!rule) return false;
  if (rule.endsWith("*")) {
    const prefix = normalizePath(rule.slice(0, -1).replace(/\/+$/, "") || "/");
    if (prefix === "/") return true;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
  return pathname === normalizePath(rule);
}

function normalizePath(pathname: string): string {
  const path = pathname.trim();
  if (!path || path === "/") return "/";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+$/, "") || "/";
}
