# @open-support/react

Drop-in support chat for a React app. `<SupportBubble />` renders a launcher fixed to the **bottom-left** of the page and talks to a self-hosted [Open Support](../../README.md) server.

Requires React 18 or 19. It works in client-rendered apps and in Next.js App Router and Pages Router. `localStorage` is only read after the component mounts, so server rendering does not crash.

## Install from a local checkout

The package is not on npm. Build it, then link it into the app that should render the bubble.

```bash
# in the open-support-bubble repo
corepack enable
pnpm install
pnpm --filter @open-support/react build
```

```bash
# in your app, which should already depend on react and react-dom
pnpm link "/Users/twanluttik/Library/Application Support/app.twanagent.desktop/projects/open-support-bubble/packages/react"
```

Quote the path. It contains a space (`Application Support`), and without quotes pnpm fails with `ERR_PNPM_LINK_BAD_PARAMS`. `pnpm link --global @open-support/react` fails with `unexpected argument '--global'`. `pnpm --filter @open-support/react link` fails with `Unknown option: 'recursive'` because `link` is not a workspace command.

pnpm records the link in the app:

```json
{
  "dependencies": {
    "@open-support/react": "link:../open-support-bubble/packages/react"
  }
}
```

Rebuild this package after you edit it (`pnpm --filter @open-support/react build`). The link points at `packages/react`, whose `exports` read `dist/`, so the app picks up the new build without another install.

Remove the `link:` dependency and run `pnpm install` to go back to a registry version.

If the app is not a pnpm project, install the folder directly instead of linking:

```bash
npm install /absolute/path/to/open-support-bubble/packages/react
```

Re-run that install after every rebuild. `react` and `react-dom` stay peer dependencies either way.

## Add the bubble

Render it once, near the root of the tree, so it stays mounted across route changes.

```tsx
import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App() {
  return (
    <>
      {/* your app */}
      <SupportBubble serverUrl="http://localhost:8787" />
    </>
  );
}
```

`serverUrl` is the origin of the Open Support server, with no path and no trailing slash. The stylesheet is required. Without it the launcher is an unstyled button.

Opening the bubble does not start a conversation. The visitor clicks **Start a conversation** first, then the composer appears. **End chat** closes the thread. A closed thread can be replaced by starting a new one. A refresh restores the same open thread from `localStorage`. Once an agent replies, their name is shown under the title.

## Identify the visitor

Pass a name, email, and string metadata. These are stored on the conversation when it is first created. Changing them later does not update an existing thread.

```tsx
import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App({ user }: { user: { name: string; email: string; plan: string } }) {
  return (
    <SupportBubble
      serverUrl={import.meta.env.VITE_SUPPORT_URL}
      visitor={{
        name: user.name,
        email: user.email,
        metadata: { plan: user.plan },
      }}
    />
  );
}
```

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
| `pollIntervalMs` | `number` | `3000` | How often an open panel checks for replies |
| `onOpenChange` | `(open: boolean) => void` | — | Fires when the panel opens or closes |
| `className` | `string` | — | Added to the fixed root element |

### AI action buttons

The dashboard **AI agent** page can list client actions. Each one has a number and a description of what the page can look up. That description is added to the model's knowledge. When a reply needs that fact, the model ends with `%%[1,2]%%`. The server stores the reply without the marker and sends the numbers as `actionIds`.

Pass a matching `actions` prop. The button label and the handler live in your app, not the dashboard. The handler returns text, and the bubble sends that text as the visitor's next message.

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

Title, subtitle, greeting, placeholder, and theme come from the server (`WIDGET_*` env vars, or the dashboard Appearance settings). The widget loads them from `GET /api/widget/config`. A theme is a template (`ink`, `paper`, `forest`, `ocean`, `dusk`) or `custom` with its own colors. The bubble paints those colors as CSS variables on `.osb-root`.

## Next.js

Install `next` 13 or newer alongside React 18 or 19. Import the Next entry instead of wrapping the component yourself. `OpenSupport` is a Client Component, so a Server Component layout can render it directly. It does not read `localStorage` until after hydration.

```bash
# .env.local
NEXT_PUBLIC_SUPPORT_URL=http://localhost:8787
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
        <OpenSupport
          visitor={{ metadata: { framework: "next" } }}
        />
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

If you already have a client boundary and want the shared component, `@open-support/react` (`SupportBubble`) is also safe to server-render. You then pass `serverUrl` yourself. `SupportBubble` does not read Next env vars.

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

- A round **?** button, fixed 20px from the left and bottom edges.
- A panel that opens above the button. Enter sends, Shift+Enter inserts a newline.
- Their own messages on the right, agent replies on the left, and the server greeting as a system line.
- A badge on the launcher when an agent replies while the panel is closed.
- A closed composer once an agent marks the conversation closed.

Polling runs only while the panel is open and a conversation already exists.

## Server requirements

The browser calls the server directly, so the server must allow your site's origin:

```bash
CORS_ORIGIN=https://app.example.com
```

Use a comma-separated list for more than one origin. `*` allows every origin and is fine for local development only.

The widget never receives an API token. Tokens are for your own tools that reply to conversations. See the [root README](../../README.md) for running the server and the agent API.

While developing, run the server from this repo with `pnpm dev:server` and use `serverUrl="http://localhost:8787"`.

## Session storage

The visitor token is stored in `localStorage` under `open-support:<serverUrl>`. Clearing site data starts a new conversation. Two different `serverUrl` values do not share a session.

```ts
import { readSession, writeSession } from "@open-support/react";

const session = readSession(localStorage, "http://localhost:8787");
// { conversationId: "cnv_…", visitorToken: "…" } or null
```

`writeSession` is the same helper the bubble uses if you need to restore a session yourself.

## Lower-level client

Use `createClient` when you want your own UI and only need the HTTP calls.

```ts
import { createClient, writeSession } from "@open-support/react";

const support = createClient("http://localhost:8787");

const started = await support.start({
  visitorName: "Ada",
  visitorEmail: "ada@example.com",
});

writeSession(localStorage, "http://localhost:8787", {
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
| `upload(session, { name, type, bytes }, onProgress?)` | Upload a file in 5 MB chunks, up to 50 MB. `onProgress(loaded, total)` fires after each chunk. The bubble shows the bar itself |

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

**A new conversation starts on every message.** `localStorage` is blocked, or `serverUrl` changed (a trailing slash is ignored, anything else is a different key).

**Replies never show up.** Open the panel. Polling is paused while it is closed. Confirm the agent reply went to the same conversation id.

**Next.js throws "set NEXT_PUBLIC_SUPPORT_URL".** `OpenSupport` was rendered without `serverUrl`, and the public env var is missing. Add it to `.env.local` and restart `next dev`. The variable must start with `NEXT_PUBLIC_` or the browser bundle will not see it.

**Styles look missing in Next.js.** Import `@open-support/react/styles.css` from `app/layout.tsx` or `pages/_app.tsx`. A CSS import inside a file that Next never bundles will not be emitted.
