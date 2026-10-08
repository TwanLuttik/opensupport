import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setOpenAiCompleter } from "./ai.js";
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  return address.port;
}

function openSocket(base: string, path: string, headers: { cookie?: string } = {}) {
  const events: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];
  let failed = false;
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}${path}`, { headers });
  const opened = new Promise<boolean>((resolve) => {
    socket.addEventListener("open", () => resolve(true));
    socket.addEventListener("error", () => {
      failed = true;
    });
    socket.addEventListener("close", () => resolve(false));
  });
  socket.addEventListener("message", (message) => {
    const parsed = JSON.parse(String(message.data)) as unknown;
    events.push(parsed);
    for (const waiter of [...waiters]) waiter();
  });
  return {
    opened: opened.then((open) => {
      if (!open) throw new Error("refused");
    }),
    get refused() {
      return opened.then((open) => !open || failed);
    },
    next: (match: (event: { type?: string; typing?: boolean; message?: { body?: string } }) => boolean) =>
      new Promise((resolve) => {
        const watch = () => {
          const index = events.findIndex((event) => match(event as { type?: string; typing?: boolean; message?: { body?: string } }));
          if (index < 0) return;
          const at = waiters.indexOf(watch);
          if (at >= 0) waiters.splice(at, 1);
          resolve(events.splice(index, 1)[0]);
        };
        waiters.push(watch);
        watch();
      }),
    events,
    send: (payload: unknown) => socket.send(JSON.stringify(payload)),
    close: () => socket.close(),
  };
}

async function start() {
  const dir = mkdtempSync(join(tmpdir(), "osb-http-"));
  process.env.OPEN_SUPPORT_DASHBOARD = "0";
  const app = createApp(
    loadConfig({
      databasePath: join(dir, "support.db"),
      uploadDir: join(dir, "uploads"),
      adminKey: "admin-test-key",
      corsOrigin: "https://shop.example",
      host: "127.0.0.1",
      port: 0,
    }),
  );
  const port = await listen(app.server);
  const base = `http://127.0.0.1:${port}`;
  return { app, base };
}

