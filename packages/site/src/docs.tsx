const GITHUB = "https://github.com/TwanLuttik/opensupport";

export type DocSection = {
  heading: string;
  paragraphs?: string[];
  code?: string;
  table?: { headers: string[]; rows: string[][] };
};

export type DocPage = {
  slug: string;
  title: string;
  kicker: string;
  lede: string;
  sections: DocSection[];
};

export const DOC_PAGES: DocPage[] = [
  {
    slug: "react",
    title: "React",
    kicker: "Embed",
    lede: "@open-support/react is the bubble visitors use. Render it once near the root so it stays mounted across route changes. It never receives an API token.",
    sections: [
      {
        heading: "Install",
        paragraphs: ["Requires React 18 or 19. react and react-dom are peer dependencies."],
        code: `npm install @open-support/react`,
      },
      {
        heading: "Add the bubble",
        paragraphs: [
          "serverUrl is the origin of your Open Support server, with no path. The stylesheet is required. Opening the bubble does not start a conversation. The visitor clicks Start a conversation first. End chat closes the thread. A refresh restores the same open thread from localStorage.",
        ],
        code: `import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

export function App() {
  return <SupportBubble serverUrl="https://support.example.com" />;
}`,
      },
      {
        heading: "Identify the visitor",
        paragraphs: [
          "Name, email, and string metadata are stored when the thread is created. Changing them later does not update an existing thread. identifier is your stable id for the signed-in person. Threads that share it are grouped in the desk. Leave it off for anonymous visitors. It groups threads. It does not continue the same thread.",
        ],
        code: `<SupportBubble
  serverUrl="https://support.example.com"
  identifier={user.id}
  visitor={{
    name: user.name,
    email: user.email,
    metadata: { plan: user.plan },
  }}
/>`,
      },
      {
        heading: "Where to put the URL",
        table: {
          headers: ["Tool", "Variable"],
          rows: [
            ["Vite", "import.meta.env.VITE_SUPPORT_URL"],
            ["Next.js", "process.env.NEXT_PUBLIC_SUPPORT_URL"],
            ["Create React App", "process.env.REACT_APP_SUPPORT_URL"],
          ],
        },
      },
      {
        heading: "Props",
        table: {
          headers: ["Prop", "Type", "Default", "Meaning"],
          rows: [
            ["serverUrl", "string", "required", "Server origin"],
            ["identifier", "string", "—", "Stable id. Conversations that share it are grouped"],
            ["visitor", "{ name?, email?, metadata? }", "—", "Sent only when the thread is created"],
            ["visitor.metadata", "Record<string, string>", "—", "Extra context, such as plan or page"],
            ["actions", "AiActionHandler[]", "—", "Buttons for AI replies that ask the page for data"],
            ["pollIntervalMs", "number", "3000", "Poll interval after the live connection gives up"],
            ["onOpenChange", "(open: boolean) => void", "—", "Fires when the panel opens or closes"],
            ["pages", "string[]", "—", "Allowlist. /docs matches that path. /app/* matches /app and everything under it. Omit to show everywhere"],
            ["className", "string", "—", "Added to the fixed root element"],
          ],
        },
      },
      {
        heading: "AI action buttons",
        paragraphs: [
          "Each client action in the desk has a number and a description the model sees. When a reply needs that fact, the model ends with %%[1,2]%%. The stored body omits the marker and includes actionIds. The button label and the handler live in your app. The handler's text is sent as the visitor's next message. A handler that returns an empty string sends nothing. Buttons show under the latest AI reply, and only for ids that reply asked for.",
        ],
        code: `<SupportBubble
  serverUrl="https://support.example.com"
  actions={[
    {
      id: 1,
      label: "Share my plan",
      handler: () => \`Plan: \${user.plan}, renews \${user.renewsAt}\`,
    },
  ]}
/>`,
      },
      {
        heading: "Next.js",
        paragraphs: [
          "Import OpenSupport from @open-support/react/next. It is a Client Component, so a Server Component layout can render it. It reads NEXT_PUBLIC_SUPPORT_URL when you omit serverUrl. Pass serverUrl to override it. The other props match SupportBubble. Pages Router works the same way. No dynamic import with ssr: false is required. next.config does not need transpilePackages.",
        ],
        code: `import { OpenSupport } from "@open-support/react/next";
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
}`,
      },
      {
        heading: "Vite",
        code: `import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <SupportBubble serverUrl={import.meta.env.VITE_SUPPORT_URL} />
  </StrictMode>,
);`,
      },
      {
        heading: "What the visitor sees",
        paragraphs: [
          "A round launcher, fixed 20px from the left and bottom. It shows your logo when one is set. Enter sends. Shift+Enter inserts a newline. Their messages sit on the right, agent replies on the left, and the greeting is a system line. A badge appears when an agent replies while the panel is closed.",
          "An open conversation keeps a websocket. If it drops, the bubble tries to reconnect three times, then polls at pollIntervalMs. Typing shows for 3 seconds after the last keystroke. The visitor's latest message says Read once an agent has opened the thread. Opening the panel marks agent replies as read.",
          "Title, subtitle, greeting, placeholder, and theme come from GET /api/widget/config. Themes are ink, paper, forest, ocean, dusk, or custom. Colors are CSS variables on .osb-root.",
        ],
      },
      {
        heading: "Session helpers",
        paragraphs: [
          "The visitor token is stored under open-support:<serverUrl>. Clearing site data starts a new conversation. Two serverUrl values do not share a session. A trailing slash is ignored.",
        ],
        code: `import { readSession, writeSession } from "@open-support/react";

const session = readSession(localStorage, "https://support.example.com");
// { conversationId: "cnv_…", visitorToken: "…" } or null`,
      },
      {
        heading: "Lower-level client",
        paragraphs: ["Use createClient when you want your own UI and only the HTTP calls."],
        code: `import { createClient, writeSession } from "@open-support/react";

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
);`,
        table: {
          headers: ["Method", "Purpose"],
          rows: [
            ["getConfig()", "Public title, colors, and copy"],
            ["start({ visitorName, visitorEmail, metadata })", "Create a conversation. Returns the visitor token once"],
            ["getThread(session, after?)", "Load the thread. after is the createdAt of the last message you have"],
            ["send(session, body)", "Post a visitor message"],
            ["askAi(session)", "Ask the model to answer. actionIds lists the page actions that reply requested"],
            ["upload(session, { name, type, bytes }, onProgress?)", "Upload in 5 MB chunks, up to 50 MB"],
          ],
        },
      },
      {
        heading: "Styling",
        paragraphs: [
          "Classes start with osb-. Override them after the imported stylesheet. className is appended to .osb-root. Theme colors are inline custom properties, so a background on .osb-launcher needs higher specificity. Useful classes: osb-launcher, osb-panel, osb-header, osb-messages, osb-message-visitor, osb-message-agent, osb-message-system, osb-composer, osb-badge.",
        ],
        code: `.osb-root { left: 24px; bottom: 24px; }
.osb-panel { width: 400px; }`,
      },
      {
        heading: "When something fails",
        paragraphs: [
          "Support is unavailable means the browser could not reach GET /api/widget/config. Check serverUrl, that the server is running, and CORS.",
          "Origin not allowed means CORS_ORIGIN does not include the page origin. Scheme, host, and port all count. http://localhost:5173 and http://127.0.0.1:5173 are different.",
          "A new conversation on every message means localStorage is blocked, or serverUrl changed.",
          "Next.js throws set NEXT_PUBLIC_SUPPORT_URL when OpenSupport has no serverUrl and the public env var is missing. Restart next dev after adding it. The name must start with NEXT_PUBLIC_.",
          "Missing styles in Next.js means the CSS import is not in app/layout.tsx or pages/_app.tsx.",
        ],
      },
    ],
  },
  {
    slug: "sdk",
    title: "SDK",
    kicker: "Agents",
    lede: "@open-support/sdk is the token client for tools that reply. It has no UI. Mint the token in the desk under API tokens. The plaintext osb_live_… value is shown once.",
    sections: [
      {
        heading: "Install",
        paragraphs: [
          "Requires Node 22 or newer. The client uses global fetch. serverUrl is the origin, with no path. The constructor strips a trailing slash. Pass fetch to replace the implementation in tests.",
        ],
        code: `npm install @open-support/sdk

import { OpenSupport } from "@open-support/sdk";

const support = new OpenSupport({
  serverUrl: "https://support.example.com",
  token: process.env.OPEN_SUPPORT_TOKEN!,
});`,
      },
      {
        heading: "Every method",
        paragraphs: [
          "These are the public methods on OpenSupport. Lists return { items, nextCursor }. nextCursor is null on the last page. Pass it back as cursor. The server caps limit at 100. Omit limit on listMessages to receive the whole thread.",
        ],
        table: {
          headers: ["Method", "Returns", "What it does"],
          rows: [
            [
              "listConversations({ status?, identifier?, limit?, cursor? })",
              "Page<Conversation>",
              'Newest activity first. status is "open" or "closed". identifier filters to one person.',
            ],
            [
              "listMessages(conversationId, { limit?, cursor?, after? })",
              "Page<Message>",
              "Oldest first. after is an ISO timestamp for polling.",
            ],
            [
              "getVisitor(identifier)",
              "VisitorProfile",
              "The person behind an identifier, including every conversation they started.",
            ],
            [
              "assignConversation(conversationId, { agentName? })",
              "Conversation",
              'Claims the ticket. The visitor sees "<name> joined the conversation".',
            ],
            [
              "uploadFile(conversationId, { name, type?, bytes })",
              "Attachment",
              "Uploads one file in 5 MB chunks, up to 50 MB. Empty files throw. Returns an attachment id.",
            ],
            [
              "sendMessage(conversationId, { body, agentName?, attachmentIds? })",
              "Message",
              "Posts an agent reply. Pass attachment ids from uploadFile.",
            ],
            [
              "closeConversation(conversationId)",
              "Conversation",
              "Closes the ticket. The visitor can no longer write in it.",
            ],
          ],
        },
      },
      {
        heading: "Walkthrough",
        code: `const open = await support.listConversations({ status: "open", limit: 20 });
const thread = await support.listMessages(open.items[0].id, { limit: 50 });
const person = await support.getVisitor(open.items[0].identifier ?? "");

await support.assignConversation(open.items[0].id, { agentName: "Sam" });

const file = await support.uploadFile(open.items[0].id, {
  name: "notes.txt",
  type: "text/plain",
  bytes: new TextEncoder().encode("Checked the logs"),
});

await support.sendMessage(open.items[0].id, {
  body: "Looking into this now",
  agentName: "Sam",
  attachmentIds: [file.id],
});

await support.closeConversation(open.items[0].id);`,
      },
      {
        heading: "Paging",
        code: `let cursor: string | null = null;
do {
  const page = await support.listConversations({ status: "open", limit: 50, cursor: cursor ?? undefined });
  cursor = page.nextCursor;
} while (cursor);`,
      },
      {
        heading: "Errors",
        paragraphs: [
          "Failed requests throw OpenSupportError. It has status and the server's error message. uploadFile throws status 400 when the file is empty and status 413 when it is larger than 50 MB, before any bytes are sent.",
        ],
        code: `import { OpenSupport, OpenSupportError } from "@open-support/sdk";

try {
  await support.sendMessage(id, { body: "Looking now" });
} catch (error) {
  if (error instanceof OpenSupportError) {
    console.error(error.status, error.message);
  }
}`,
      },
      {
        heading: "Exports",
        paragraphs: ["The package exports the class, the error, and these types."],
        table: {
          headers: ["Export", "Kind"],
          rows: [
            ["OpenSupport", "class"],
            ["OpenSupportError", "class"],
            ["OpenSupportOptions", "type. serverUrl, token, optional fetch"],
            ["ListConversationsOptions", "type"],
            ["ListMessagesOptions", "type"],
            ["AssignConversationInput", "type"],
            ["SendMessageInput", "type"],
            ["UploadFileInput", "type"],
            ["Conversation", "type"],
            ["ConversationStatus", "type"],
            ["Message", "type"],
            ["AuthorRole", "type"],
            ["Attachment", "type"],
            ["VisitorProfile", "type"],
            ["Page", "type. { items, nextCursor }"],
          ],
        },
      },
      {
        heading: "AI replies",
        paragraphs: [
          "AI replies are normal agent messages. When the model asked the page for data, actionIds lists the action numbers from the desk, and body does not include the %%[1,2]%% marker. This package does not run those page handlers. The React bubble does, from its actions prop.",
        ],
      },
    ],
  },
  {
    slug: "self-host",
    title: "Self-host",
    kicker: "Server",
    lede: "One Node process serves the desk and the API. The React bubble and the SDK stay in your own apps. Conversations live in a SQLite file on a disk you keep.",
    sections: [
      {
        heading: "Requirements",
        paragraphs: [
          "Node 22 or newer. The server uses the built-in node:sqlite module. This repository uses pnpm. Enable it once with corepack enable.",
        ],
        code: `pnpm install
pnpm --filter @open-support/dashboard build
pnpm dev:server`,
      },
      {
        heading: "What you get",
        paragraphs: [
          "pnpm dev:server listens on http://localhost:8787. That process serves the desk, the API, the visitor websocket, and the health check. The public website is separate and is not started with the server. While editing the inbox, pnpm dev:dashboard runs at http://localhost:5174 and proxies /api to port 8787.",
        ],
        table: {
          headers: ["Method", "Path", "What it is"],
          rows: [
            ["GET", "/", "Dashboard"],
            ["GET", "/inbox and /dashboard", "Same dashboard"],
            ["GET", "/health", "Liveness"],
            ["GET", "/widget.js", "Launcher for pages that are not React"],
          ],
        },
      },
      {
        heading: "Environment",
        table: {
          headers: ["Variable", "Default", "Purpose"],
          rows: [
            ["PORT", "8787", "Listen port. Railway sets this"],
            ["HOST", "0.0.0.0", "Listen host"],
            ["DATABASE_PATH", "./data/support.db", "SQLite file"],
            ["UPLOAD_DIR", "./data/uploads", "Attachments, 5 MB chunks, 50 MB max"],
            ["CORS_ORIGIN", "*", "Embed origins, or a comma-separated list"],
            ["ADMIN_KEY", "printed once", "Recovery key. Set it so it stays stable"],
            ["WIDGET_TITLE", "Support", "Bubble title until the desk saves appearance"],
            ["WIDGET_SUBTITLE", "reply-time line", "Header subtitle"],
            ["WIDGET_ACCENT", "#111827", "Ink accent until a theme is saved"],
            ["WIDGET_GREETING", "Hi! How can we help?", "First system message"],
            ["WIDGET_PLACEHOLDER", "Write a message…", "Composer placeholder"],
            ["COOKIE_SECURE", "from the request", "1 forces Secure. 0 leaves it off"],
          ],
        },
      },
      {
        heading: "First sign-in",
        paragraphs: [
          "Open the server origin. The first visit creates an admin account with an email and password. That admin adds more accounts from Accounts. Agents use the inbox. Admins also change settings and mint API tokens.",
          "Without ADMIN_KEY, a one-time recovery key is printed. The key still signs in after accounts exist. The session is an HttpOnly cookie for 14 days, marked Secure when the request arrived over HTTPS. Railway is detected from X-Forwarded-Proto.",
        ],
      },
      {
        heading: "Railway",
        paragraphs: [
          "One service runs the API and the dashboard. Railpack reads railpack.json, compiles the dashboard and then the server, and starts node packages/server/dist/cli.js. The widget and the SDK are not in that image. Node 22 comes from engines and nixpacks.toml.",
          "The container disk is wiped on every deploy. Mount a volume at /data. Without it, conversations, uploads, and sessions disappear. Health check path: /health.",
        ],
        table: {
          headers: ["Variable", "Value"],
          rows: [
            ["DATABASE_PATH", "/data/support.db"],
            ["UPLOAD_DIR", "/data/uploads"],
            ["ADMIN_KEY", "a long random secret you keep"],
            ["CORS_ORIGIN", "sites that embed the bubble, comma-separated"],
          ],
        },
      },
      {
        heading: "Anywhere else Node runs",
        paragraphs: [
          "Build the dashboard, build the server, and start the CLI. Keep DATABASE_PATH and UPLOAD_DIR on a persistent disk. Put a reverse proxy in front if you want TLS. Set COOKIE_SECURE=1 if the proxy terminates HTTPS but does not forward X-Forwarded-Proto.",
        ],
        code: `pnpm --filter @open-support/dashboard build
pnpm --filter @open-support/server build
node packages/server/dist/cli.js`,
      },
      {
        heading: "The desk",
        paragraphs: [
          "Inbox lists every conversation. Assign a thread and the visitor sees who joined. Queues cover what needs a person, what the model is handling, what is open, and what is done.",
          "Appearance edits title, subtitle, placeholder, greeting, waiting message, and theme. Templates are Ink, Paper, Forest, Ocean, and Dusk, or your own colors. Saved appearance overrides WIDGET_*.",
          "Access sets the browser origins allowed to embed the widget and overrides CORS_ORIGIN. The dashboard origin stays allowed.",
          "Pre-chat form fields are text, email, long text, or a dropdown. A field id of name or email sets the visitor name or email. Office hours are per weekday and timezone. Outside them, the visitor can leave an email.",
          "Webhooks POST JSON for conversation.created and message.created. Verify X-Open-Support-Signature: sha256=<hmac of the raw body>. The signing secret is shown once.",
          "Telegram posts those events to a bot chat. Reply to the notification and the text goes back to the visitor, as long as the message still contains the cnv_… id.",
          "AI models stores an OpenAI key on the server. AI agent adds knowledge and client actions. When a reply needs a page fact, the model ends with %%[1,2]%% and the bubble shows the matching buttons.",
          "API tokens are for the SDK. The plaintext token is shown once. Only a hash is stored.",
        ],
      },
      {
        heading: "Point the bubble at it",
        paragraphs: [
          "Install @open-support/react in the visitor app and set serverUrl to this server. Allow that site's origin in Access. The widget never sees an API token.",
        ],
      },
    ],
  },
];

