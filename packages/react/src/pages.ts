/**
 * Paths where the bubble may appear. Omit the list to show it everywhere.
 * `/` and `/docs` match that path only. `/app/*` matches `/app` and everything under it.
 */
export function pageAllowed(pathname: string, pages: readonly string[] | undefined): boolean {
  if (!pages || pages.length === 0) return true;
  const path = normalizePath(pathname);
  return pages.some((pattern) => matchesPage(path, pattern));
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