test("a live socket delivers an agent reply to the visitor and a visitor message to the desk", async () => {
  const { app, base } = await start();
  try {
    const login = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: "admin-test-key" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const started = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Ada" }),
    });
    const session = (await started.json()) as { conversation: { id: string }; visitorToken: string };
    const visitor = openSocket(
      base,
      `/api/widget/live?conversation=${session.conversation.id}&token=${encodeURIComponent(session.visitorToken)}`,
    );
    const desk = openSocket(base, "/api/dashboard/live", { cookie });
    await visitor.opened;
    await desk.opened;

    await fetch(`${base}/api/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ body: "Looking now", agentName: "Sam" }),
    });
    const pushed = (await visitor.next((event) => event.message?.body === "Looking now")) as { type: string; message: { body: string } };
    assert.equal(pushed.type, "message");
    assert.equal(pushed.message.body, "Looking now");

    await fetch(`${base}/api/widget/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ body: "Thanks" }),
    });
    const seen = (await desk.next((event) => event.message?.body === "Thanks")) as { type: string; message: { body: string } };
    assert.equal(seen.type, "message");
    assert.equal(seen.message.body, "Thanks");

    visitor.send({ type: "typing", typing: true });
    const typing = (await desk.next((event) => event.type === "typing" && event.typing === true)) as { role: string; typing: boolean };
    assert.equal(typing.role, "visitor");
    assert.equal(typing.typing, true);
    const echoed = visitor.events.some((event) => (event as { type?: string }).type === "typing");
    assert.equal(echoed, false);

    const read = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/read`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: "{}",
    });
    assert.equal(read.status, 200);
    const receipt = (await desk.next((event) => event.type === "read")) as { role: string; readAt: string };
    assert.equal(receipt.role, "visitor");
    assert.ok(receipt.readAt);
    const thread = await fetch(`${base}/api/conversations/${session.conversation.id}`, { headers: { cookie } });
    const stored = (await thread.json()) as { conversation: { messages: Array<{ body: string; readAt?: string }> } };
    assert.equal(stored.conversation.messages.find((message) => message.body === "Looking now")?.readAt, receipt.readAt);

    visitor.close();
    desk.close();
  } finally {
    await app.close();
  }
});

test("widget flow and token API", async () => {
  const { app, base } = await start();
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const blocked = await fetch(`${base}/api/widget/config`, { headers: { origin: "https://evil.example" } });
    assert.equal(blocked.status, 403);

    const started = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://shop.example" },
      body: JSON.stringify({ visitorName: "Ada", visitorEmail: "ada@example.com" }),
    });
    assert.equal(started.status, 201);
    assert.equal(started.headers.get("access-control-allow-origin"), "https://shop.example");
    const session = (await started.json()) as {
      conversation: { id: string };
      visitorToken: string;
      messages: Array<{ body: string; role: string }>;
    };
    assert.equal(session.messages[0]?.role, "system");

    const posted = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-visitor-token": session.visitorToken,
      },
      body: JSON.stringify({ body: "The checkout button is broken" }),
    });
    assert.equal(posted.status, 201);

    const stranger = await fetch(`${base}/api/widget/conversations/${session.conversation.id}`, {
      headers: { "x-visitor-token": "nope" },
    });
    assert.equal(stranger.status, 401);

    const missingToken = await fetch(`${base}/api/conversations`);
    assert.equal(missingToken.status, 401);

    const minted = await fetch(`${base}/api/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer admin-test-key" },
      body: JSON.stringify({ name: "Helpdesk" }),
    });
    assert.equal(minted.status, 201);
    const token = ((await minted.json()) as { token: string }).token;
    assert.match(token, /^osb_live_tok_/);

    const list = await fetch(`${base}/api/conversations?status=open`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    const page = (await list.json()) as { conversations: Array<{ id: string; unreadForAgent: number }> };
    assert.equal(page.conversations.length, 1);
    assert.equal(page.conversations[0]?.unreadForAgent, 1);

    const reply = await fetch(`${base}/api/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: "Looking now", agentName: "Sam" }),
    });
    assert.equal(reply.status, 201);

    const polled = await fetch(`${base}/api/widget/conversations/${session.conversation.id}`, {
      headers: { "x-visitor-token": session.visitorToken },
    });
    const thread = (await polled.json()) as {
      conversation: { assigneeName: string | null };
      messages: Array<{ body: string }>;
    };
    assert.equal(thread.conversation.assigneeName, null);
    assert.deepEqual(
      thread.messages.map((message) => message.body),
      ["Hi! How can we help?", "Waiting for an agent", "The checkout button is broken", "Looking now"],
    );

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const deniedUpload = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/uploads`, { method: "POST" });
    assert.equal(deniedUpload.status, 401);
    const tooBig = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/uploads`, {
      method: "POST",
      headers: {
        "x-visitor-token": session.visitorToken,
        "x-filename": "big.png",
        "x-file-type": "image/png",
        "x-file-size": String(50 * 1024 * 1024 + 1),
      },
    });
    assert.equal(tooBig.status, 413);

    const preflight = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/uploads`, {
      method: "OPTIONS",
      headers: { origin: "https://shop.example", "access-control-request-method": "PUT" },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /\bPUT\b/);

    const begun = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/uploads`, {
      method: "POST",
      headers: {
        "x-visitor-token": session.visitorToken,
        "x-filename": "pixel.png",
        "x-file-type": "image/png",
        "x-file-size": String(png.length),
      },
    });
    assert.equal(begun.status, 201);
    const upload = (await begun.json()) as { uploadId: string; chunkCount: number };
    assert.equal(upload.chunkCount, 1);
    const chunk = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/uploads`, {
      method: "PUT",
      headers: {
        "x-visitor-token": session.visitorToken,
        "content-type": "application/octet-stream",
        "x-upload-id": upload.uploadId,
        "x-chunk-index": "0",
      },
      body: png,
    });
    assert.equal(chunk.status, 200);
    const finished = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/uploads`, {
      method: "POST",
      headers: { "x-visitor-token": session.visitorToken, "x-upload-id": upload.uploadId },
    });
    assert.equal(finished.status, 201);
    const attachment = ((await finished.json()) as { attachment: { id: string; url: string } }).attachment;
    const withFile = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ body: "A screenshot", attachmentIds: [attachment.id] }),
    });
    assert.equal(withFile.status, 201);
    const saved = (await withFile.json()) as { message: { attachments: Array<{ url: string }> } };
    assert.equal(saved.message.attachments[0]?.url, attachment.url);
    const downloaded = await fetch(`${base}${attachment.url}`);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get("content-type"), "image/png");
    assert.equal(Buffer.from(await downloaded.arrayBuffer()).equals(png), true);

    const closed = await fetch(`${base}/api/conversations/${session.conversation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "closed" }),
    });
    assert.equal(closed.status, 200);

    const visitorClose = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Grace" }),
    });
    const visitorSession = (await visitorClose.json()) as { conversation: { id: string }; visitorToken: string };
    const ended = await fetch(`${base}/api/widget/conversations/${visitorSession.conversation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-visitor-token": visitorSession.visitorToken },
      body: JSON.stringify({ status: "closed" }),
    });
    assert.equal(ended.status, 200);
    assert.equal(((await ended.json()) as { conversation: { status: string } }).conversation.status, "closed");

    const tooSoon = await fetch(`${base}/api/widget/conversations/${visitorSession.conversation.id}/rating`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ rating: "up" }),
    });
    assert.equal(tooSoon.status, 401);
    const rated = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/rating`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ rating: "up", comment: "Quick and clear" }),
    });
    assert.equal(rated.status, 200);
    assert.equal(((await rated.json()) as { conversation: { rating: string } }).conversation.rating, "up");
    const twice = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/rating`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ rating: "down" }),
    });
    assert.equal(twice.status, 409);
    const skipped = await fetch(`${base}/api/widget/conversations/${visitorSession.conversation.id}/rating`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": visitorSession.visitorToken },
      body: JSON.stringify({ rating: "skipped" }),
    });
    assert.equal(skipped.status, 200);
    const scores = await fetch(`${base}/api/dashboard/reviews`, { headers: { authorization: "Bearer admin-test-key" } });
    assert.equal(scores.status, 200);
    const summary = ((await scores.json()) as { reviews: { up: number; skipped: number; score: number; reviews: Array<{ comment: string }> } }).reviews;
    assert.equal(summary.up, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.score, 1);
    assert.equal(summary.reviews[0]?.comment, "Quick and clear");

    const afterClose = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-visitor-token": session.visitorToken,
      },
      body: JSON.stringify({ body: "One more thing" }),
    });
    assert.equal(afterClose.status, 400);

    const aiPage = await fetch(`${base}/ai`);
    assert.equal(aiPage.status, 200);
    assert.match(aiPage.headers.get("content-type") ?? "", /text\/html/);
    const inbox = await fetch(`${base}/inbox`);
    assert.equal(inbox.status, 200);
    assert.match(inbox.headers.get("content-type") ?? "", /text\/html/);
    const html = await inbox.text();
    assert.match(html, /Dashboard is not built/);
    assert.doesNotMatch(html, /<script type="module"/);
  } finally {
    delete process.env.OPEN_SUPPORT_DASHBOARD;
    await app.close();
  }
});

test("dashboard session configures widget, webhooks, and telegram", async () => {
  const { app, base } = await start();
  try {
    const denied = await fetch(`${base}/api/dashboard/settings`);
    assert.equal(denied.status, 401);

    const wrong = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: "not-the-key" }),
    });
    assert.equal(wrong.status, 401);

    const login = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: "  admin-test-key  " }),
    });
    assert.equal(login.status, 201);
    const setCookie = login.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0];
    assert.ok(cookie?.startsWith("osb_session="));
    assert.equal(setCookie.toLowerCase().includes("secure"), false);
    const secureLogin = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ adminKey: "admin-test-key" }),
    });
    assert.match(secureLogin.headers.get("set-cookie") ?? "", /;\s*Secure/i);

    const widget = await fetch(`${base}/api/dashboard/widget`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        title: "Help",
        subtitle: "We are here",
        accentColor: "#112233",
        placeholder: "Ask",
        greeting: "Welcome",
      }),
    });
    assert.equal(widget.status, 200);
    const pub = await fetch(`${base}/api/widget/config`);
    const published = (await pub.json()) as {
      title: string;
      accentColor: string;
      theme: { id: string; colors: { accent: string; panel: string } };
    };
    assert.equal(published.title, "Help");
    assert.equal(published.accentColor, "#112233");
    assert.equal(published.theme.id, "ink");
    assert.equal(published.theme.colors.accent, "#112233");
    assert.equal(published.theme.colors.panel, "#ffffff");

    const themed = await fetch(`${base}/api/dashboard/widget`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        title: "Help",
        subtitle: "We are here",
        accentColor: "#7c3aed",
        placeholder: "Ask",
        greeting: "Welcome",
        theme: {
          id: "custom",
          colors: {
            accent: "#7c3aed",
            accentText: "#ffffff",
            header: "#4c1d95",
            headerText: "#f5f3ff",
            panel: "#faf5ff",
            canvas: "#f3e8ff",
            ink: "#2e1065",
            muted: "#6b21a8",
            agentBubble: "#ffffff",
            composer: "#faf5ff",
          },
        },
      }),
    });
    assert.equal(themed.status, 200);
    const custom = (await (await fetch(`${base}/api/widget/config`)).json()) as {
      accentColor: string;
      theme: { id: string; colors: { header: string; canvas: string } };
    };
    assert.equal(custom.accentColor, "#7c3aed");
    assert.equal(custom.theme.id, "custom");
    assert.equal(custom.theme.colors.header, "#4c1d95");
    assert.equal(custom.theme.colors.canvas, "#f3e8ff");

    const template = await fetch(`${base}/api/dashboard/widget`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        title: "Help",
        subtitle: "We are here",
        accentColor: "#111827",
        placeholder: "Ask",
        greeting: "Welcome",
        theme: { id: "ocean" },
      }),
    });
    assert.equal(template.status, 200);
    const ocean = (await (await fetch(`${base}/api/widget/config`)).json()) as {
      accentColor: string;
      theme: { id: string; colors: { accent: string; header: string } };
    };
    assert.equal(ocean.theme.id, "ocean");
    assert.equal(ocean.accentColor, "#1d4ed8");
    assert.equal(ocean.theme.colors.accent, "#1d4ed8");
    assert.equal(ocean.theme.colors.header, "#1e3a8a");

    const access = await fetch(`${base}/api/dashboard/access`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie!, origin: "https://desk.example" },
      body: JSON.stringify({ corsOrigin: "https://shop.example, https://admin.example" }),
    });
    assert.equal(access.status, 200);
    const allowed = await fetch(`${base}/api/widget/config`, { headers: { origin: "https://admin.example" } });
    assert.equal(allowed.status, 200);
    const desk = await fetch(`${base}/api/dashboard/session`, {
      headers: { cookie: cookie!, origin: "https://desk.example" },
    });
    assert.equal(desk.status, 200);
    assert.equal(((await desk.json()) as { authenticated: boolean }).authenticated, true);
    const locked = await fetch(`${base}/api/widget/config`, { headers: { origin: "https://desk.example" } });
    assert.equal(locked.status, 403);
    const stillIn = await fetch(`${base}/api/dashboard/settings`, {
      headers: { cookie: cookie!, origin: "https://desk.example" },
    });
    assert.equal(stillIn.status, 200);

    const hook = await fetch(`${base}/api/dashboard/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ url: "https://hooks.example/support", events: ["message.created"] }),
    });
    assert.equal(hook.status, 201);
    const createdHook = (await hook.json()) as { secret: string; webhook: { id: string } };
    assert.ok(createdHook.secret);

    const telegram = await fetch(`${base}/api/dashboard/telegram`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ enabled: true, botToken: "123:abc", chatId: "42", notifyOn: ["message.created"] }),
    });
    assert.equal(telegram.status, 200);
    const view = await fetch(`${base}/api/dashboard/settings`, { headers: { cookie: cookie! } });
    const settings = (await view.json()) as { settings: { telegram: { hasBotToken: boolean; chatId: string }; webhooks: unknown[] } };
    assert.equal(settings.settings.telegram.hasBotToken, true);
    assert.equal(settings.settings.telegram.chatId, "42");
    assert.equal(settings.settings.webhooks.length, 1);

    const removed = await fetch(`${base}/api/dashboard/webhooks/${createdHook.webhook.id}`, {
      method: "DELETE",
      headers: { cookie: cookie! },
    });
    assert.equal(removed.status, 200);

    const listed = await fetch(`${base}/api/conversations`, { headers: { cookie: cookie! } });
    assert.equal(listed.status, 200);
  } finally {
    await app.close();
  }
});

