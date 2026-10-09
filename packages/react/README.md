# @open-support/react

Drop-in support chat for a React app. `<SupportBubble />` renders a launcher fixed to the bottom-left of the page and talks to a self-hosted [Open Support](https://opensupport.dev) server.

```bash
npm install @open-support/react
```

Requires React 18 or 19. `react` and `react-dom` are peer dependencies. It works in client-rendered apps and in the Next.js App Router and Pages Router. `localStorage` is only read after the component mounts, so server rendering does not crash.

## Add the bubble

Render it once, near the root of the tree, so it stays mounted across route changes.

```tsx
import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App() {
  return <SupportBubble serverUrl="https://support.example.com" />;
}
```

`serverUrl` is the origin of your Open Support server, with no path and no trailing slash. The stylesheet is required. Without it the launcher is an unstyled button.

Opening the bubble does not start a conversation. The visitor clicks **Start a conversation** first, then the composer appears. **End chat** closes the thread. A closed thread can be replaced by starting a new one. A refresh restores the same open thread from `localStorage`. Once an agent replies, their name is shown under the title.

## Identify the visitor

Pass a name, email, and string metadata. These are stored on the conversation when it is first created. Changing them later does not update an existing thread.

```tsx
import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App({ user }: { user: { id: string; name: string; email: string; plan: string } }) {
  return (
    <SupportBubble
      serverUrl="https://support.example.com"
      identifier={user.id}
      visitor={{
        name: user.name,
        email: user.email,
        metadata: { plan: user.plan },
      }}
    />
  );
}
```

`identifier` is your own stable id for the signed-in person. Every conversation started with the same value is grouped under that visitor in the desk. Leave it off for anonymous visitors. It groups threads. It does not continue the same thread.

Put the URL in an env var so local and production point at different servers:

| Tool | Variable |
| --- | --- |
| Vite | `import.meta.env.VITE_SUPPORT_URL` |
| Next.js | `process.env.NEXT_PUBLIC_SUPPORT_URL` |
| Create React App | `process.env.REACT_APP_SUPPORT_URL` |

## Props

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `serverUrl` | `string` | required | Open Support server origin |
| `identifier` | `string` | — | Stable id for this person. Conversations that share it are grouped |
| `actions` | `AiActionHandler[]` | — | Buttons for AI replies that ask the page for data |
| `visitor` | `{ name?, email?, metadata? }` | — | Sent only when the thread is created |
| `visitor.metadata` | `Record<string, string>` | — | Extra context, such as plan or page |
| `pollIntervalMs` | `number` | `3000` | How often to check for replies after the live connection gives up |
| `onOpenChange` | `(open: boolean) => void` | — | Fires when the panel opens or closes |
| `className` | `string` | — | Added to the fixed root element |

### AI action buttons

The desk's **AI agent** page can list client actions. Each one has a number and a description of what the page can look up. That description is added to the model's knowledge. When a reply needs that fact, the model ends with `%%[1,2]%%`. The server stores the reply without the marker and sends the numbers as `actionIds`.

Pass a matching `actions` prop. The button label and the handler live in your app, not the desk. The handler returns text, and the bubble sends that text as the visitor's next message.

```tsx
<SupportBubble
  serverUrl="https://support.example.com"
  actions={[
    {
      id: 1,
      label: "Share my plan",
      handler: () => `Plan: ${user.plan}, renews ${user.renewsAt}`,
    },
  ]}
/>
```

Buttons show under the latest AI reply, and only for ids that reply asked for. A handler that returns an empty string does not send anything.

Title, subtitle, greeting, placeholder, and theme come from the server. The widget loads them from `GET /api/widget/config`. A theme is `ink`, `paper`, `forest`, `ocean`, `dusk`, or `custom` with its own colors. The bubble paints those colors as CSS variables on `.osb-root`.

## Next.js

Install `next` 13 or newer alongside React 18 or 19. Import the Next entry instead of wrapping the component yourself. `OpenSupport` is a Client Component, so a Server Component layout can render it directly. It does not read `localStorage` until after hydration.

```bash
# .env.local
NEXT_PUBLIC_SUPPORT_URL=https://support.example.com
```

```tsx
// app/layout.tsx
import type { ReactNode } from "react";
import { OpenSupport } from "@open-support/react/next";
import "@open-support/react/styles.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <OpenSupport visitor={{ metadata: { framework: "next" } }} />
      </body>
    </html>
  );
}
```

`OpenSupport` reads `NEXT_PUBLIC_SUPPORT_URL` when you omit `serverUrl`. Pass `serverUrl` to override it. The other props are the same as `SupportBubble`.

`next.config` does not need a `transpilePackages` entry. The published build is plain JavaScript with a `use client` directive on both entry points.

**Pages Router** works the same way. No `dynamic(..., { ssr: false })` is required.

```tsx
// pages/_app.tsx
import type { AppProps } from "next/app";
import { OpenSupport } from "@open-support/react/next";
import "@open-support/react/styles.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <OpenSupport />
    </>
  );
}
```

If you already have a client boundary and want the shared component, import `SupportBubble` from `@open-support/react`. You then pass `serverUrl` yourself. `SupportBubble` does not read Next env vars.

## Vite

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <SupportBubble serverUrl={import.meta.env.VITE_SUPPORT_URL} />
  </StrictMode>,
);
```

## What the visitor sees

- A round launcher, fixed 20px from the left and bottom edges. It shows your logo when one is set, otherwise a chat mark.
- A panel that opens above the button. Enter sends. Shift+Enter inserts a newline.
- Their own messages on the right, agent replies on the left, and the server greeting as a system line.
- A badge on the launcher when an agent replies while the panel is closed.
- A closed composer once an agent marks the conversation closed.

An open conversation keeps a websocket to the server. If it drops, the bubble tries to reconnect three times, then falls back to polling at `pollIntervalMs`. Polling also covers browsers without `WebSocket`.

While someone is typing, the other side sees a typing indicator. It disappears 3 seconds after the last keystroke, and comes back when typing starts again. The visitor's latest message says **Read** once an agent has opened the thread. Opening the panel marks agent replies as read.

## Server requirements

The browser calls the server directly, so the server must allow your site's origin. Set `CORS_ORIGIN` to that origin, or to a comma-separated list. `*` allows every origin and is fine for local development only.

```bash
CORS_ORIGIN=https://app.example.com
```

The widget never receives an API token. Tokens are for your own tools that reply to conversations. Use [`@open-support/sdk`](https://www.npmjs.com/package/@open-support/sdk) for that.

The server, the desk, and the deploy notes are in the [Open Support repository](https://github.com/TwanLuttik/opensupport). While developing, run the server from that repo with `pnpm dev:server` and use `serverUrl="http://localhost:8787"`.

## Session storage

The visitor token is stored in `localStorage` under `open-support:<serverUrl>`. Clearing site data starts a new conversation. Two different `serverUrl` values do not share a session.

```ts
import { readSession, writeSession } from "@open-support/react";

