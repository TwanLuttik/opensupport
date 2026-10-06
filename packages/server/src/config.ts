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
  return {
    port: Number(env("PORT") ?? 8787),
    host: env("HOST") ?? "0.0.0.0",
    databasePath: env("DATABASE_PATH") ?? "./data/support.db",
    corsOrigin: env("CORS_ORIGIN") ?? "*",
    adminKey: env("ADMIN_KEY"),
    uploadDir: env("UPLOAD_DIR") ?? "./data/uploads",
    maxUploadBytes: Number(env("MAX_UPLOAD_BYTES") ?? 50 * 1024 * 1024),
    publicConfig: {
      title: env("WIDGET_TITLE") ?? "Support",
      subtitle: env("WIDGET_SUBTITLE") ?? "We typically reply within a few minutes.",
      accentColor: env("WIDGET_ACCENT") ?? "#111827",
      placeholder: env("WIDGET_PLACEHOLDER") ?? "Write a message…",
      greeting: env("WIDGET_GREETING") ?? "Hi! How can we help?",
      formEnabled: false,
      formTitle: "Before we start",
      formSubmitLabel: "Start conversation",
      formFields: [],
      waitingMessage: "Waiting for an agent",
      quickActions: [],
      logoUrl: null,
    },
    ...overrides,
  };
}