test("accounts sign in and only an admin can create them", async () => {
  const { app, base } = await start();
  try {
    const session = await fetch(`${base}/api/dashboard/session`);
    assert.equal(((await session.json()) as { needsSetup: boolean }).needsSetup, true);

    const short = await fetch(`${base}/api/dashboard/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", name: "Ada", password: "short" }),
    });
    assert.equal(short.status, 400);

    const setup = await fetch(`${base}/api/dashboard/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", name: "Ada", password: "correct horse" }),
    });
    assert.equal(setup.status, 201);
    const adminCookie = setup.headers.get("set-cookie")?.split(";")[0];
    assert.ok(adminCookie);

    const again = await fetch(`${base}/api/dashboard/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", name: "Other", password: "correct horse" }),
    });
    assert.equal(again.status, 409);

    const agent = await fetch(`${base}/api/dashboard/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie! },
      body: JSON.stringify({ email: "sam@example.com", name: "Sam", password: "agent-password", role: "agent" }),
    });
    assert.equal(agent.status, 201);

    const duplicate = await fetch(`${base}/api/dashboard/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie! },
      body: JSON.stringify({ email: "Sam@Example.com", name: "Sam", password: "agent-password" }),
    });
    assert.equal(duplicate.status, 409);

    await fetch(`${base}/api/dashboard/session`, { method: "DELETE", headers: { cookie: adminCookie! } });
    const login = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "sam@example.com", password: "agent-password" }),
    });
    assert.equal(login.status, 201);
    const agentCookie = login.headers.get("set-cookie")?.split(";")[0];
    const who = (await login.json()) as { account: { role: string } };
    assert.equal(who.account.role, "agent");

    const forbidden = await fetch(`${base}/api/dashboard/accounts`, { headers: { cookie: agentCookie! } });
    assert.equal(forbidden.status, 403);
    const inbox = await fetch(`${base}/api/conversations`, { headers: { cookie: agentCookie! } });
    assert.equal(inbox.status, 200);

    const wrong = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "sam@example.com", password: "nope" }),
    });
    assert.equal(wrong.status, 401);
  } finally {
    await app.close();
  }
});

test("a configured form is required, then an agent can assign the ticket", async () => {
  const { app, base } = await start();
  try {
    const setup = await fetch(`${base}/api/dashboard/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "sam@example.com", name: "Sam", password: "correct horse" }),
    });
    assert.equal(setup.status, 201);
    const cookie = setup.headers.get("set-cookie")?.split(";")[0];

    const saved = await fetch(`${base}/api/dashboard/widget`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        title: "Help",
        subtitle: "We are here",
        accentColor: "#112233",
        placeholder: "Ask",
        greeting: "Welcome",
        formEnabled: true,
        formTitle: "Tell us about you",
        formSubmitLabel: "Open ticket",
        waitingMessage: "Waiting for an agent",
        quickActions: [{ id: "billing", label: "Billing question" }],
        formFields: [
          { id: "name", label: "Name", type: "text", required: true, placeholder: "Ada", options: [] },
          { id: "email", label: "Email", type: "email", required: true, placeholder: "", options: [] },
          { id: "plan", label: "Plan", type: "select", required: true, placeholder: "", options: ["Free", "Pro"] },
        ],
      }),
    });
    assert.equal(saved.status, 200);

    const config = (await (await fetch(`${base}/api/widget/config`)).json()) as {
      formEnabled: boolean;
      formFields: Array<{ id: string }>;
    };
    assert.equal(config.formEnabled, true);
    assert.equal(config.formFields.length, 3);

    const missing = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { name: "Ada" } }),
    });
    assert.equal(missing.status, 400);

    const started = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { name: "Ada", email: "ada@example.com", plan: "Pro" }, topic: "billing" }),
    });
    assert.equal(started.status, 201);
    const session = (await started.json()) as {
      conversation: { id: string; visitorName: string; visitorEmail: string; assigneeName: string | null };
      visitorToken: string;
      messages: Array<{ body: string; role: string }>;
    };
    assert.equal(session.conversation.visitorName, "Ada");
    assert.equal(session.conversation.visitorEmail, "ada@example.com");
    assert.equal((session.conversation as { metadata?: { topic?: string } }).metadata?.topic, "Billing question");
    assert.equal(session.conversation.assigneeName, null);
    assert.deepEqual(
      session.messages.map((message) => message.body),
      ["Welcome", "Topic: Billing question", "Name: Ada\nEmail: ada@example.com\nPlan: Pro", "Waiting for an agent"],
    );

    const assigned = await fetch(`${base}/api/conversations/${session.conversation.id}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: "{}",
    });
    assert.equal(assigned.status, 200);
    const ticket = (await assigned.json()) as {
      conversation: { assigneeName: string; messages: Array<{ body: string; role: string }> };
    };
    assert.equal(ticket.conversation.assigneeName, "Sam");
    assert.equal(ticket.conversation.messages.at(-1)?.body, "Sam joined the conversation");

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const renamed = await fetch(`${base}/api/dashboard/profile`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ name: "Samuel" }),
    });
    assert.equal(renamed.status, 200);
    assert.equal(((await renamed.json()) as { account: { name: string } }).account.name, "Samuel");
    const badPassword = await fetch(`${base}/api/dashboard/profile`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ name: "Samuel", currentPassword: "wrong horse", newPassword: "another horse" }),
    });
    assert.equal(badPassword.status, 400);

    const avatar = await fetch(`${base}/api/dashboard/avatar`, {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "image/png", "x-filename": "sam.png" },
      body: png,
    });
    assert.equal(avatar.status, 200);
    const photo = ((await avatar.json()) as { account: { avatarUrl: string } }).account.avatarUrl;
    assert.match(photo, /^\/uploads\/.+\.png$/);
    const picture = await fetch(`${base}${photo}`);
    assert.equal(picture.status, 200);

    const again = await fetch(`${base}/api/conversations/${session.conversation.id}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: "{}",
    });
    const claimed = (await again.json()) as { conversation: { assigneeName: string; assigneeAvatarUrl: string | null } };
    assert.equal(claimed.conversation.assigneeName, "Samuel");
    assert.equal(claimed.conversation.assigneeAvatarUrl, photo);

    const logo = await fetch(`${base}/api/dashboard/logo`, {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "image/png", "x-filename": "mark.png" },
      body: png,
    });
    assert.equal(logo.status, 200);
    const mark = ((await logo.json()) as { logoUrl: string }).logoUrl;
    const widgetConfig = (await (await fetch(`${base}/api/widget/config`)).json()) as { logoUrl: string | null };
    assert.equal(widgetConfig.logoUrl, mark);

    const seen = await fetch(`${base}/api/widget/conversations/${session.conversation.id}`, {
      headers: { "x-visitor-token": session.visitorToken },
    });
    const thread = (await seen.json()) as { conversation: { assigneeName: string; assigneeAvatarUrl: string | null }; messages: Array<{ body: string }> };
    assert.equal(thread.conversation.assigneeName, "Samuel");
    assert.equal(thread.conversation.assigneeAvatarUrl, photo);
    assert.equal(thread.messages.at(-1)?.body, "Samuel joined the conversation");
  } finally {
    await app.close();
  }
});

