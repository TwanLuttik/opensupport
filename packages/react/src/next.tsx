"use client";

import { SupportBubble } from "./SupportBubble.js";
import type { SupportBubbleProps } from "./types.js";

export type OpenSupportProps = Omit<SupportBubbleProps, "serverUrl"> & {
  /**
   * Open Support server origin. Defaults to `NEXT_PUBLIC_SUPPORT_URL`, which
   * Next.js inlines into the client bundle.
   */
  serverUrl?: string;
};

export function resolveServerUrl(serverUrl?: string): string {
  if (serverUrl) return serverUrl;
  const fromEnv = process.env.NEXT_PUBLIC_SUPPORT_URL;
  if (!fromEnv) {
    throw new Error(
      "@open-support/react/next: set NEXT_PUBLIC_SUPPORT_URL or pass the serverUrl prop to <OpenSupport />.",
    );
  }
  return fromEnv;
}

/**
 * Next.js entry. Safe to render from a Server Component: this module is a
 * Client Component and does not touch `localStorage` until after hydration.
 *
 * ```tsx
 * import { OpenSupport } from "@open-support/react/next";
 * import "@open-support/react/styles.css";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <OpenSupport />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function OpenSupport({ serverUrl, ...props }: OpenSupportProps) {
  return <SupportBubble {...props} serverUrl={resolveServerUrl(serverUrl)} />;
}

export { SupportBubble } from "./SupportBubble.js";
export {
  createClient,
  loadStoredSession,
  readSession,
  saveStoredSession,
  writeSession,
  sessionStorageKey,
} from "./client.js";
export type {
  Attachment,
  AuthorRole,
  FormField,
  FormFieldType,
  PublicConfig,
  StoredSession,
  SupportBubbleProps,
  SupportConversation,
  SupportMessage,
} from "./types.js";
