/**
 * Whether the bubble should render on this path.
 * `pages` is an allowlist. Omit it to allow every path.
 * `hiddenPages` is a blocklist and wins when a path is on both lists.
 * `/` and `/docs` match that path only. `/app/*` matches `/app` and everything under it.
 */
export function pageAllowed(
  pathname: string,
  pages: readonly string[] | undefined,
  hiddenPages?: readonly string[] | undefined,
): boolean {
  const path = normalizePath(pathname);
  if (matchesAny(path, hiddenPages)) return false;
  if (!pages || pages.length === 0) return true;
  return matchesAny(path, pages);
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