test("an identifier groups a visitor and the dashboard can read their card", async () => {
  const { app, base } = await start();
  try {
    const login = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: "admin-test-key" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const first = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Ada", identifier: "user_42", metadata: { plan: "pro" } }),
    });
    assert.equal(first.status, 201);
    await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Ada", identifier: "user_42" }),
    });
    const card = await fetch(`${base}/api/visitors/${encodeURIComponent("user_42")}`, { headers: { cookie: cookie! } });
    assert.equal(card.status, 200);
    const body = (await card.json()) as {
      visitor: { identifier: string; name: string; conversationCount: number; metadata: { plan?: string } };
    };
    assert.equal(body.visitor.identifier, "user_42");
    assert.equal(body.visitor.name, "Ada");
    assert.equal(body.visitor.conversationCount, 2);
    assert.equal(body.visitor.metadata.plan, "pro");

    const filtered = await fetch(`${base}/api/conversations?identifier=user_42`, { headers: { cookie: cookie! } });
    const page = (await filtered.json()) as { conversations: Array<{ identifier: string }> };
    assert.equal(page.conversations.length, 2);
    assert.equal(page.conversations.every((conversation) => conversation.identifier === "user_42"), true);
  } finally {
    await app.close();
  }
});

test("a visitor's page changes close the previous page and record how long they stayed", async () => {
  const { app, base } = await start();
  try {
    const login = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: "admin-test-key" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const started = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Ada" }),
    });
    const session = (await started.json()) as { conversation: { id: string }; visitorToken: string };
    const first = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ path: "/pricing" }),
    });
    assert.equal(first.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ path: "/pricing" }),
    });
    assert.equal(((await second.json()) as { pages: unknown[] }).pages.length, 1);
    const moved = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ path: "/checkout" }),
    });
    const pages = ((await moved.json()) as { pages: Array<{ path: string; endedAt: string | null }> }).pages;
    assert.deepEqual(pages.map((page) => page.path), ["/pricing", "/checkout"]);
    assert.ok(pages[0]?.endedAt);
    assert.equal(pages[1]?.endedAt, null);
    const seen = await fetch(`${base}/api/conversations/${session.conversation.id}/pages`, { headers: { cookie: cookie! } });
    assert.equal(seen.status, 200);
    assert.equal(((await seen.json()) as { pages: unknown[] }).pages.length, 2);

    const closed = await fetch(`${base}/api/conversations/${session.conversation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ status: "closed" }),
    });
    assert.equal(closed.status, 200);
    const after = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ path: "/goodbye" }),
    });
    assert.equal(after.status, 400);
    const frozen = ((await (await fetch(`${base}/api/conversations/${session.conversation.id}/pages`, { headers: { cookie: cookie! } })).json()) as {
      pages: Array<{ path: string; endedAt: string | null }>;
    }).pages;
    assert.equal(frozen.some((page) => page.path === "/goodbye"), false);
    assert.equal(frozen.every((page) => page.endedAt), true);
  } finally {
    await app.close();
  }
});

test("a signed-in agent who stays at the desk shows as online", async () => {
  const { app, base } = await start();
  try {
    const setup = await fetch(`${base}/api/dashboard/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", name: "Ada", password: "correct horse" }),
    });
    assert.equal(setup.status, 201);
    const cookie = setup.headers.get("set-cookie")?.split(";")[0];
    const before = (await (await fetch(`${base}/api/widget/config`)).json()) as { staffOnline: boolean };
    assert.equal(before.staffOnline, false);
    const beat = await fetch(`${base}/api/dashboard/presence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ presence: "online" }),
    });
    assert.equal(beat.status, 200);
    const online = (await (await fetch(`${base}/api/widget/config`)).json()) as { staffOnline: boolean };
    assert.equal(online.staffOnline, true);
    const { responseTimeLabel } = await import("./http.js");
    assert.equal(responseTimeLabel(30), "Usually accepted in under a minute");
    assert.equal(responseTimeLabel(120), "Usually accepted in 2 min");
    const away = await fetch(`${base}/api/dashboard/presence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ presence: "away" }),
    });
    assert.equal(away.status, 200);
    const hidden = (await (await fetch(`${base}/api/widget/config`)).json()) as { staffOnline: boolean };
    assert.equal(hidden.staffOnline, false);
  } finally {
    await app.close();
  }
});

