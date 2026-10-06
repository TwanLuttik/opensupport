export function Status({ text, ok }: { text: string; ok: boolean }) {
  return <p className={ok ? "ok" : "error"}>{text}</p>;
}
