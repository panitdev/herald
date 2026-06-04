// apps/api/src/index.ts
// Hono HTTP API server

import { Hono } from "hono"
import type { Context } from "hono"
import { cors } from "hono/cors"
import { MailboxRealtime } from "./realtime"
import { createMailSender, createRawEmail, normalizeAddress } from "./mail"
import {
  hashPasswordWithSalt,
  verifyPassword,
  hashToken,
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  authMiddleware,
  getUser,
  type TokenPair,
} from "./auth"

type Env = {
  DB: D1Database
  MAIL_BUCKET: R2Bucket
  MAILBOX_REALTIME: DurableObjectNamespace
  MAIL_DOMAIN?: string
  MAIL_PROVIDER?: string
  MAIL_FROM_NAME?: string
  BREVO_API_KEY?: string
  RESEND_API_KEY?: string
}

const app = new Hono<{ Bindings: Env }>()

// CORS for frontend
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
)

// Health check
app.get("/health", (c) => c.json({ ok: true }))

// ============================================
// Auth endpoints (public)
// ============================================

// Register
app.post("/api/auth/register", async (c) => {
  const MAIL_DOMAIN = (c.env.MAIL_DOMAIN as string | undefined) ?? "a.com"
  const body = await c.req.json<{ username: string; password: string }>()

  if (!body.username || !body.password) {
    return c.json({ error: "username and password required" }, 400)
  }

  const username = body.username.toLowerCase().trim()
  if (!/^[a-z0-9._-]{1,64}$/.test(username)) {
    return c.json({ error: "username must be 1-64 chars: lowercase letters, numbers, dots, underscores, hyphens" }, 400)
  }

  if (body.password.length < 8) {
    return c.json({ error: "password must be at least 8 characters" }, 400)
  }

  const address = `${username}@${MAIL_DOMAIN}`
  const { hash: passwordHash, salt } = await hashPasswordWithSalt(body.password)
  const id = crypto.randomUUID()

  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, address, password_hash, salt) VALUES (?, ?, ?, ?)`
    ).bind(id, address, passwordHash, salt).run()
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      return c.json({ error: "username already taken" }, 409)
    }
    throw e
  }

  // Create default folders for the new user
  await c.env.DB.prepare(
    `INSERT INTO mailboxes (id, user_id, name, is_system) VALUES (?, ?, 'inbox', 1), (?, ?, 'sent', 1), (?, ?, 'archive', 1), (?, ?, 'trash', 1), (?, ?, 'spam', 1)`
  ).bind(
    crypto.randomUUID(), id, // inbox
    crypto.randomUUID(), id, // sent
    crypto.randomUUID(), id, // archive
    crypto.randomUUID(), id, // trash
    crypto.randomUUID(), id, // spam
  ).run()

  // Create tokens
  const tokens = await createTokens(c, id, address)

  return c.json({
    user: { id, address },
    ...tokens,
  }, 201)
})

// Login
app.post("/api/auth/login", async (c) => {
  const MAIL_DOMAIN = (c.env.MAIL_DOMAIN as string | undefined) ?? "a.com"
  const body = await c.req.json<{ username: string; password: string }>()

  if (!body.username || !body.password) {
    return c.json({ error: "username and password required" }, 400)
  }

  const username = body.username.toLowerCase().trim()
  const address = `${username}@${MAIL_DOMAIN}`

  const { results } = await c.env.DB.prepare(
    `SELECT id, address, password_hash, salt FROM users WHERE address = ?`
  ).bind(address).all() as { results: UserRow[] }

  if (!results.length) {
    return c.json({ error: "invalid credentials" }, 401)
  }

  const user = results[0]
  const valid = await verifyPassword(body.password, user.salt, user.password_hash)

  if (!valid) {
    return c.json({ error: "invalid credentials" }, 401)
  }

  const tokens = await createTokens(c, user.id, user.address)

  return c.json({
    user: { id: user.id, address: user.address },
    ...tokens,
  })
})

// Refresh token
app.post("/api/auth/refresh", async (c) => {
  const body = await c.req.json<{ refreshToken: string }>()
  
  if (!body.refreshToken) {
    return c.json({ error: "refresh token required" }, 400)
  }
  
  const tokenHash = await hashToken(body.refreshToken)
  
  const { results } = await c.env.DB.prepare(
    `SELECT rt.user_id, u.address
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token_hash = ? AND rt.expires_at > datetime('now')`
  ).bind(tokenHash).all() as { results: RefreshTokenRow[] }

  if (!results.length) {
    return c.json({ error: "invalid or expired refresh token" }, 401)
  }

  const { user_id, address } = results[0]
  
  // Delete old refresh token
  await c.env.DB.prepare(
    `DELETE FROM refresh_tokens WHERE token_hash = ?`
  ).bind(tokenHash).run()
  
  // Create new tokens
  const tokens = await createTokens(c, user_id, address)
  
  return c.json(tokens)
})

// Logout
app.post("/api/auth/logout", async (c) => {
  const body = await c.req.json<{ refreshToken?: string }>()
  
  if (body.refreshToken) {
    const tokenHash = await hashToken(body.refreshToken)
    await c.env.DB.prepare(
      `DELETE FROM refresh_tokens WHERE token_hash = ?`
    ).bind(tokenHash).run()
  }
  
  return c.json({ ok: true })
})

// Helper to create token pair
async function createTokens(c: Context, userId: string, address: string): Promise<TokenPair> {
  const accessToken = await createAccessToken(userId, address)
  const refreshToken = createRefreshToken(userId)
  const tokenHash = await hashToken(refreshToken)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  
  await c.env.DB.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, tokenHash, expiresAt).run()
  
  return { accessToken, refreshToken }
}

// ============================================
// Protected routes (require auth)
// ============================================

// List messages for a mailbox (protected)
app.get("/api/messages", authMiddleware, async (c) => {
  const user = getUser(c)
  const mailboxId = c.req.query("mailboxId")
  if (!mailboxId) {
    return c.json({ error: "missing mailboxId" }, 400)
  }

  // Verify mailbox belongs to user
  const { results: mailboxResults } = await c.env.DB.prepare(
    `SELECT id FROM mailboxes WHERE id = ? AND user_id = ?`
  ).bind(mailboxId, user.id).all() as { results: MailboxRow[] }
  
  if (!mailboxResults.length) {
    return c.json({ error: "mailbox not found or access denied" }, 404)
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, mailbox_id, thread_id, from_addr, subject, preview, received_at, read_at
     FROM messages
     WHERE mailbox_id = ?
     ORDER BY received_at DESC
     LIMIT 50`
  ).bind(mailboxId).all() as { results: MessageRow[] }

  return c.json({ messages: results })
})

