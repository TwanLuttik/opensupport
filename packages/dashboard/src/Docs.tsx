import type { ReactNode } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

const PAGES = [
  { to: "/docs/desk", label: "Desk", hint: "Inbox, hours, and settings" },
  { to: "/docs/react", label: "React bubble", hint: "Embed the chat" },
  { to: "/docs/api", label: "HTTP API", hint: "Widget and token routes" },
  { to: "/docs/sdk", label: "API SDK", hint: "Reply from your own app" },
  { to: "/docs/server", label: "Server", hint: "Run it and deploy" },
] as const;

export function Docs() {
  return (
    <div className="docs">
      <div className="page-intro">
        <p className="kicker">Guide</p>
        <h1>Docs</h1>
        <p className="muted">The desk, the React bubble, the HTTP API, and the SDK each have their own page.</p>
      </div>
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Documentation">
          {PAGES.map((page) => (
            <NavLink key={page.to} to={page.to}>
              {page.label}
              <small>{page.hint}</small>
            </NavLink>
          ))}
        </nav>
        <div className="docs-section">
          <Routes>
            <Route index element={<Navigate to="desk" replace />} />
            <Route path="desk" element={<DeskDocs />} />
            <Route path="react" element={<ReactDocs />} />
            <Route path="api" element={<ApiDocs />} />
            <Route path="sdk" element={<SdkDocs />} />
            <Route path="server" element={<ServerDocs />} />
            <Route path="*" element={<Navigate to="/docs/desk" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function DocPage({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <>
      <section className="panel">
        <h2>{title}</h2>
        <p>{lede}</p>
      </section>
      {children}
    </>
  );
}

function DeskDocs() {
  return (
    <DocPage title="Using the desk" lede="Sign in, then work from the header. The first account is an admin. Admins add other people under Settings, then Accounts.">
      <section className="panel">
        <h3>Inbox</h3>
        <ul>
          <li><strong>Needs you</strong> is work waiting on a person. <strong>AI</strong> is chats the model is answering. <strong>Open</strong> is a live chat someone has joined. <strong>Done</strong> is closed.</li>
          <li><strong>Assign to me</strong> puts your name and profile picture on the ticket. The visitor sees both in the bubble.</li>
          <li>Reply from the composer. The visitor sees your account name, not the word You. The typing indicator shows while someone is typing and disappears 3 seconds after they stop.</li>
          <li>A reply shows <strong>Read</strong> once the other person has opened it. Opening a thread marks it read.</li>
          <li><strong>End conversation</strong> closes the ticket. The visitor sees who ended it and can no longer reply.</li>
          <li>Click an image to view it full screen. Code files open in a reader. Other files have a download button.</li>
          <li>A thread marked <strong>AI chat</strong> is being answered by the model until someone assigns it.</li>
        </ul>
      </section>
      <section className="panel">
        <h3>Hours and reviews</h3>
        <ul>
          <li><strong>Hours</strong> limits live chat to a weekly schedule in a timezone. Outside those hours the visitor leaves an email instead. AI chat still opens.</li>
          <li><strong>Reviews</strong> is the thumbs-up share after a chat ends. Skipped ratings do not count. Only admins see it.</li>
          <li><strong>Statistics</strong> shows wait time, ratings, and how long chats stay open. <strong>AI usage</strong> counts questions and estimates cost.</li>
          <li>Click your name to change your picture, display name, or password. Online and Away tell visitors whether a person is at the desk.</li>
        </ul>
      </section>
      <section className="panel">
        <h3>Settings</h3>
        <ul>
          <li><strong>Appearance</strong> sets the title, subtitle, greeting, placeholder, waiting line, logo, and theme. Templates are Ink, Paper, Forest, Ocean, and Dusk. Custom paints every color.</li>
          <li><strong>Start screen</strong> adds topic buttons and an optional pre-chat form. A field id of <code>name</code> or <code>email</code> fills the visitor card.</li>
          <li><strong>AI models</strong> saves an OpenAI key, picks the model, names the agent, and can limit how often one address may ask.</li>
          <li><strong>AI agent</strong> is the knowledge the model answers from, plus client actions the visitor's page can answer with a button. See the React page for how those buttons are wired.</li>
          <li><strong>Access</strong> lists the sites allowed to embed the bubble. The desk itself is always allowed, so saving a site here cannot lock you out.</li>
          <li><strong>Notifications</strong> posts events to a webhook or Telegram, and mints API tokens for the SDK.</li>
        </ul>
      </section>
      <section className="panel">
        <h3>Client actions</h3>
        <p>Use an action when the model needs a fact that lives in the visitor's app, such as their plan or their latest order. On <strong>AI agent</strong>, add a row:</p>
        <table>
          <thead><tr><th>Field</th><th>What it is for</th></tr></thead>
          <tbody>
            <tr><td>Id</td><td>A number from 1 to 99. The model writes this inside <code>%%[1]%%</code>.</td></tr>
            <tr><td>Name</td><td>Only shown on this page, so you can tell actions apart.</td></tr>
            <tr><td>What it does</td><td>Added to the model's knowledge. Say what the page returns and when to ask for it.</td></tr>
          </tbody>
        </table>
        <p>Saving the page teaches the model. When a reply needs that fact, and the chat does not already contain it, the model ends with <code>%%[1,2]%%</code>. The desk stores the sentence without the marker and keeps the numbers on the message. The button label and the text a click sends are configured in the React app, not here.</p>
      </section>
    </DocPage>
  );
}

function ReactDocs() {
  return (
    <DocPage title="React bubble" lede="The React package is not on npm yet. Build it here, then add the folder to the app that should show the chat.">
      <section className="panel">
        <h3>Install</h3>
        <pre className="doc">{`# in this repo
pnpm --filter @open-support/react build

# in the other app. Quote the path when it contains a space.
pnpm add /absolute/path/to/open-support-bubble/packages/react`}</pre>
        <p>Render it once, near the root, so it stays mounted across route changes. The stylesheet is required.</p>
        <pre className="doc">{`import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App() {
  return (
    <SupportBubble
      serverUrl="http://localhost:8787"
      identifier="user_42"
      visitor={{ name: "Ada Lovelace", email: "ada@example.com", metadata: { plan: "pro" } }}
    />
  );
}`}</pre>
      </section>
      <section className="panel">
        <h3>Props</h3>
        <table>
          <thead><tr><th>Prop</th><th>Default</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>serverUrl</code></td><td>required</td><td>Origin of this server, with no path</td></tr>
            <tr><td><code>identifier</code></td><td>—</td><td>Stable id for this person. Conversations that share it are grouped</td></tr>
            <tr><td><code>visitor</code></td><td>—</td><td>Name, email, and string metadata stored when the chat starts</td></tr>
            <tr><td><code>actions</code></td><td>—</td><td>Buttons for AI replies that ask the page for data</td></tr>
            <tr><td><code>pollIntervalMs</code></td><td><code>3000</code></td><td>How often to check for replies after the live connection gives up</td></tr>
            <tr><td><code>onOpenChange</code></td><td>—</td><td>Called when the panel opens or closes</td></tr>
            <tr><td><code>className</code></td><td>—</td><td>Added to the fixed root element</td></tr>
          </tbody>
        </table>
        <p>Opening the bubble does not start a chat. Topics, the pre-chat form, the logo, the theme, and the hours all come from Settings. Visitors can attach a file, drop one onto the open panel, or screenshot the page they are on. The chat itself is left out of that picture.</p>
        <p>Set the allowed origins under Settings, then Access. <code>http://localhost:5173</code> and <code>http://127.0.0.1:5173</code> are different origins. The bubble never receives an API token. Rebuild the package after changing it, then refresh the host app.</p>
      </section>
      <section className="panel">
        <h3>AI action buttons</h3>
        <p>Configure the actions on the desk first. Each one has a number and a description of what the page can look up. That description is added to the model's knowledge. When a reply needs the fact, the model ends with <code>%%[1,2]%%</code>. The stored message drops the marker and keeps the numbers as <code>actionIds</code>.</p>
        <p>Pass a matching <code>actions</code> prop. The label and the handler live in your app. The handler returns text, and the bubble sends that text as the visitor's next message, then asks the model to answer again.</p>
        <pre className="doc">{`import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App({ user }: { user: { plan: string; renewsAt: string } }) {
  return (
    <SupportBubble
      serverUrl="https://support.example.com"
      actions={[
        {
          id: 1,
          label: "Share my plan",
          handler: () => \`Plan: \${user.plan}, renews \${user.renewsAt}\`,
        },
        {
          id: 2,
          label: "Share my latest order",
          handler: async () => {
            const order = await loadLatestOrder();
            return order ? \`Order \${order.id} is \${order.status}.\` : "";
          },
        },
      ]}
    />
  );
}`}</pre>
        <ul>
          <li>Buttons show under the latest AI reply, and only for ids that reply asked for.</li>
          <li>An id with no handler is skipped. A handler that returns an empty string sends nothing.</li>
          <li>The click is disabled while a message or another action is in flight.</li>
          <li>Human chats never show these buttons. A person who assigns an AI chat takes over.</li>
        </ul>
      </section>
      <section className="panel">
        <h3>Next.js</h3>
        <p>Next 13 or newer. <code>OpenSupport</code> is a Client Component, so a Server Component layout can render it. It reads <code>NEXT_PUBLIC_SUPPORT_URL</code> when you omit <code>serverUrl</code>. The other props, including <code>actions</code>, are the same.</p>
        <pre className="doc">{`# .env.local
NEXT_PUBLIC_SUPPORT_URL=http://localhost:8787`}</pre>
        <pre className="doc">{`// app/layout.tsx
import { OpenSupport } from "@open-support/react/next";
import "@open-support/react/styles.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <OpenSupport identifier="user_42" />
      </body>
    </html>
  );
}`}</pre>
        <p>Pages Router uses the same import in <code>pages/_app.tsx</code>. Restart <code>next dev</code> after adding the env var. It must start with <code>NEXT_PUBLIC_</code>.</p>
        <p>If Next cannot resolve <code>@open-support/react/next</code>, the package lives outside the app's lockfile. Set Turbopack's root to a folder that contains both projects, then restart. Config changes are not hot-reloaded.</p>
        <pre className="doc">{`// next.config.ts
import path from "node:path";

const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};`}</pre>
      </section>
      <section className="panel">
        <h3>Your own UI</h3>
        <p><code>createClient</code> is the same HTTP the bubble uses, without the panel. AI replies come back from <code>askAi</code> after you <code>send</code> a visitor message. Read <code>actionIds</code> on that message and post the handler text with another <code>send</code>.</p>
        <pre className="doc">{`import { createClient } from "@open-support/react";

const support = createClient("http://localhost:8787");
const started = await support.start({ handler: "ai", visitorName: "Ada" });
const session = { conversationId: started.conversation.id, visitorToken: started.visitorToken };
await support.send(session, "When does my plan renew?");
const reply = await support.askAi(session);
// reply.actionIds is [1] when the model ended with %%[1]%%`}</pre>
      </section>
    </DocPage>
  );
}

function ApiDocs() {
  return (
    <DocPage title="HTTP API" lede="The browser uses the widget routes. Your own tools use a bearer token. The two never share credentials.">
      <section className="panel">
        <h3>Widget</h3>
        <p>These routes are what the bubble calls. Authorize a thread with <code>X-Visitor-Token</code>, returned once when the conversation is created.</p>
        <table>
          <thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>GET</code></td><td><code>/api/widget/config</code></td><td>Public copy, colors, hours, and whether AI is on. <code>ai.actions</code> lists configured action ids.</td></tr>
            <tr><td><code>POST</code></td><td><code>/api/widget/conversations</code></td><td>Starts a thread. Body may include <code>handler: "ai"</code>, <code>topic</code>, <code>identifier</code>, and form <code>fields</code>.</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/widget/live</code></td><td>Websocket for one open chat. Query: <code>conversation</code> and <code>token</code>. Pushes messages, read receipts, typing, and conversation changes. Send <code>{`{ "type": "typing", "typing": true }`}</code> while composing.</td></tr>
            <tr><td><code>POST</code></td><td><code>/api/widget/conversations/:id/read</code></td><td>Marks agent replies as read. The desk sees <strong>Read</strong> on messages up to that moment.</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/widget/conversations/:id</code></td><td>Reads the thread. <code>after</code> returns only newer messages. Used when the socket cannot stay open.</td></tr>
            <tr><td><code>POST</code></td><td><code>/api/widget/conversations/:id/messages</code></td><td>Posts a visitor message. Body: <code>{`{ "body", "attachmentIds?" }`}</code>.</td></tr>
            <tr><td><code>POST</code></td><td><code>/api/widget/conversations/:id/ai</code></td><td>Asks the model to answer the latest visitor message. Only for AI chats that no person has joined.</td></tr>
          </tbody>
        </table>
        <p>An AI reply that needs page data looks like any other agent message, plus <code>actionIds</code>. The <code>%%[1,2]%%</code> marker is removed before the body is stored. Unknown ids are dropped.</p>
        <pre className="doc">{`{
  "message": {
    "id": "msg_…",
    "role": "agent",
    "agentName": "AI assistant",
    "body": "I need your plan to answer that.",
    "actionIds": [1, 2]
  }
}`}</pre>
        <p>Send the looked-up text back with the visitor message route, then call <code>/ai</code> again. That is what the bubble does when a button is clicked.</p>
      </section>
      <section className="panel">
        <h3>Token API</h3>
        <p>Send <code>Authorization: Bearer osb_live_…</code> on every call. Mint the token under Settings, then Notifications. The plaintext is shown once.</p>
        <table>
          <thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>GET</code></td><td><code>/api/conversations?status=open&amp;limit=50&amp;cursor=</code></td><td>Lists conversations, newest first.</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/conversations/:id</code></td><td>One conversation plus its transcript. AI messages include <code>actionIds</code> when they asked for page data.</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/conversations/:id/messages?after=</code></td><td>Messages after an ISO timestamp.</td></tr>
            <tr><td><code>POST</code></td><td><code>/api/conversations/:id/messages</code></td><td>Replies as an agent. Body: <code>{`{ "body", "agentName?", "attachmentIds?" }`}</code>.</td></tr>
            <tr><td><code>POST</code> / <code>PUT</code></td><td><code>/api/conversations/:id/uploads</code></td><td>Chunked upload, then attach the returned id.</td></tr>
            <tr><td><code>PATCH</code></td><td><code>/api/conversations/:id</code></td><td><code>{`{ "status": "open" | "closed" }`}</code>, and optional visitor name or email.</td></tr>
            <tr><td><code>POST</code></td><td><code>/api/conversations/:id/read</code></td><td>Clears the agent unread counter and marks visitor messages as read.</td></tr>
            <tr><td><code>GET</code></td><td><code>/api/dashboard/live</code></td><td>Desk websocket. Pushes the same events, and accepts <code>{`{ "type": "typing", "conversationId", "typing" }`}</code>.</td></tr>
            <tr><td><code>POST</code></td><td><code>/api/conversations/:id/assign</code></td><td>Claims the ticket. Joining an AI chat stops the model from answering.</td></tr>
          </tbody>
        </table>
        <pre className="doc">{`curl -X POST http://localhost:8787/api/conversations/cnv_abc/messages \\
  -H "authorization: Bearer $TOKEN" \\
  -H "content-type: application/json" \\
  -d '{"body":"Looking into this now","agentName":"Sam"}'`}</pre>
      </section>
      <section className="panel">
        <h3>Webhooks</h3>
        <p>A webhook POSTs JSON for <code>conversation.created</code> and <code>message.created</code>. The signing secret is shown once. Requests include <code>X-Open-Support-Signature: sha256=&lt;hmac of the raw body&gt;</code>.</p>
        <pre className="doc">{`{
  "id": "evt_…",
  "type": "message.created",
  "createdAt": "2026-04-16T12:00:00.000Z",
  "data": {
    "conversation": { "id": "cnv_…", "visitorName": "Ada", "status": "open" },
    "message": { "id": "msg_…", "role": "agent", "body": "I need your plan to answer that.", "actionIds": [1] }
  }
}`}</pre>
      </section>
    </DocPage>
  );
}

function SdkDocs() {
  return (
    <DocPage title="API SDK" lede="@open-support/sdk is for your own tools. It uses an API token from Settings, then Notifications. Do not put that token in the browser.">
      <section className="panel">
        <h3>Install</h3>
        <pre className="doc">{`pnpm --filter @open-support/sdk build
pnpm add /absolute/path/to/open-support-bubble/packages/sdk`}</pre>
        <pre className="doc">{`import { OpenSupport } from "@open-support/sdk";

const support = new OpenSupport({
  serverUrl: "http://localhost:8787",
  token: process.env.OPEN_SUPPORT_TOKEN!,
});

const open = await support.listConversations({ status: "open", limit: 20 });
const thread = await support.listMessages(open.items[0].id, { limit: 50 });
const visitor = await support.getVisitor("user_42");

await support.assignConversation(open.items[0].id, { agentName: "Sam" });
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
await support.closeConversation(open.items[0].id);`}</pre>
      </section>
      <section className="panel">
        <h3>Methods</h3>
        <table>
          <thead><tr><th>Method</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>listConversations</code></td><td>Newest activity first. Filter with <code>status</code> or <code>identifier</code>.</td></tr>
            <tr><td><code>listMessages</code></td><td>Oldest first. Pass <code>after</code> to poll, or <code>cursor</code> to page.</td></tr>
            <tr><td><code>getVisitor</code></td><td>The person behind an identifier, plus every conversation they started.</td></tr>
            <tr><td><code>assignConversation</code></td><td>Claims the ticket and posts "&lt;name&gt; joined the conversation".</td></tr>
            <tr><td><code>sendMessage</code></td><td>Posts an agent reply. <code>agentName</code> is the name shown in the bubble.</td></tr>
            <tr><td><code>uploadFile</code></td><td>Sends a file in 5 MB chunks, up to 50 MB, and returns an attachment id.</td></tr>
            <tr><td><code>closeConversation</code></td><td>Ends the ticket. The visitor can no longer write in it.</td></tr>
          </tbody>
        </table>
        <p><code>nextCursor</code> is <code>null</code> on the last page. Pass it back as <code>cursor</code>. A failed request throws <code>OpenSupportError</code> with the HTTP status.</p>
        <p>AI replies are ordinary agent messages. When the model asked the page for data, <code>message.actionIds</code> lists those numbers and <code>body</code> does not contain <code>%%</code>. The SDK does not run the page handlers. That stays in the React bubble.</p>
      </section>
    </DocPage>
  );
}

function ServerDocs() {
  return (
    <DocPage title="Run the server" lede="Node 22 or newer. Conversations live in a SQLite file. This dashboard is served by the same process.">
      <section className="panel">
        <h3>Local</h3>
        <pre className="doc">{`corepack enable
pnpm install
pnpm --filter @open-support/dashboard build
pnpm dev:server`}</pre>
        <p>The desk is at <code>http://localhost:8787</code>. <code>pnpm start:server</code> runs the built binary. If the dashboard says it is not built, run the dashboard build and refresh.</p>
        <p><code>pnpm dev:dashboard</code> opens the UI at <code>http://localhost:5174</code> and proxies <code>/api</code> to port 8787. Use that while changing these docs.</p>
      </section>
      <section className="panel">
        <h3>Environment</h3>
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>PORT</code></td><td><code>8787</code></td><td>Listen port</td></tr>
            <tr><td><code>HOST</code></td><td><code>0.0.0.0</code></td><td>Listen host</td></tr>
            <tr><td><code>DATABASE_PATH</code></td><td><code>./data/support.db</code></td><td>SQLite file</td></tr>
            <tr><td><code>UPLOAD_DIR</code></td><td><code>./data/uploads</code></td><td>Attachments, logos, and profile pictures</td></tr>
            <tr><td><code>CORS_ORIGIN</code></td><td><code>*</code></td><td>Sites allowed to embed the bubble, until Access is saved</td></tr>
            <tr><td><code>ADMIN_KEY</code></td><td>generated once</td><td>Recovery sign-in. Set it so it stays the same</td></tr>
            <tr><td><code>WIDGET_TITLE</code></td><td><code>Support</code></td><td>Bubble title, until Settings is saved</td></tr>
            <tr><td><code>WIDGET_ACCENT</code></td><td><code>#111827</code></td><td>Bubble accent until a theme is saved</td></tr>
            <tr><td><code>WIDGET_GREETING</code></td><td><code>Hi! How can we help?</code></td><td>First line of a new chat</td></tr>
          </tbody>
        </table>
        <p className="muted">Values saved in Settings replace <code>WIDGET_*</code> and <code>CORS_ORIGIN</code>. The OpenAI key is saved in the dashboard and is not an environment variable.</p>
      </section>
      <section className="panel">
        <h3>Railway</h3>
        <p>One service runs the API and the dashboard. Add a volume mounted at <code>/data</code>, then set <code>DATABASE_PATH=/data/support.db</code>, <code>UPLOAD_DIR=/data/uploads</code>, <code>ADMIN_KEY</code>, and <code>CORS_ORIGIN</code> to the sites that embed the bubble. Health check path: <code>/health</code>.</p>
        <p>Without the volume, conversations, uploads, and sessions disappear on the next deploy. Without <code>ADMIN_KEY</code>, the recovery key changes on every restart.</p>
      </section>
    </DocPage>
  );
}
