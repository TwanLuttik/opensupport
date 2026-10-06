import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function newId(prefix = "id"): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

/** Visitor session tokens are opaque and stored hashed. */
export function newSecret(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * API tokens look like `osb_live_<id>.<secret>` so the server can look the
 * record up by id and only compare a hash of the secret.
 */
export function createApiToken(): { id: string; token: string; secretHash: string; prefix: string } {
  const id = newId("tok");
  const secret = newSecret(24);
  const token = `osb_live_${id}.${secret}`;
  return {
    id,
    token,
    secretHash: sha256(secret),
    prefix: token.slice(0, 18),
  };
}

const PASSWORD_KEYLEN = 32;

/**
 * `scrypt$<salt>$<hash>`, both hex. Verification is constant-time on the hash.
 * Cost is intentionally modest so a self-hosted dashboard stays responsive.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, PASSWORD_KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, PASSWORD_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function parseApiToken(headerValue: string): { id: string; secret: string } | null {
  const raw = headerValue.startsWith("Bearer ") ? headerValue.slice(7).trim() : headerValue.trim();
  const match = /^osb_live_(tok_[a-f0-9]+)\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match) return null;
  return { id: match[1]!, secret: match[2]! };
}