test("outside open hours a visitor leaves an email ticket instead of a live chat", async () => {
  const { app, base } = await start();
  try {
    const login = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: "admin-test-key" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const closed = Array.from({ length: 7 }, () => ({ open: null, close: null }));
    const saved = await fetch(`${base}/api/dashboard/hours`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        enabled: true,
        timezone: "UTC",
        days: closed,
        closedMessage: "Leave your email.",
      }),
    });
    assert.equal(saved.status, 200);
    const config = (await (await fetch(`${base}/api/widget/config`)).json()) as {
      officeHours: { open: boolean; closedMessage: string; days: Array<{ open: number | null; close: number | null }> };
    };
    assert.equal(config.officeHours.open, false);
    assert.equal((config as { staffOnline?: boolean }).staffOnline, false);
    assert.equal(config.officeHours.closedMessage, "Leave your email.");
    assert.equal(config.officeHours.days.length, 7);
    assert.equal(config.officeHours.days[0]?.open, null);

    const missing = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorEmail: "ada@example.com" }),
    });
    assert.equal(missing.status, 400);
    const ticket = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorEmail: "ada@example.com", message: "The export failed" }),
    });
    assert.equal(ticket.status, 201);
    const created = (await ticket.json()) as { conversation: { status: string; visitorEmail: string; metadata: { offline?: string } }; messages: Array<{ body: string }> };
    assert.equal(created.conversation.status, "closed");
    assert.equal(created.conversation.visitorEmail, "ada@example.com");
    assert.equal(created.conversation.metadata.offline, "true");
    assert.equal(created.messages.some((message) => message.body === "The export failed"), true);
    assert.equal(created.messages.at(-1)?.body, "Leave your email.");

    const ai = await fetch(`${base}/api/dashboard/ai`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ enabled: true, model: "gpt-4.1-nano", agentName: "Ada Bot", apiKey: "sk-test" }),
    });
    assert.equal(ai.status, 200);
    const live = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Ada", handler: "ai" }),
    });
    assert.equal(live.status, 201);
    const chat = (await live.json()) as { conversation: { status: string; metadata: { handler?: string; offline?: string } }; messages: Array<{ body: string }> };
    assert.equal(chat.conversation.status, "open");
    assert.equal(chat.conversation.metadata.handler, "ai");
    assert.equal(chat.conversation.metadata.offline, undefined);
    assert.equal(chat.messages.at(-1)?.body, "Ada Bot joined the conversation");
  } finally {
    await app.close();
  }
});

