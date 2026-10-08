const GITHUB = "https://github.com/TwanLuttik/opensupport";

const features = [
  {
    kicker: "01",
    title: "A bubble on your site.",
    body: "SupportBubble sits fixed at the bottom-left. The visitor starts a thread, keeps it across refreshes, and sees replies, read receipts, and typing over a live connection.",
  },
  {
    kicker: "02",
    title: "A desk for the people who answer.",
    body: "The same process serves an inbox. Queues for what needs a person, what the model is handling, what is open, and what is done. Assign a thread and the visitor sees who joined.",
  },
  {
    kicker: "03",
    title: "Your server. Your disk.",
    body: "Node 22, one SQLite file, attachments on disk. No account with us. Put a volume at /data on Railway, or run it anywhere else Node runs.",
  },
  {
    kicker: "04",
    title: "An agent that can ask the page.",
    body: "Optional OpenAI replies, with knowledge you write. When a reply needs a fact from the visitor's app, the model asks for an action id. Your page shows the button and sends the answer.",
  },
  {
    kicker: "05",
    title: "Hooks for the rest of the stack.",
    body: "Mint an API token and use the SDK, or receive signed webhooks. A Telegram bot can post new messages, and a reply that still quotes the conversation id goes back to the visitor.",
  },
  {
    kicker: "06",
    title: "The widget matches the site.",
    body: "Ink, Paper, Forest, Ocean, Dusk, or your own colors. Title, greeting, topics, a pre-chat form, office hours, and a logo all come from the desk. The bubble reads them live.",
  },
];

const themes = [
  { id: "Ink", accent: "#111827", canvas: "#f4f5f7" },
  { id: "Paper", accent: "#9a3412", canvas: "#f6efe4" },
  { id: "Forest", accent: "#14532d", canvas: "#e7f0e4" },
  { id: "Ocean", accent: "#1d4ed8", canvas: "#eef3fb" },
  { id: "Dusk", accent: "#a78bfa", canvas: "#16141f" },
];

