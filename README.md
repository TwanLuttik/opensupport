# Open Support Bubble

A self-hosted support chat: a small Node server, a React bubble that sits in the **bottom-left** of your site, and a token-authenticated REST API so an external app can read conversations and reply.

```
packages/server     @open-support/server     HTTP API + SQLite
packages/dashboard  @open-support/dashboard  Vite + React inbox, served by the server
packages/react      @open-support/react      <SupportBubble />
packages/sdk        @open-support/sdk        token-authenticated API client
packages/site       @open-support/site       public site for opensupport.dev
```

Requires Node 22+ (uses the built-in `node:sqlite` module).

## Run the server

This repo uses [pnpm](https://pnpm.io). Enable it once with `corepack enable`, then:

```bash
pnpm install
pnpm --filter @open-support/dashboard build
pnpm dev:server
```

The server listens on `http://localhost:8787`. The public site is a separate package: `pnpm dev:site` serves it at `http://localhost:5175`. It is not built or started with the server.

- `GET /` — dashboard. Sign in with `ADMIN_KEY`, reply to visitors, and configure the widget, allowed origins, webhooks, Telegram, and API tokens.
- `GET /health` — liveness
- `GET /widget.js` — tiny launcher for pages that are not React apps

On first boot without `ADMIN_KEY`, a one-time admin key is printed. Set `ADMIN_KEY` so it stays stable across restarts.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Listen port |
| `HOST` | `0.0.0.0` | Listen host |
| `DATABASE_PATH` | `./data/support.db` | SQLite file |
| `CORS_ORIGIN` | `*` | Allowed website origin, or a comma-separated list |
| `ADMIN_KEY` | generated | Required to mint and revoke API tokens |
| `UPLOAD_DIR` | `./data/uploads` | Attachment storage. Files stay on this disk, in 5 MB chunks, up to 50 MB |
| `WIDGET_TITLE` | `Support` | Bubble title |
| `WIDGET_SUBTITLE` | reply-time line | Header subtitle |
| `WIDGET_ACCENT` | `#111827` | Accent color, used by the Ink theme until you save a theme |
| `WIDGET_GREETING` | `Hi! How can we help?` | First system message |
| `WIDGET_PLACEHOLDER` | `Write a message…` | Composer placeholder |
| `COOKIE_SECURE` | from the request | `1` forces the `Secure` session cookie. `0` leaves it off. HTTPS proxies, including Railway, are detected from `X-Forwarded-Proto` |

## Deploy on Railway

One service runs the API and the dashboard. Railway builds with Railpack, which reads `railpack.json`: it compiles the dashboard and then the server, and starts `node packages/server/dist/cli.js`. The React widget and the SDK are not built or started. Node 22 comes from `engines` and `nixpacks.toml`. Railway sets `PORT`.

The container disk is wiped on every deploy. Add a volume mounted at `/data`, then set:

| Variable | Value |
| --- | --- |
| `DATABASE_PATH` | `/data/support.db` |
| `UPLOAD_DIR` | `/data/uploads` |
| `ADMIN_KEY` | a long random secret you keep |
| `CORS_ORIGIN` | the sites that embed the bubble, comma-separated |

Health check path: `/health`.

Without the volume, conversations, uploads, and sessions disappear on the next deploy. Without `ADMIN_KEY`, the recovery key changes on every restart. The dashboard cookie is marked `Secure` when Railway forwards the request as HTTPS.

## Dashboard

The inbox is a Vite + React app in `packages/dashboard`. `pnpm build` compiles it to `packages/dashboard/dist`, and the server serves that folder at `/`, `/inbox`, and `/dashboard`. While changing the UI, run `pnpm dev:dashboard` and open `http://localhost:5174`. It proxies `/api` to the server on port 8787.

Open `http://localhost:8787/`. The first visit asks you to create an admin account with an email and password. That admin can add more accounts from the **Accounts** tab. Agents can use the inbox. Admins can also change settings and mint API tokens.

The admin key (`ADMIN_KEY`, or the key printed on first boot) still signs in. Use it to recover access. The session is an HttpOnly cookie that lasts 14 days. It is also marked `Secure` when the request arrived over HTTPS.

- **Inbox** lists every conversation. A new thread says it is waiting for an agent. Open it and click **Assign to me**. The visitor sees "<name> joined the conversation" and the header names the agent. You can also reply or close the thread.
- **Appearance** edits the title, subtitle, placeholder, greeting, waiting message, and the bubble theme. Pick a template (Ink, Paper, Forest, Ocean, or Dusk) or customize every color. The bubble reads these live. They override `WIDGET_*` once you save.
- **Pre-chat form** asks the visitor to fill in fields you define (text, email, long text, or a dropdown) before a conversation starts. Turn it on from Settings. Answers are stored on the ticket. A field id of `name` or `email` also sets the visitor name or email.
- **Access** sets the browser origins allowed to embed the widget (`*` or a comma-separated list). This overrides `CORS_ORIGIN` once you save.
- **Webhooks** POST JSON to your URL for `conversation.created` and `message.created`. The signing secret is shown once. Requests include `X-Open-Support-Signature: sha256=<hmac of the raw body>`.
- **Telegram** sends those events to a bot chat. Reply to the notification in Telegram and the text is posted back to the visitor. The message you reply to must still contain the `cnv_…` id.
- **AI models** saves an OpenAI API key and picks the model. The key stays on the server.
- **AI agent** is extra knowledge the model uses to answer, plus client actions. Each action has a number and a description of what the visitor's page can look up. That description is added to the prompt. When a reply needs it, the model ends with `%%[1,2]%%`. The bubble shows buttons for those numbers, and the embedding app decides the label and the text the click sends. When the agent is enabled, the bubble lets a visitor chat with it instead of waiting for a person.
- **API tokens** are minted for external apps. The plaintext token is shown once.

Webhook body:

```json
{
  "id": "evt_…",
  "type": "message.created",
  "createdAt": "2026-04-16T12:00:00.000Z",
  "data": {
    "conversation": { "id": "cnv_…", "visitorName": "Ada", "status": "open" },
    "message": { "id": "msg_…", "role": "visitor", "body": "Hello" }
  }
}
```

### Mint an API token

```bash
curl -X POST http://localhost:8787/api/tokens \
  -H "authorization: Bearer $ADMIN_KEY" \
  -H "content-type: application/json" \
  -d '{"name":"Helpdesk"}'
```

The plaintext token (`osb_live_tok_….…`) is returned **once**. Only a hash is stored. Revoke it with `DELETE /api/tokens/:id`.

## SDK

`@open-support/sdk` wraps the token API. Install it with `npm install @open-support/sdk`. Create a client with the server URL and an API token, then list conversations, list messages, upload a file, send a reply, or close a ticket. Both lists return `nextCursor` for the following page.

```ts
import { OpenSupport } from "@open-support/sdk";

const support = new OpenSupport({
  serverUrl: "http://localhost:8787",
  token: process.env.OPEN_SUPPORT_TOKEN!,
});

const open = await support.listConversations({ status: "open", limit: 20 });
const messages = await support.listMessages(open.items[0].id, { limit: 50 });
const file = await support.uploadFile(open.items[0].id, {
  name: "notes.txt",
  type: "text/plain",
  bytes: new TextEncoder().encode("Checked the logs"),
});
await support.sendMessage(open.items[0].id, {
  body: "Looking now",
  agentName: "Sam",
  attachmentIds: [file.id],
});
await support.closeConversation(open.items[0].id);
```

Details are in [`packages/sdk/README.md`](packages/sdk/README.md).

## REST API

Send `Authorization: Bearer osb_live_…` on every call.

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/conversations?status=open&limit=50&cursor=` | List conversations, newest first |
| `GET` | `/api/conversations/:id` | Conversation plus full transcript |
| `GET` | `/api/conversations/:id/messages?after=` | Messages after an ISO timestamp |
| `POST` | `/api/conversations/:id/messages` | Reply as an agent. Body: `{ "body", "agentName?", "attachmentIds?" }` |
| `POST` / `PUT` | `/api/conversations/:id/uploads` | Chunked upload, then attach the returned id |
| `PATCH` | `/api/conversations/:id` | `{ "status": "open" \| "closed", "visitorName?", "visitorEmail?" }` |
| `POST` | `/api/conversations/:id/read` | Clear the agent unread counter |

Visitor endpoints (used by the widget, authorized with `X-Visitor-Token`):

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/widget/config` | Public copy, colors, and configured AI action ids |
| `POST` | `/api/widget/conversations` | Start a thread, returns `visitorToken` once. `handler: "ai"` starts an AI chat |
| `GET` | `/api/widget/conversations/:id?after=` | Poll the thread |
| `POST` | `/api/widget/conversations/:id/read` | Mark agent replies as read |
| `GET` | `/api/widget/live` | Websocket. Pushes messages, read receipts, and typing |
| `POST` | `/api/widget/conversations/:id/messages` | Visitor message |
| `POST` | `/api/widget/conversations/:id/ai` | Ask the model to answer the latest visitor message |

An AI reply that needs data from the page has `actionIds`, such as `[1, 2]`. The `%%[1,2]%%` marker is not stored in `body`. Post the looked-up text with the visitor message route, then call `/ai` again.

Example reply from an external app:

```bash
curl -X POST http://localhost:8787/api/conversations/cnv_abc/messages \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"body":"Looking into this now","agentName":"Sam"}'
```

## React widget

Install with `npm install @open-support/react`. Usage for a React app, including Next.js and Vite, is in [`packages/react/README.md`](packages/react/README.md). Next.js apps should import `OpenSupport` from `@open-support/react/next`.

```tsx
import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App() {
  return (
    <SupportBubble
      serverUrl="https://support.example.com"
      identifier={user.id}
      visitor={{ name: "Ada Lovelace", email: "ada@example.com", metadata: { plan: "pro" } }}
      actions={[
        { id: 1, label: "Share my plan", handler: () => `Plan: ${user.plan}` },
      ]}
    />
  );
}
```

The bubble is `position: fixed` at the bottom-left. The visitor token is kept in `localStorage` so a refresh resumes the same conversation. An open conversation uses a websocket for replies, read receipts, and typing, and falls back to polling if that connection drops.

`identifier` is your own stable id for the signed-in person. Every conversation started with the same value is grouped under that visitor in the dashboard, where a click opens their card. Leave it off for anonymous visitors. A new conversation still starts a new thread. The identifier only groups them.

`actions` matches the client actions saved on the **AI agent** page. Buttons appear under the latest AI reply when that reply asked for those ids. The handler's text is sent as the visitor's next message. Full props, Next.js, and the lower-level client are in the React readme.

`pnpm build` builds the public site for Cloudflare. `pnpm build:server` builds the dashboard, server, widget, and SDK. Run tests with `pnpm test`.

## Use a local checkout instead of npm

`@open-support/react` and `@open-support/sdk` are published to npm. To try a change that is not published yet, build first, then link the package into your app. `pnpm link` makes a global symlink, so later edits in this repo are picked up after you rebuild.

```bash
# in this repo, once
pnpm install
pnpm --filter @open-support/react build
```

```bash
# in your React or Next.js app. Pass the folder, not a package name.
# Quote the path if it contains spaces, or pnpm reports ERR_PNPM_LINK_BAD_PARAMS.
pnpm link /absolute/path/to/open-support-bubble/packages/react
```

Do not pass `--global` or `--filter`. `pnpm link` only accepts a directory. `--global` is rejected (`unexpected argument '--global'`). An unquoted path with a space is rejected as `ERR_PNPM_LINK_BAD_PARAMS`.

The command writes a `link:` dependency into the app:

```json
{
  "dependencies": {
    "@open-support/react": "link:../open-support-bubble/packages/react"
  }
}
```

That path is relative to the app. After you change the widget, run `pnpm --filter @open-support/react build` again in this repo. The app follows the link and does not need another install.

To stop using the link, delete the dependency and run `pnpm install`.

If your app uses npm or Yarn instead of pnpm, link with a `file:` dependency. That copies the built package at install time, so you reinstall after each rebuild:

```bash
npm install /absolute/path/to/open-support-bubble/packages/react
```

The server links the same way when another Node app should import it:

```bash
pnpm --filter @open-support/server build
# in the other app
pnpm link /absolute/path/to/open-support-bubble/packages/server
```

To run the server binary from a linked install, call `open-support-server` or `pnpm start:server` from this repo.

Point `serverUrl` at the host that runs `@open-support/server`, and set `CORS_ORIGIN` to your website's origin (not `*` if you want to lock it down). The widget never sees API tokens — those are only for your agent tools.
