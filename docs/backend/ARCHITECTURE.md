# Herald - Backend Architecture

Minimal Cloudflare-backed backend for email ingestion and real-time sync.

> **Warning**: This document is internal only and contains production credentials/tokens.

## Overview

Herald is a low-scale email solution built on Cloudflare Workers. Currently, there's a scaffolded frontend that is not yet wired to any backend. This document outlines the minimal backend architecture required to connect the frontend.

## Project Structure

```
herald/
├─ apps/
│  ├─ api/                 # HTTP API + Durable Object (Realtime)
│  │  ├─ src/
│  │  │  ├─ index.ts       # Hono HTTP server
│  │  │  └─ realtime.ts   # MailboxRealtime DO class
│  │  └─ wrangler.jsonc   # API Worker config
│  ├─ frontend/            # Existing scaffolded frontend
│  │  ├─ src/
│  │  └─ wrangler.jsonc
│  ├─ email/              # Email Worker (inbound)
│  │  ├─ src/
│  │  │  └─ index.ts
│  │  └─ wrangler.jsonc
│  └─ queue/              # Queue Worker (async processing)
│     ├─ src/
│     │  └─ index.ts
│     └─ wrangler.jsonc
├─ db/
│  └─ schema.sql          # D1 database schema
├─ migrations/           # D1 migration files
└─ package.json          # pnpm workspace root
```

> **Note**: The `packages/` directory has been merged into `apps/`. Each app is an independent deployment unit with its own `wrangler.jsonc`.

## Cloudflare Resources

Create these resources before deployment:

```bash
# D1 database for mailboxes, messages, attachments
wrangler d1 create herald-database

# R2 bucket for raw email storage
wrangler r2 bucket create herald-mail

# Queue for async processing (attachment extraction, search indexing)
wrangler queues create herald-ingest
```

> **Note**: Record the `database_id` from D1 creation and `bucket_name` from R2 creation for the `wrangler.jsonc` files below.

## D1 Schema

```sql
-- db/schema.sql
-- Run with: wrangler d1 migrations apply herald-database --local --remote

CREATE TABLE mailboxes (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  thread_id TEXT,
  provider_message_id TEXT,
  from_addr TEXT NOT NULL,
  subject TEXT,
  preview TEXT,
  r2_raw_key TEXT NOT NULL,
  received_at TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id)
);

CREATE INDEX idx_messages_mailbox_received
ON messages (mailbox_id, received_at DESC);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  r2_key TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);
```

## Durable Object: MailboxRealtime

SQLite-backed DO for real-time WebSocket notifications. This must be defined in the API worker's `wrangler.jsonc` with `new_sqlite_classes` to ensure it's created from the start.

```ts
// apps/api/src/realtime.ts
export class MailboxRealtime {
  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {}

  async fetch(req: Request) {
    const url = new URL(req.url)

    // WebSocket upgrade for client connections
    if (url.pathname === "/ws") {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.state.acceptWebSocket(server)

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    // Internal notify endpoint called by Email Worker
    if (url.pathname === "/notify" && req.method === "POST") {
      const event = await req.json()

      for (const ws of this.state.getWebSockets()) {
        ws.send(JSON.stringify(event))
      }

      return Response.json({ ok: true })
    }

    return new Response("not found", { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") {
      ws.send("pong")
    }
  }
}
```

## API Worker

Hono-based HTTP API with D1, R2, and DO bindings.

```jsonc
// apps/api/wrangler.jsonc
{
  "name": "herald-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-25",
  "compatibility_flags": ["nodejs_compat"],

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "herald-database",
      "database_id": "YOUR_D1_DATABASE_ID"
    }
  ],

  "r2_buckets": [
    {
      "binding": "MAIL_BUCKET",
      "bucket_name": "herald-mail"
    }
  ],

  "durable_objects": {
    "bindings": [
      {
        "name": "MAILBOX_REALTIME",
        "class_name": "MailboxRealtime"
      }
    ]
  },

  "migrations": [
    {
      "tag": "init",
      "new_sqlite_classes": ["MailboxRealtime"]
    }
  ]
}
```