export function App() {
  return (
    <div className="page">
      <header className="bar">
        <a className="brand" href="#top">
          <Mark />
          <span>Open Support</span>
        </a>
        <nav className="nav" aria-label="Page">
          <a href="#product">Product</a>
          <a href="#desk">Desk</a>
          <a href="#host">Host</a>
          <a href={GITHUB}>Source</a>
        </nav>
        <a className="btn btn-primary bar-cta" href={GITHUB}>
          Read the source
        </a>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="kicker">opensupport.dev</p>
            <h1>Support chat you run yourself.</h1>
            <p className="lede">
              A small Node server, a React bubble on the bottom-left of your site, and a desk for
              the people who reply. Conversations stay in a SQLite file on your disk.
            </p>
            <div className="actions">
              <a className="btn btn-primary" href={GITHUB}>
                View on GitHub
              </a>
              <a className="btn" href="#host">
                How to run it
              </a>
            </div>
            <p className="fine">
              MIT license. Install <code>@open-support/react</code> and <code>@open-support/sdk</code> from
              npm. The server stays on your own machine.
            </p>
          </div>
          <BubbleStage />
        </section>

        <section className="strip" aria-label="What ships">
          <p>Node 22</p>
          <p>SQLite</p>
          <p>React 18 and 19</p>
          <p>One process</p>
          <p>MIT</p>
        </section>

        <section id="product" className="section">
          <div className="section-head">
            <p className="kicker">The product</p>
            <h2>Everything the visitor and the agent actually get.</h2>
          </div>
          <ol className="features">
            {features.map((feature) => (
              <li key={feature.kicker}>
                <p className="kicker">{feature.kicker}</p>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="desk" className="section desk-section">
          <div className="section-head">
            <p className="kicker">The desk</p>
            <h2>An inbox, not another dashboard template.</h2>
            <p className="section-lede">
              Agents work a queue. Admins set the widget, the hours, the origins allowed to embed
              it, and the tokens other apps use to reply.
            </p>
          </div>
          <DeskFrame />
          <ul className="notes">
            <li>Needs you, AI, Open, and Done. Assign a thread and your name shows in the bubble.</li>
            <li>Office hours by weekday and timezone. Outside them, the visitor can leave an email.</li>
            <li>Thumbs after a chat, with an optional note. Statistics skip AI-only threads.</li>
            <li>Files up to 50 MB, sent in 5 MB chunks. Images, video, audio, pdf, and zip.</li>
          </ul>
        </section>

        <section className="section themes">
          <div className="section-head">
            <p className="kicker">Appearance</p>
            <h2>Five themes, or paint your own.</h2>
          </div>
          <ul className="swatches">
            {themes.map((theme) => (
              <li key={theme.id}>
                <span className="swatch" style={{ background: theme.canvas, color: theme.accent }}>
                  <span className="swatch-bar" style={{ background: theme.accent }} />
                  <span className="swatch-dot" style={{ background: theme.accent }} />
                </span>
                <span className="swatch-name">{theme.id}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="host" className="section host">
          <div className="section-head">
            <p className="kicker">Run it</p>
            <h2>One service. A volume for the data.</h2>
          </div>
          <div className="host-grid">
            <div>
              <p>
                The server listens on port 8787 in development. It serves the desk, the API, and a
                health check. The React package is what you put in your own app.
              </p>
              <pre className="code">
                <code>{`pnpm install
pnpm --filter @open-support/dashboard build
pnpm dev:server`}</code>
              </pre>
              <p className="fine">
                On Railway, mount a volume at <code>/data</code> and set{" "}
                <code>DATABASE_PATH</code> and <code>UPLOAD_DIR</code> there. Set{" "}
                <code>ADMIN_KEY</code> so the recovery key does not change on restart.
              </p>
            </div>
            <div className="host-card">
              <p className="kicker">In your app</p>
              <pre className="code">
                <code>{`import { SupportBubble } from "@open-support/react";
import "@open-support/react/styles.css";

<SupportBubble
  serverUrl="https://support.example.com"
  identifier={user.id}
  visitor={{ name: user.name, email: user.email }}
/>`}</code>
              </pre>
              <p className="fine">
                Next.js apps import <code>OpenSupport</code> from{" "}
                <code>@open-support/react/next</code>. The bubble never sees an API token.
              </p>
            </div>
          </div>
        </section>

        <section className="section close">
          <p className="kicker">Open source</p>
          <h2>The code is the product.</h2>
          <p className="lede">
            Read it, run it, and change the parts that do not fit. The server, the bubble, and the
            SDK are MIT.
          </p>
          <a className="btn btn-primary" href={GITHUB}>
            github.com/TwanLuttik/opensupport
          </a>
        </section>
      </main>

      <footer className="foot">
        <p>Open Support</p>
        <p>Created by CoatCheck Technology, Inc.</p>
        <a href={GITHUB}>Source</a>
      </footer>
    </div>
  );
}

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function BubbleStage() {
  return (
    <div className="stage" aria-hidden="true">
      <div className="panel">
        <div className="panel-head">
          <span className="avatar">
            <ChatMark />
          </span>
          <span>
            <strong>Support</strong>
            <em>
              <i /> We're online
            </em>
          </span>
        </div>
        <div className="panel-body">
          <p className="system">Hi! How can we help?</p>
          <p className="visitor">The export button does nothing after I pick a date range.</p>
          <p className="agent">
            <span>Sam</span>
            Looking now. Which plan is the workspace on?
          </p>
        </div>
        <div className="panel-compose">
          <span>Write a message…</span>
          <span className="send">
            <Arrow />
          </span>
        </div>
      </div>
      <div className="launcher">
        <ChatMark />
      </div>
    </div>
  );
}

function ChatMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path
        d="M6 16.5 4.2 19.2c-.4.6.1 1.4.8 1.3L9 20.2A8 8 0 1 0 6 16.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DeskFrame() {
  return (
    <div className="desk" aria-hidden="true">
      <div className="desk-bar">
        <Mark />
        <span>Inbox</span>
        <span className="quiet">Online</span>
      </div>
      <div className="desk-body">
        <div className="queues">
          <p>Needs you</p>
          <div className="row current">
            <strong>Ada Lovelace</strong>
            <span>The export button does nothing</span>
          </div>
          <div className="row">
            <strong>Ken Thompson</strong>
            <span>Invoice for March</span>
          </div>
          <p>Open</p>
          <div className="row">
            <strong>Grace Hopper</strong>
            <span>Can we add a second admin?</span>
          </div>
        </div>
        <div className="thread">
          <div className="thread-bar">Ada Lovelace · waiting for an agent</div>
          <div className="thread-log">
            <p className="from-visitor">The export button does nothing after I pick a date range.</p>
            <p className="from-agent">Looking now. Which plan is the workspace on?</p>
          </div>
        </div>
      </div>
    </div>
  );
}