// Get single message (protected)
app.get("/api/messages/:id", authMiddleware, async (c) => {
  const user = getUser(c)
  const messageId = c.req.param("id")

  // First get the message to find mailbox
  const { results: msgResults } = await c.env.DB.prepare(
    `SELECT m.mailbox_id FROM messages m
     JOIN mailboxes mb ON m.mailbox_id = mb.id
     WHERE m.id = ? AND mb.user_id = ?`
  ).bind(messageId, user.id).all() as { results: { mailbox_id: string }[] }

  if (!msgResults.length) {
    return c.json({ error: "message not found" }, 404)
  }

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM messages WHERE id = ?`
  ).bind(messageId).all() as { results: MessageRow[] }

  return c.json({ message: results[0] })
})

// Mark message as read (protected)
app.post("/api/messages/:id/read", authMiddleware, async (c) => {
  const user = getUser(c)
  const messageId = c.req.param("id")

  // Verify ownership
  const { results: msgResults } = await c.env.DB.prepare(
    `SELECT m.id FROM messages m
     JOIN mailboxes mb ON m.mailbox_id = mb.id
     WHERE m.id = ? AND mb.user_id = ?`
  ).bind(messageId, user.id).all() as { results: { id: string }[] }

  if (!msgResults.length) {
    return c.json({ error: "message not found or access denied" }, 404)
  }

  await c.env.DB.prepare(
    `UPDATE messages SET read_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), messageId).run()

  return c.json({ ok: true })
})

