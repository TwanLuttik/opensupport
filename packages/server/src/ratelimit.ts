const WINDOW_MS = 10 * 60 * 1000;

interface Bucket {
  hits: number[];
}

/** Counts requests per key inside a rolling window. Old hits fall out on their own. */
export class SlidingWindow {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly windowMs = WINDOW_MS) {}

  /**
   * Records one request when it fits. Returns whether it was allowed and how
   * many seconds remain until the oldest request in the window expires.
   */
  take(key: string, limit: number, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const bucket = this.buckets.get(key) ?? { hits: [] };
    const cutoff = now - this.windowMs;
    bucket.hits = bucket.hits.filter((hit) => hit > cutoff);
    if (bucket.hits.length >= limit) {
      this.buckets.set(key, bucket);
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.hits[0]! + this.windowMs - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** The address the visitor connected from, ignoring a spoofable forwarding header. */
export function clientAddress(req: { socket: { remoteAddress?: string | null } }): string {
  return req.socket.remoteAddress || "unknown";
}