export function docPath(slug: string) {
  return `#/docs/${slug}`;
}

export function currentDocSlug() {
  const hash = window.location.hash.replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] !== "docs") return null;
  const slug = parts[1] ?? "react";
  return DOC_PAGES.some((page) => page.slug === slug) ? slug : "react";
}

export function Docs({ slug }: { slug: string }) {
  const page = DOC_PAGES.find((item) => item.slug === slug) ?? DOC_PAGES[0];

  return (
    <div className="page">
      <header className="bar">
        <a className="brand" href="#top">
          <span className="mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>Open Support</span>
        </a>
        <nav className="nav" aria-label="Page">
          <a href="#/docs/react">Docs</a>
          <a href={GITHUB}>Source</a>
        </nav>
      </header>
      <div className="docs">
        <aside className="docs-nav" aria-label="Documentation">
          <p className="kicker">Developers</p>
          <ol>
            {DOC_PAGES.map((item) => (
              <li key={item.slug}>
                <a href={docPath(item.slug)} aria-current={item.slug === page.slug ? "page" : undefined}>
                  {item.title}
                </a>
              </li>
            ))}
          </ol>
          <a className="docs-source" href={GITHUB}>
            Source
          </a>
        </aside>
        <article className="docs-article">
          <p className="kicker">{page.kicker}</p>
          <h1>{page.title}</h1>
          <p className="lede">{page.lede}</p>
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.code ? (
                <pre className="code">
                  <code>{section.code}</code>
                </pre>
              ) : null}
              {section.table ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {section.table.headers.map((header) => (
                          <th key={header}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell) => (
                            <td key={cell}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