```ts
// apps/api/src/index.ts
import { Hono } from "hono"
export { MailboxRealtime } from "./realtime"

type Env = {
  DB: D1Database
  MAIL_BUCKET: R2Bucket
  MAILBOX_REALTIME: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Env }>()

app.get("/health", (c) => c.json({ ok: true }))

app.get("/api/messages", async (c) => {
  const mailboxId = c.req.query("mailboxId")
  if (!mailboxId) return c.json({ error: "missing mailboxId" }, 400)

  const { results } = await c.env.DB.prepare(
    `SELECT id, thread_id, from_addr, subject, preview, received_at, read_at
     FROM messages
     WHERE mailbox_id = ?
     ORDER BY received_at DESC
     LIMIT 50`
  ).bind(mailboxId).all()

  return c.json({ messages: results })
})

app.get("/api/messages/:id", async (c) => {
  const messageId = c.req.param("id")

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM messages WHERE id = ?`
  ).bind(messageId).all()

  if (!results.length) {
    return c.json({ error: "message not found" }, 404)
  }

  return c.json({ message: results[0] })
})

app.post("/api/messages/:id/read", async (c) => {
  const messageId = c.req.param("id")

  await c.env.DB.prepare(
    `UPDATE messages SET read_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), messageId).run()

  return c.json({ ok: true })
})

app.get("/api/ws", async (c) => {
  const mailboxId = c.req.query("mailboxId")
  if (!mailboxId) return c.text("missing mailboxId", 400)

  const id = c.env.MAILBOX_REALTIME.idFromName(`mailbox:${mailboxId}`)
  const stub = c.env.MAILBOX_REALTIME.get(id)

  return stub.fetch("https://mailbox-realtime/ws", c.req.raw)
})

export default app
```

## Email Worker

Inbound email handling via Cloudflare Email Routing. Receives emails, stores raw content to R2, writes metadata to D1, and notifies via DO.

```jsonc
// apps/email/wrangler.jsonc
{
  "name": "herald-email",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-25",
  "compatibility_flags": ["nodejs_compat"],

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "herald-database",
      "database_id": "YOUR_D1_DATABASE_ID"
    }
  ],

  "r2_buckets": [
    {
      "binding": "MAIL_BUCKET",
      "bucket_name": "herald-mail"
    }
  ],

  "queues": {
    "producers": [
      {
        "binding": "INGEST_QUEUE",
        "queue": "herald-ingest"
      }
    ]
  },

  "durable_objects": {
    "bindings": [
      {
        "name": "MAILBOX_REALTIME",
        "class_name": "MailboxRealtime",
        "script_name": "herald-api"
      }
    ]
  }
}
```

```ts
// apps/email/src/index.ts
import PostalMime from "postal-mime"

type Env = {
  DB: D1Database
  MAIL_BUCKET: R2Bucket
  INGEST_QUEUE: Queue
  MAILBOX_REALTIME: DurableObjectNamespace
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const mailboxId = message.to.toLowerCase()
    const messageId = crypto.randomUUID()
    const rawKey = `raw/${mailboxId}/${messageId}.eml`

    // Store raw email to R2
    const raw = await new Response(message.raw).arrayBuffer()
    await env.MAIL_BUCKET.put(rawKey, raw)

    // Parse email
    const parsed = await PostalMime.parse(raw)

    // Insert metadata to D1
    await env.DB.prepare(
      `INSERT INTO messages
       (id, mailbox_id, thread_id, provider_message_id, from_addr, subject, preview, r2_raw_key, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        messageId,
        mailboxId,
        parsed.references?.[0] ?? messageId,
        parsed.messageId ?? null,
        parsed.from?.address ?? "unknown",
        parsed.subject ?? "",
        parsed.text?.slice(0, 240) ?? "",
        rawKey,
        new Date().toISOString()
      )
      .run()

    // Queue for async processing (attachments, search indexing)
    ctx.waitUntil(
      env.INGEST_QUEUE.send({
        type: "mail.ingest",
        mailboxId,
        messageId,
        rawKey,
      })
    )

    // Notify connected WebSocket clients
    const id = env.MAILBOX_REALTIME.idFromName(`mailbox:${mailboxId}`)
    const stub = env.MAILBOX_REALTIME.get(id)

    ctx.waitUntil(
      stub.fetch("https://mailbox-realtime/notify", {
        method: "POST",
        body: JSON.stringify({
          type: "mail.created",
          mailboxId,
          messageId,
          from: parsed.from?.address,
          subject: parsed.subject,
          receivedAt: new Date().toISOString(),
        }),
      })
    )
  },
}
```

## Queue Worker

Async message processing. Currently a placeholder for future attachment extraction and search indexing.

```jsonc
// apps/queue/wrangler.jsonc
{
  "name": "herald-queue",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-25",

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "herald-database",
      "database_id": "YOUR_D1_DATABASE_ID"
    }
  ],

  "r2_buckets": [
    {
      "binding": "MAIL_BUCKET",
      "bucket_name": "herald-mail"
    }
  ],

  "queues": {
    "consumers": [
      {
        "queue": "herald-ingest",
        "max_batch_size": 10,
        "max_batch_timeout": 5
      }
    ]
  }
}
```

```ts
// apps/queue/src/index.ts
type Env = {
  DB: D1Database
  MAIL_BUCKET: R2Bucket
}