test("an enabled AI agent answers from saved knowledge and a human chat does not", async () => {
  const { app, base } = await start();
  const seen: Array<{ model: string; knowledge: boolean }> = [];
  setOpenAiCompleter(async (input) => {
    seen.push({ model: input.model, knowledge: input.messages[0]?.content.includes("Ships in 3 days") ?? false });
    const question = input.messages.at(-1)?.content ?? "";
    return {
      body: question.includes("refund") ? "Refunds last 30 days." : "I can help with shipping.",
      promptTokens: 840,
      completionTokens: 12,
    };
  });
  try {
    const login = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: "admin-test-key" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const saved = await fetch(`${base}/api/dashboard/ai`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ enabled: true, model: "gpt-4o", agentName: "Ada Bot", apiKey: "sk-test", rateLimitEnabled: true, rateLimit: 1 }),
    });
    assert.equal(saved.status, 200);
    const knowledge = await fetch(`${base}/api/dashboard/ai/context`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ context: "Ships in 3 days. Refunds last 30 days." }),
    });
    assert.equal(knowledge.status, 200);
    const view = (await (await fetch(`${base}/api/dashboard/settings`, { headers: { cookie: cookie! } })).json()) as {
      settings: { ai: { hasApiKey: boolean; model: string; context: string } };
    };
    assert.equal(view.settings.ai.hasApiKey, true);
    assert.equal(view.settings.ai.model, "gpt-4o");
    assert.equal(JSON.stringify(view).includes("sk-test"), false);
    assert.equal(view.settings.ai.context.includes("Refunds"), true);

    const config = (await (await fetch(`${base}/api/widget/config`)).json()) as { ai: { enabled: boolean; agentName: string } };
    assert.equal(config.ai.enabled, true);
    assert.equal(config.ai.agentName, "Ada Bot");
    assert.equal("context" in (config as object), false);

    const human = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Grace", handler: "human" }),
    });
    const person = (await human.json()) as { conversation: { id: string }; visitorToken: string };
    const refused = await fetch(`${base}/api/widget/conversations/${person.conversation.id}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": person.visitorToken },
      body: "{}",
    });
    assert.equal(refused.status, 409);

    const topics = await fetch(`${base}/api/dashboard/widget`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        title: "Help",
        subtitle: "We are here",
        accentColor: "#112233",
        placeholder: "Ask",
        greeting: "Welcome",
        quickActions: [{ id: "account", label: "Account questions" }],
      }),
    });
    assert.equal(topics.status, 200);
    const started = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Ada", handler: "ai", topic: "account" }),
    });
    assert.equal(started.status, 201);
    const session = (await started.json()) as {
      conversation: { id: string; metadata: { handler?: string; topic?: string } };
      visitorToken: string;
      messages: Array<{ body: string }>;
    };
    assert.equal(session.conversation.metadata.handler, "ai");
    assert.equal(session.conversation.metadata.topic, "Account questions");
    assert.equal(session.messages.at(-1)?.body, "Ada Bot joined the conversation");

    const empty = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: "{}",
    });
    assert.equal(empty.status, 400);

    await fetch(`${base}/api/widget/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ body: "What is your refund window?" }),
    });
    const reply = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: "{}",
    });
    assert.equal(reply.status, 201);
    const message = (await reply.json()) as { message: { role: string; body: string; agentName: string } };
    assert.equal(message.message.role, "agent");
    assert.equal(message.message.agentName, "Ada Bot");
    assert.equal(message.message.body, "Refunds last 30 days.");
    assert.equal(message.message.actionIds, undefined);
    assert.equal(seen[0]?.model, "gpt-4o");
    assert.equal(seen[0]?.knowledge, true);

    const usageResponse = await fetch(`${base}/api/dashboard/ai/usage`, { headers: { cookie: cookie! } });
    assert.equal(usageResponse.status, 200);
    const usage = ((await usageResponse.json()) as {
      usage: { conversations: number; messages: number; replies: number; promptTokens: number; estimatedCostUsd: number; models: Array<{ model: string }> };
    }).usage;
    assert.equal(usage.conversations, 1);
    assert.equal(usage.messages, 1);
    assert.equal(usage.replies, 1);
    assert.equal(usage.promptTokens, 840);
    assert.equal(usage.models[0]?.model, "gpt-4o");
    assert.equal(usage.estimatedCostUsd, (840 / 1_000_000) * 2.5 + (12 / 1_000_000) * 10);
    await fetch(`${base}/api/widget/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ body: "And shipping?" }),
    });
    const blocked = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: "{}",
    });
    assert.equal(blocked.status, 429);
    assert.match(((await blocked.json()) as { error: string }).error, /Too many questions/);

    const hiddenUsage = await fetch(`${base}/api/dashboard/ai/usage`);
    assert.equal(hiddenUsage.status, 401);

    const kept = await fetch(`${base}/api/dashboard/ai`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ enabled: false, model: "gpt-4o-mini", agentName: "Ada Bot" }),
    });
    assert.equal(kept.status, 200);
    const after = (await (await fetch(`${base}/api/dashboard/settings`, { headers: { cookie: cookie! } })).json()) as {
      settings: { ai: { enabled: boolean; hasApiKey: boolean; context: string } };
    };
    assert.equal(after.settings.ai.enabled, false);
    assert.equal(after.settings.ai.hasApiKey, true);
    assert.equal(after.settings.ai.context.includes("Ships"), true);
    const hidden = (await (await fetch(`${base}/api/widget/config`)).json()) as { ai: { enabled: boolean } };
    assert.equal(hidden.ai.enabled, false);
  } finally {
    setOpenAiCompleter(null);
    await app.close();
  }
});

test("revoked tokens stop working", async () => {
  const { app, base } = await start();
  try {
    const minted = await fetch(`${base}/api/tokens`, {
      method: "POST",
      headers: { authorization: "Bearer admin-test-key", "content-type": "application/json" },
      body: JSON.stringify({ name: "Temp" }),
    });
    const { id, token } = (await minted.json()) as { id: string; token: string };
    const revoked = await fetch(`${base}/api/tokens/${id}`, {
      method: "DELETE",
      headers: { authorization: "Bearer admin-test-key" },
    });
    assert.equal(revoked.status, 200);
    const denied = await fetch(`${base}/api/conversations`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(denied.status, 401);
  } finally {
    await app.close();
  }
});


test("an AI reply can ask the page for configured actions", async () => {
  const { app, base } = await start();
  setOpenAiCompleter(async (input) => {
    const knowledge = input.messages[0]?.content ?? "";
    const asked = knowledge.includes("1: Returns the signed-in plan");
    return {
      body: asked ? "I need your plan to answer that.\n%%[1, 8]%%" : "I do not know which actions exist.",
      promptTokens: 20,
      completionTokens: 8,
    };
  });
  try {
    const login = await fetch(`${base}/api/dashboard/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminKey: "admin-test-key" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const saved = await fetch(`${base}/api/dashboard/ai`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ enabled: true, model: "gpt-4o-mini", agentName: "Ada Bot", apiKey: "sk-test" }),
    });
    assert.equal(saved.status, 200);
    const knowledge = await fetch(`${base}/api/dashboard/ai/context`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        context: "Plans renew monthly.",
        actions: [
          { id: 1, label: "Plan", description: "Returns the signed-in plan." },
          { id: 1, label: "Duplicate", description: "Ignored duplicate." },
        ],
      }),
    });
    assert.equal(knowledge.status, 200);
    const view = (await (await fetch(`${base}/api/dashboard/settings`, { headers: { cookie: cookie! } })).json()) as {
      settings: { ai: { actions: Array<{ id: number; description: string }> } };
    };
    assert.deepEqual(view.settings.ai.actions.map((action) => action.id), [1]);
    const config = (await (await fetch(`${base}/api/widget/config`)).json()) as { ai: { actions: number[] } };
    assert.deepEqual(config.ai.actions, [1]);

    const started = await fetch(`${base}/api/widget/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorName: "Ada", handler: "ai" }),
    });
    const session = (await started.json()) as { conversation: { id: string }; visitorToken: string };
    await fetch(`${base}/api/widget/conversations/${session.conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: JSON.stringify({ body: "When does my plan renew?" }),
    });
    const reply = await fetch(`${base}/api/widget/conversations/${session.conversation.id}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-token": session.visitorToken },
      body: "{}",
    });
    assert.equal(reply.status, 201);
    const message = (await reply.json()) as { message: { body: string; actionIds?: number[] } };
    assert.equal(message.message.body, "I need your plan to answer that.");
    assert.deepEqual(message.message.actionIds, [1]);

    const thread = await fetch(`${base}/api/widget/conversations/${session.conversation.id}`, {
      headers: { "x-visitor-token": session.visitorToken },
    });
    const stored = (await thread.json()) as { messages: Array<{ body: string; actionIds?: number[] }> };
    const agent = stored.messages.find((item) => item.body.startsWith("I need your plan"));
    assert.deepEqual(agent?.actionIds, [1]);
    assert.equal(stored.messages.some((item) => item.body.includes("%%")), false);
  } finally {
    setOpenAiCompleter(null);
    await app.close();
  }
});
