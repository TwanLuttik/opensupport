# @open-support/sdk

A small client for the Open Support server. It talks to the REST API with an API token minted in the dashboard. There is no UI in this package.

```ts
import { OpenSupport } from "@open-support/sdk";

const support = new OpenSupport({
  serverUrl: "http://localhost:8787",
  token: process.env.OPEN_SUPPORT_TOKEN!,
});

const conversations = await support.listConversations({ status: "open", limit: 20 });
const thread = await support.listMessages(conversations.items[0].id, { limit: 50 });
const file = await support.uploadFile(conversations.items[0].id, {
  name: "notes.txt",
  type: "text/plain",
  bytes: new TextEncoder().encode("Checked the logs"),
});
await support.sendMessage(conversations.items[0].id, {
  body: "Looking into this now",
  agentName: "Sam",
  attachmentIds: [file.id],
});
await support.closeConversation(conversations.items[0].id);
```

`nextCursor` is `null` on the last page. Pass it back as `cursor` to continue. Conversations are newest first. Messages are oldest first.

The package is not on npm yet. From this repo, `pnpm --filter @open-support/sdk build`, then link `packages/sdk` into the app the same way as `@open-support/react`.
