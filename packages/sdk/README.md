# @open-support/sdk

Typed client for a self-hosted [Open Support](https://opensupport.dev) server. It calls the REST API with an API token minted in the desk. There is no UI in this package.

```bash
npm install @open-support/sdk
```

Requires Node 22 or newer. The client uses the global `fetch`.

```ts
import { OpenSupport } from "@open-support/sdk";

const support = new OpenSupport({
  serverUrl: "https://support.example.com",
  token: process.env.OPEN_SUPPORT_TOKEN!,
});

const open = await support.listConversations({ status: "open", limit: 20 });
const thread = await support.listMessages(open.items[0].id, { limit: 50 });

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

await support.closeConversation(open.items[0].id);
```

Mint the token in the desk under **API tokens**. The plaintext token (`osb_live_…`) is shown once. Send it as `token`. The server URL is the origin of your Open Support server, with no path.

## Methods

| Method | What it does |
| --- | --- |
| `listConversations({ status?, identifier?, limit?, cursor? })` | Conversations, newest activity first. `status` is `"open"` or `"closed"`. |
| `listMessages(conversationId, { limit?, cursor?, after? })` | Messages in one conversation, oldest first. `after` is an ISO timestamp for polling. |
| `getVisitor(identifier)` | The person behind an identifier, including every conversation they started. |
| `assignConversation(conversationId, { agentName? })` | Claim the ticket. The visitor sees "<name> joined the conversation". |
| `uploadFile(conversationId, { name, type?, bytes })` | Upload one file in 5 MB chunks, up to 50 MB. Returns an attachment id. |
| `sendMessage(conversationId, { body, agentName?, attachmentIds? })` | Reply as an agent. Pass attachment ids from `uploadFile`. |
| `closeConversation(conversationId)` | Close the ticket. The visitor can no longer write in it. |

Lists return `{ items, nextCursor }`. `nextCursor` is `null` on the last page. Pass it back as `cursor`. The server caps `limit` at 100. Omit `limit` on `listMessages` to receive the whole thread.

Failed requests throw `OpenSupportError`. It has a `status` and the server's error message.

## AI replies

AI replies are normal agent messages. When the model asked the visitor's page for data, `actionIds` lists the action numbers configured in the desk, and `body` does not include the `%%[1,2]%%` marker. This package does not run those page handlers. The [React bubble](https://www.npmjs.com/package/@open-support/react) does, from its `actions` prop.

## Server

The widget and this client talk to a server you run yourself. The server, the desk, and the deploy notes are in the [Open Support repository](https://github.com/TwanLuttik/opensupport).

Created by [CoatCheck Technology, Inc.](https://opensupport.dev)
