// apps/api/src/index.ts
// Hono HTTP API server

import { Hono } from "hono"
import type { Context } from "hono"
import { cors } from "hono/cors"
import { MailboxRealtime } from "./realtime"
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
  const body = await c.req.json<{ email: string; password: string }>()
  
  if (!body.email || !body.password) {
    return c.json({ error: "email and password required" }, 400)
  }
  
  if (body.password.length < 8) {
    return c.json({ error: "password must be at least 8 characters" }, 400)
  }
  
  const email = body.email.toLowerCase()
  const { hash: passwordHash, salt } = await hashPasswordWithSalt(body.password)
  const id = crypto.randomUUID()
  
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, salt) VALUES (?, ?, ?, ?)`
    ).bind(id, email, passwordHash, salt).run()
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      return c.json({ error: "email already exists" }, 409)
    }
    throw e
  }
  
  // Create tokens
  const tokens = await createTokens(c, id, email)
  
  return c.json({
    user: { id, email },
    ...tokens,
  }, 201)
})

// Login
app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>()
  
  if (!body.email || !body.password) {
    return c.json({ error: "email and password required" }, 400)
  }
  
  const email = body.email.toLowerCase()
  
  const { results } = await c.env.DB.prepare(
    `SELECT id, email, password_hash, salt FROM users WHERE email = ?`
  ).bind(email).all() as { results: UserRow[] }
  
  if (!results.length) {
    return c.json({ error: "invalid credentials" }, 401)
  }
  
  const user = results[0]
  const valid = await verifyPassword(body.password, user.salt, user.password_hash)
  
  if (!valid) {
    return c.json({ error: "invalid credentials" }, 401)
  }
  
  const tokens = await createTokens(c, user.id, user.email)
  
  return c.json({
    user: { id: user.id, email: user.email },
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
    `SELECT rt.user_id, u.email 
     FROM refresh_tokens rt 
     JOIN users u ON rt.user_id = u.id 
     WHERE rt.token_hash = ? AND rt.expires_at > datetime('now')`
  ).bind(tokenHash).all() as { results: RefreshTokenRow[] }
  
  if (!results.length) {
    return c.json({ error: "invalid or expired refresh token" }, 401)
  }
  
  const { user_id, email } = results[0]
  
  // Delete old refresh token
  await c.env.DB.prepare(
    `DELETE FROM refresh_tokens WHERE token_hash = ?`
  ).bind(tokenHash).run()
  
  // Create new tokens
  const tokens = await createTokens(c, user_id, email)
  
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
async function createTokens(c: Context, userId: string, email: string): Promise<TokenPair> {
  const accessToken = await createAccessToken(userId, email)
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
    `SELECT id, thread_id, from_addr, subject, preview, received_at, read_at
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

  const rawEmail = await c.env.MAIL_BUCKET.get(msgResults[0].r2_raw_key)
  if (!rawEmail) {
    return c.json({ error: "raw email not found" }, 404)
  }

  return new Response(rawEmail.body, {
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

// List mailboxes (protected)
app.get("/api/mailboxes", authMiddleware, async (c) => {
  const user = getUser(c)
  
  const { results } = await c.env.DB.prepare(
    `SELECT id, address, created_at FROM mailboxes WHERE user_id = ? ORDER BY created_at DESC`
  ).bind(user.id).all() as { results: MailboxRow[] }

  return c.json({ mailboxes: results })
})

// Create mailbox (protected)
app.post("/api/mailboxes", authMiddleware, async (c) => {
  const user = getUser(c)
  const body = await c.req.json<{ address: string }>()
  if (!body.address) {
    return c.json({ error: "missing address" }, 400)
  }

  const id = crypto.randomUUID()
  const address = body.address.toLowerCase()

  try {
    await c.env.DB.prepare(
      `INSERT INTO mailboxes (id, address, user_id) VALUES (?, ?, ?)`
    ).bind(id, address, user.id).run()
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      return c.json({ error: "address already exists" }, 409)
    }
    throw e
  }

  return c.json({ mailbox: { id, address } }, 201)
})

// Get single mailbox (protected)
app.get("/api/mailboxes/:id", authMiddleware, async (c) => {
  const user = getUser(c)
  const mailboxId = c.req.param("id")

  const { results } = await c.env.DB.prepare(
    `SELECT id, address, created_at FROM mailboxes WHERE id = ? AND user_id = ?`
  ).bind(mailboxId, user.id).all() as { results: MailboxRow[] }

  if (!results.length) {
    return c.json({ error: "mailbox not found" }, 404)
  }

  return c.json({ mailbox: results[0] })
})

// Delete mailbox (protected)
app.delete("/api/mailboxes/:id", authMiddleware, async (c) => {
  const user = getUser(c)
  const mailboxId = c.req.param("id")

  const { results } = await c.env.DB.prepare(
    `SELECT id FROM mailboxes WHERE id = ? AND user_id = ?`
  ).bind(mailboxId, user.id).all() as { results: MailboxRow[] }

  if (!results.length) {
    return c.json({ error: "mailbox not found" }, 404)
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
  address: string
  created_at: string
}

interface UserRow {
  id: string
  email: string
  password_hash: string
  salt: string
}

interface RefreshTokenRow {
  user_id: string
  email: string
}

export default app