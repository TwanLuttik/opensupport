"use client";

export { pageAllowed } from "./pages.js";
export { SupportBubble } from "./SupportBubble.js";
export {
  clearSession,
  clearStoredSession,
  createClient,
  isStaleSessionError,
  loadStoredSession,
  readSession,
  saveStoredSession,
  uploadChunked,
  WidgetRequestError,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_MAX_BYTES,
  writeSession,
  sessionStorageKey,
} from "./client.js";
export type {
  AiActionHandler,
  Attachment,
  AuthorRole,
  BubbleTheme,
  BubbleThemeColors,
  BubbleThemeId,
  FormField,
  FormFieldType,
  PublicConfig,
  QuickAction,
  StoredSession,
  SupportBubbleProps,
  SupportConversation,
  SupportMessage,
} from "./types.js";