export default {
  async queue(batch: MessageBatch, env: Env) {
    for (const msg of batch.messages) {
      const body = msg.body as {
        type: "mail.ingest"
        mailboxId: string
        messageId: string
        rawKey: string
      }

      // TODO: Extract attachments to R2
      // TODO: Generate search index (vector embedding)
      // TODO: Create summary with LLM

      msg.ack()
    }
  },
}
```

## Deployment Commands

```bash
# 1. Apply D1 migrations
wrangler d1 migrations apply herald-database --local
wrangler d1 migrations apply herald-database --remote

# 2. Deploy API Worker (includes DO migration)
pnpm --filter herald-api deploy

# 3. Deploy Email Worker
pnpm --filter herald-email deploy

# 4. Deploy Queue Worker
pnpm --filter herald-queue deploy
```

## Abstractions (for Future Migration)

```ts
// To be extracted to apps/shared/ or a separate package later
interface MailRepository {
  listMessages(mailboxId: string): Promise<MessageSummary[]>
  getMessage(messageId: string): Promise<MessageDetail>
  markRead(messageId: string): Promise<void>
}

interface BlobStore {
  putRawEmail(key: string, body: ArrayBuffer): Promise<void>
  getRawEmail(key: string): Promise<ArrayBuffer>
}

interface RealtimeBus {
  notifyMailbox(mailboxId: string, event: unknown): Promise<void>
}
```

These abstractions allow future migration to:

- **D1** → PostgreSQL (via pg or Drizzle ORM)
- **R2** → S3 / MinIO
- **DO** → Redis + WebSocket server
- **Cloudflare Email** → SES inbound / Mailgun

## Development Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "dev:api": "wrangler dev -c apps/api/wrangler.jsonc",
    "dev:email": "wrangler dev -c apps/email/wrangler.jsonc",
    "dev:queue": "wrangler dev -c apps/queue/wrangler.jsonc",
    "deploy": "pnpm --filter herald-api deploy && pnpm --filter herald-email deploy && pnpm --filter herald-queue deploy",
    "db:migrate:local": "wrangler d1 migrations apply herald-database --local",
    "db:migrate:remote": "wrangler d1 migrations apply herald-database --remote"
  }
}
```

## Current Gaps

1. **Frontend not wired**: The existing frontend scaffold needs to connect to the API Worker endpoints
2. **No authentication**: All endpoints are unauthenticated; need to add auth (maybe CF Access or JWT)
3. **No mailboxes CRUD**: Need endpoint to create/list mailboxes for users
4. **No email sending**: Only inbound is handled; need outbound (SMTP relay or API)
5. **Queue placeholder**: Async processing is not implemented
6. **DO migration required**: First deploy of API Worker must include migration for DO class

## Inconsistencies from Original Proposal

1. Project name: `mailflow` → `herald`
2. Resource names: `mailflow-*` → `herald-*`
3. Directory: `workers/` merged to `apps/`
4. DO migration tag: `v1` → `init`
5. `packages/` merged into `apps/`