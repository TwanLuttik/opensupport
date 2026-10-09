import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { defaultBubbleTheme } from "./themes.js";
import type { PublicConfig } from "./types.js";

export interface ServerConfig {
  port: number;
  host: string;
  databasePath: string;
  /** Comma-separated origins, or `*` to allow any website to embed the widget. */
  corsOrigin: string;
  publicConfig: PublicConfig;
  /** Optional bootstrap admin key. If unset, the first created key is printed once. */
  adminKey?: string;
  /** Directory for uploaded attachments. */
  uploadDir: string;
  maxUploadBytes: number;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const paths = persistentPaths();
  return {
    port: Number(env("PORT") ?? 8787),
    host: env("HOST") ?? "0.0.0.0",
    databasePath: paths.databasePath,
    corsOrigin: env("CORS_ORIGIN") ?? "*",
    adminKey: env("ADMIN_KEY"),
    uploadDir: paths.uploadDir,
    maxUploadBytes: Number(env("MAX_UPLOAD_BYTES") ?? 50 * 1024 * 1024),
    publicConfig: {
      title: env("WIDGET_TITLE") ?? "Support",
      subtitle: env("WIDGET_SUBTITLE") ?? "We typically reply within a few minutes.",
      accentColor: env("WIDGET_ACCENT") ?? "#111827",
      theme: defaultBubbleTheme(env("WIDGET_ACCENT") ?? "#111827"),
      placeholder: env("WIDGET_PLACEHOLDER") ?? "Write a message…",
      greeting: env("WIDGET_GREETING") ?? "Hi! How can we help?",
      formEnabled: false,
      formTitle: "Before we start",
      formSubmitLabel: "Start conversation",
      formFields: [],
      waitingMessage: "Waiting for an agent",
      quickActions: [],
      logoUrl: null,
      showResponseTime: false,
    },
    ...overrides,
  };
}

/**
 * Railway wipes the container on every deploy. A mounted volume is the only
 * disk that survives, so a relative `./data` path would open a fresh database
 * and the desk would ask to create the admin again.
 * `RAILWAY_VOLUME_MOUNT_PATH` is set when a volume is attached.
 */
export function persistentPaths(
  values: Record<string, string | undefined> = process.env,
): { databasePath: string; uploadDir: string } {
  const volume = values.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  const databasePath = values.DATABASE_PATH?.trim();
  const uploadDir = values.UPLOAD_DIR?.trim();
  return {
    databasePath: placeOnVolume(databasePath, volume, "support.db"),
    uploadDir: placeOnVolume(uploadDir, volume, "uploads"),
  };
}

function placeOnVolume(configured: string | undefined, volume: string | undefined, fallbackName: string): string {
  if (!volume) return configured && configured.length > 0 ? configured : join("data", fallbackName);
  if (!configured) return join(volume, fallbackName);
  if (isAbsolute(configured)) return configured;
  // Already rooted on the volume, including a path relative to the mount.
  if (configured === volume || configured.startsWith(`${volume}/`)) return configured;
  const rooted = join(volume, configured);
  // Keep an existing relative file when this process can still see it, such as local dev.
  if (existsSync(configured) && !existsSync(rooted)) return configured;
  return rooted;
}
