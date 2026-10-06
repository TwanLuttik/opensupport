export function Docs() {
  return (
    <div className="docs">
      <div className="page-intro">
        <p className="kicker">Guide</p>
        <h1>Docs</h1>
        <p className="muted">How to run the desk, and how to put the bubble or the API SDK in another app.</p>
      </div>
      <div className="docs-nav">
        <a className="btn btn-outline btn-sm" href="#docs-desk">Using the desk</a>
        <a className="btn btn-outline btn-sm" href="#docs-bubble">Add the bubble</a>
        <a className="btn btn-outline btn-sm" href="#docs-next">Next.js</a>
        <a className="btn btn-outline btn-sm" href="#docs-sdk">API SDK</a>
        <a className="btn btn-outline btn-sm" href="#docs-server">Run the server</a>
      </div>

      <section className="panel" id="docs-desk">
        <h2>Using the desk</h2>
        <p>Sign in, then work from the header. The first account is an admin. Admins add other people under Settings, then Accounts.</p>
        <ul>
          <li><strong>Inbox</strong> has two lists. Live chat is open conversations. Messages are emails left while the desk was closed.</li>
          <li><strong>Assign to me</strong> puts your name and profile picture on the ticket. The visitor sees both in the bubble.</li>
          <li>Reply from the composer. Your account name is what the visitor sees, not the word You.</li>
          <li>Click an image to view it full screen. Code files open in a reader. Other files have a download button.</li>
          <li><strong>Hours</strong> limits live chat to a weekly schedule in a timezone. Outside those hours the visitor leaves an email instead.</li>
          <li><strong>Settings</strong> changes the bubble: title, color, logo, greeting, start-screen topics, the pre-chat form, the AI agent, embed origins, webhooks, Telegram, and API tokens.</li>
          <li><strong>AI models</strong> saves an OpenAI key and picks the model. <strong>AI agent</strong> is the knowledge that model answers from. The bubble then offers a chat with the AI instead of a person.</li>
          <li><strong>AI usage</strong> counts the chats, questions, and answers, and estimates what they cost.</li>
          <li><strong>Reviews</strong> is the thumbs-up share after a chat ends. Skipped ratings do not count. Only admins see it.</li>
          <li>Click your name to change your picture, display name, or password.</li>
        </ul>
      </section>

      <section className="panel" id="docs-bubble">
        <h2>Add the bubble</h2>
        <p>The React package is not on npm yet. Build it here, then link the folder into the app that should show the chat.</p>
        <pre className="doc">{`# in this repo
pnpm --filter @open-support/react build

# in the other app. Quote the path when it contains a space.
pnpm add /absolute/path/to/open-support-bubble/packages/react`}</pre>
        <p>Render it once, near the root of the app. The stylesheet is required.</p>
        <pre className="doc">{`import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App() {
  return (
    <>
      <SupportBubble
        serverUrl="http://localhost:8787"
        identifier="user_42"
        visitor={{ name: "Ada Lovelace", email: "ada@example.com", metadata: { plan: "pro" } }}
      />
    </>
  );
}`}</pre>
        <table>
          <thead><tr><th>Prop</th><th>Default</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>serverUrl</code></td><td>required</td><td>Origin of this server, with no path</td></tr>
            <tr><td><code>identifier</code></td><td>—</td><td>Stable id for this person. Conversations that share it are grouped</td></tr>
            <tr><td><code>visitor</code></td><td>—</td><td>Name, email, and string metadata stored when the chat starts</td></tr>
            <tr><td><code>pollIntervalMs</code></td><td><code>3000</code></td><td>How often an open panel checks for replies</td></tr>
            <tr><td><code>onOpenChange</code></td><td>—</td><td>Called when the panel opens or closes</td></tr>
          </tbody>
        </table>
        <p>Opening the bubble does not start a chat. Topics, the pre-chat form, the logo, and the hours all come from Settings. Visitors can attach a file, drop one onto the open panel, or screenshot the page they are on. The chat itself is left out of that picture.</p>
        <p>Set the allowed origins in Settings, then Access, to the site that embeds the bubble. <code>http://localhost:5173</code> and <code>http://127.0.0.1:5173</code> are different origins. The bubble never receives an API token. Rebuild the package after changing it, then restart the host app.</p>
      </section>

      <section className="panel" id="docs-next">
        <h2>Next.js</h2>
        <p>Next 13 or newer. <code>OpenSupport</code> is a Client Component, so a Server Component layout can render it. It reads <code>NEXT_PUBLIC_SUPPORT_URL</code> when you omit <code>serverUrl</code>.</p>
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
        <p>If Next reports that it cannot resolve <code>@open-support/react/next</code>, the package lives outside the app's lockfile. Set Turbopack's root to a folder that contains both projects, then restart the dev server. Config changes are not hot-reloaded.</p>
        <pre className="doc">{`// next.config.ts
import path from "node:path";

const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};`}</pre>
      </section>

      <section className="panel" id="docs-sdk">
        <h2>API SDK</h2>
        <p><code>@open-support/sdk</code> is for your own tools. It uses an API token from Settings, then Notifications. Do not put that token in the browser.</p>
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
        <table>
          <thead><tr><th>Method</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>listConversations</code></td><td>Newest activity first. Filter with <code>status</code> or <code>identifier</code></td></tr>
            <tr><td><code>listMessages</code></td><td>Oldest first. Pass <code>after</code> to poll, or <code>cursor</code> to page</td></tr>
            <tr><td><code>getVisitor</code></td><td>The person behind an identifier, plus every conversation they started</td></tr>
            <tr><td><code>assignConversation</code></td><td>Claims the ticket and posts "&lt;name&gt; joined the conversation"</td></tr>
            <tr><td><code>sendMessage</code></td><td>Posts an agent reply. <code>agentName</code> is the name shown in the bubble. <code>attachmentIds</code> attaches uploaded files</td></tr>
            <tr><td><code>uploadFile</code></td><td>Sends a file in 5 MB chunks, up to 50 MB, and returns an attachment id</td></tr>
            <tr><td><code>closeConversation</code></td><td>Ends the ticket. The visitor can no longer write in it</td></tr>
          </tbody>
        </table>
        <p><code>nextCursor</code> is <code>null</code> on the last page. Pass it back as <code>cursor</code>. A failed request throws <code>OpenSupportError</code> with the HTTP status.</p>
      </section>

      <section className="panel" id="docs-server">
        <h2>Run the server</h2>
        <p>Node 22 or newer. Conversations live in a SQLite file. This dashboard is served by the same process.</p>
        <pre className="doc">{`corepack enable
pnpm install
pnpm --filter @open-support/dashboard build
pnpm dev:server`}</pre>
        <p>The desk is at <code>http://localhost:8787</code>. <code>pnpm start:server</code> runs the built binary. If the dashboard says it is not built, run the dashboard build and refresh.</p>
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
            <tr><td><code>WIDGET_ACCENT</code></td><td><code>#111827</code></td><td>Bubble color</td></tr>
            <tr><td><code>WIDGET_GREETING</code></td><td><code>Hi! How can we help?</code></td><td>First line of a new chat</td></tr>
          </tbody>
        </table>
        <p className="muted">Values saved in Settings replace <code>WIDGET_*</code> and <code>CORS_ORIGIN</code>.</p>
      </section>
    </div>
  );
}