// Send a new message (protected)
app.post("/api/messages/send", authMiddleware, async (c) => {
  const user = getUser(c)
  const body = await c.req.json<{ to?: string; subject?: string; body?: string; fromName?: string }>()

  const to = body.to ? normalizeAddress(body.to) : null
  const subject = body.subject?.trim()
  const text = body.body ?? ""

  if (!to) {
    return c.json({ error: "valid recipient email required" }, 400)
  }
  if (!subject) {
    return c.json({ error: "subject required" }, 400)
  }

  const { results: mailboxResults } = await c.env.DB.prepare(
    `SELECT id FROM mailboxes WHERE user_id = ? AND name = 'sent'`
  ).bind(user.id).all() as { results: { id: string }[] }

  if (!mailboxResults.length) {
    return c.json({ error: "sent mailbox not found" }, 500)
  }

  const from = {
    email: user.address,
    name: normalizeDisplayName(body.fromName) ?? displayNameFromAddress(user.address),
  }
  const input = {
    from,
    to: [to],
    replyTo: { email: user.address },
    subject,
    text,
  }

  let sendResult
  try {
    const sender = createMailSender(c.env)
    sendResult = await sender.send(input)
  } catch (e) {
    console.error("Failed to send message:", e)
    const message = e instanceof Error ? e.message : "mail provider send failed"
    return c.json({ error: message }, 502)
  }

  const messageId = crypto.randomUUID()
  const mailboxId = mailboxResults[0].id
  const sentAt = new Date().toISOString()
  const rawKey = `raw/${mailboxId}/${messageId}.eml`
  const raw = createRawEmail(input, sentAt)
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 240)

  await c.env.MAIL_BUCKET.put(rawKey, raw, {
    httpMetadata: { contentType: "message/rfc822" },
  })

  await c.env.DB.prepare(
    `INSERT INTO messages
      (id, mailbox_id, thread_id, provider_message_id, from_addr, subject, preview, r2_raw_key, received_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    messageId,
    mailboxId,
    messageId,
    sendResult.providerMessageId,
    user.address,
    subject,
    preview,
    rawKey,
    sentAt,
    sentAt,
  ).run()

  return c.json({
    message: {
      id: messageId,
      mailbox_id: mailboxId,
      thread_id: messageId,
      provider_message_id: sendResult.providerMessageId,
      from_addr: user.address,
      subject,
      preview,
      r2_raw_key: rawKey,
      received_at: sentAt,
      read_at: sentAt,
      created_at: sentAt,
    },
    delivery: sendResult,
  }, 201)
})

// Get raw email content from R2 (protected)
app.get("/api/messages/:id/raw", authMiddleware, async (c) => {
  const user = getUser(c)
  const messageId = c.req.param("id")

  // Verify ownership
  const { results: msgResults } = await c.env.DB.prepare(
    `SELECT m.r2_raw_key FROM messages m
     JOIN mailboxes mb ON m.mailbox_id = mb.id
     WHERE m.id = ? AND mb.user_id = ?`
  ).bind(messageId, user.id).all() as { results: { r2_raw_key: string }[] }

  if (!msgResults.length) {
    return c.json({ error: "message not found or access denied" }, 404)
  }

  const r2Key = msgResults[0].r2_raw_key
  console.log("Fetching raw email with key:", r2Key)

  const rawEmail = await c.env.MAIL_BUCKET.get(r2Key)
  if (!rawEmail) {
    console.error("R2 object not found for key:", r2Key)
    return c.json({ error: "raw email not found" }, 404)
  }

  // Convert R2 body to string
  const bodyText = await rawEmail.text()
  console.log("Raw email body length:", bodyText.length)

  return new Response(bodyText, {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": "inline",
    },
  })
})

// WebSocket endpoint for real-time updates (protected)
app.get("/api/ws", authMiddleware, async (c) => {
  const user = getUser(c)
  const mailboxId = c.req.query("mailboxId")
  if (!mailboxId) {
    return c.text("missing mailboxId", 400)
  }

  // Verify mailbox belongs to user
  const { results: mailboxResults } = await c.env.DB.prepare(
    `SELECT id FROM mailboxes WHERE id = ? AND user_id = ?`
  ).bind(mailboxId, user.id).all() as { results: MailboxRow[] }
  
  if (!mailboxResults.length) {
    return c.text("mailbox not found or access denied", 404)
  }

  const id = c.env.MAILBOX_REALTIME.idFromName(`mailbox:${mailboxId}`)
  const stub = c.env.MAILBOX_REALTIME.get(id)

  return stub.fetch("https://mailbox-realtime/ws", c.req.raw)
})

// Mailboxes CRUD (all protected)

// List mailboxes (folders) for user (protected)
app.get("/api/mailboxes", authMiddleware, async (c) => {
  const user = getUser(c)

  const { results } = await c.env.DB.prepare(
    `SELECT id, name, is_system, created_at FROM mailboxes WHERE user_id = ? ORDER BY is_system DESC, name ASC`
  ).bind(user.id).all() as { results: MailboxRow[] }

  return c.json({ mailboxes: results })
})

// Create mailbox (folder) (protected)
app.post("/api/mailboxes", authMiddleware, async (c) => {
  const user = getUser(c)
  const body = await c.req.json<{ name: string }>()
  if (!body.name) {
    return c.json({ error: "missing name" }, 400)
  }

  // Only allow non-system folders via API
  const name = body.name.toLowerCase()

  // Check for duplicate
  const existing = await c.env.DB.prepare(
    `SELECT id FROM mailboxes WHERE user_id = ? AND name = ?`
  ).bind(user.id, name).first()
  if (existing) {
    return c.json({ error: "folder already exists" }, 409)
  }

  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    `INSERT INTO mailboxes (id, user_id, name, is_system) VALUES (?, ?, ?, 0)`
  ).bind(id, user.id, name).run()

  return c.json({ mailbox: { id, name, is_system: 0 } }, 201)
})

// Get single mailbox (folder) (protected)
app.get("/api/mailboxes/:id", authMiddleware, async (c) => {
  const user = getUser(c)
  const mailboxId = c.req.param("id")

  const { results } = await c.env.DB.prepare(
    `SELECT id, name, is_system, created_at FROM mailboxes WHERE id = ? AND user_id = ?`
  ).bind(mailboxId, user.id).all() as { results: MailboxRow[] }

  if (!results.length) {
    return c.json({ error: "mailbox not found" }, 404)
  }

  return c.json({ mailbox: results[0] })
})

// Delete mailbox (folder) (protected)
app.delete("/api/mailboxes/:id", authMiddleware, async (c) => {
  const user = getUser(c)
  const mailboxId = c.req.param("id")

  const { results } = await c.env.DB.prepare(
    `SELECT id, name, is_system FROM mailboxes WHERE id = ? AND user_id = ?`
  ).bind(mailboxId, user.id).all() as { results: MailboxRow[] }

  if (!results.length) {
    return c.json({ error: "mailbox not found" }, 404)
  }

  // Prevent deletion of system folders
  if (results[0].is_system) {
    return c.json({ error: "cannot delete system folder" }, 403)
  }

  await c.env.DB.prepare(
    `DELETE FROM mailboxes WHERE id = ?`
  ).bind(mailboxId).run()

  return c.json({ ok: true })
})

// Export DO class for wrangler
export { MailboxRealtime }

// Types
interface MessageRow {
  id: string
  mailbox_id: string
  thread_id: string | null
  provider_message_id: string | null
  from_addr: string
  subject: string | null
  preview: string | null
  r2_raw_key: string
  received_at: string
  read_at: string | null
  created_at: string
}

interface MailboxRow {
  id: string
  name: string
  is_system: number
  created_at: string
}

interface UserRow {
  id: string
  address: string
  password_hash: string
  salt: string
}

interface RefreshTokenRow {
  user_id: string
  address: string
}

function normalizeDisplayName(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === "Your Name") {
    return undefined
  }
  return trimmed.slice(0, 128)
}

function displayNameFromAddress(address: string): string {
  const local = address.split("@")[0] ?? address
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || address
}

export default app