const session = readSession(localStorage, "https://support.example.com");
// { conversationId: "cnv_…", visitorToken: "…" } or null
```

`writeSession` is the same helper the bubble uses if you need to restore a session yourself.

## Lower-level client

Use `createClient` when you want your own UI and only need the HTTP calls.

```ts
import { createClient, writeSession } from "@open-support/react";

const support = createClient("https://support.example.com");

const started = await support.start({
  visitorName: "Ada",
  visitorEmail: "ada@example.com",
});

writeSession(localStorage, "https://support.example.com", {
  conversationId: started.conversation.id,
  visitorToken: started.visitorToken,
});

await support.send(
  { conversationId: started.conversation.id, visitorToken: started.visitorToken },
  "The checkout button does nothing.",
);
```

| Method | Purpose |
| --- | --- |
| `getConfig()` | Public title, colors, and copy |
| `start({ visitorName, visitorEmail, metadata })` | Create a conversation. Returns the visitor token once |
| `getThread(session, after?)` | Load the thread. `after` is the `createdAt` of the last message you have |
| `send(session, body)` | Post a visitor message |
| `askAi(session)` | Ask the model to answer the latest visitor message. `actionIds` lists the page actions that reply requested |
| `upload(session, { name, type, bytes }, onProgress?)` | Upload a file in 5 MB chunks, up to 50 MB. `onProgress(loaded, total)` fires after each chunk |

## Styling

All classes start with `osb-`. Override them after the imported stylesheet.

```css
.osb-root {
  left: 24px;
  bottom: 24px;
}

.osb-panel {
  width: 400px;
}
```

`className` is appended to `.osb-root`. Theme colors are inline custom properties from the server (`--osb-accent`, `--osb-header`, `--osb-panel`, `--osb-canvas`, `--osb-ink`, and others), so a CSS `background` on `.osb-launcher` will not win unless you raise specificity or use `!important`.

Useful classes: `osb-launcher`, `osb-panel`, `osb-header`, `osb-messages`, `osb-message-visitor`, `osb-message-agent`, `osb-message-system`, `osb-composer`, `osb-badge`.

## Troubleshooting

**The panel says support is unavailable.** The browser could not reach `GET /api/widget/config`. Check `serverUrl`, that the server is running, and the CORS origin.

**Requests fail with "Origin not allowed".** `CORS_ORIGIN` on the server does not include the page origin (scheme, host, and port). `http://localhost:5173` and `http://127.0.0.1:5173` are different origins.

**A new conversation starts on every message.** `localStorage` is blocked, or `serverUrl` changed. A trailing slash is ignored. Anything else is a different key.

**The panel says "Invalid visitor token" and End chat does nothing.** The saved token no longer matches a conversation on this server. That happens when the database was replaced, or the conversation was deleted. The desk can still close a conversation that exists. A current bubble drops a session the server says is gone (`visitor_session_expired`) and offers a new chat. A token that belongs to a different conversation is still rejected.

**Replies never show up.** Confirm the agent reply went to the same conversation id. If the live connection cannot be opened, the bubble falls back to polling after three tries.

**Next.js throws "set NEXT_PUBLIC_SUPPORT_URL".** `OpenSupport` was rendered without `serverUrl`, and the public env var is missing. Add it to `.env.local` and restart `next dev`. The variable must start with `NEXT_PUBLIC_` or the browser bundle will not see it.

**Styles look missing in Next.js.** Import `@open-support/react/styles.css` from `app/layout.tsx` or `pages/_app.tsx`. A CSS import inside a file that Next never bundles will not be emitted.

## Develop against a local checkout

To try a change that is not published yet, build this package and link the folder into your app:

```bash
pnpm --filter @open-support/react build
pnpm link /absolute/path/to/open-support-bubble/packages/react
```

Quote the path if it contains spaces. Rebuild after edits. The link points at `packages/react`, whose `exports` read `dist/`, so the app picks up the new build without another install.

Created by [CoatCheck Technology, Inc.](https://opensupport.dev)
