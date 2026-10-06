export function formatMessageTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (sameDay) return time;
  const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  return `${day}, ${time}`;
}

export function fieldId(label: string, index: number, used: Set<string>): string {
  const base = String(label || "field").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
  let id = /^[a-z]/.test(base) ? base : `field_${base}`;
  if (used.has(id)) id = `${id}_${index + 1}`;
  used.add(id);
  return id.slice(0, 40);
}
