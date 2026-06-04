// apps/api/src/auth.ts
// Authentication utilities: JWT, password hashing, middleware

import { Context, Next } from "hono"
import { HTTPException } from "hono/http-exception"
import { sign, verify } from "hono/jwt"
import type { JwtVariables } from "hono/jwt"

// ============================================
// Types
// ============================================

export type { JwtVariables }

export interface JWTPayload {
  sub: string // user_id
  address: string
  exp: number
  iat: number
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface AuthContext {
  user: {
    id: string
    address: string
  }
}

type AuthEnv = {
  DB: D1Database
  MAIL_DOMAIN?: string
  KRATOS_PUBLIC_URL?: string
}

type KratosSession = {
  identity?: {
    id?: string
    traits?: Record<string, unknown>
  }
}

type UserRow = {
  id: string
  address: string
  kratos_id: string | null
}

// ============================================
// Constants
// ============================================

const JWT_SECRET =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.JWT_SECRET ?? "herald-jwt-secret-change-in-production"

// ============================================
// Base64 helpers (for password/token hashing)
// ============================================

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  return atob(base64)
}

// ============================================
// JWT functions using hono/jwt
// ============================================

export async function createAccessToken(userId: string, address: string): Promise<string> {
  const payload = {
    sub: userId,
    address,
  }
  return await sign(payload, JWT_SECRET, "HS256")
}

export function createRefreshToken(userId: string): string {
  return crypto.randomUUID()
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const payload = await verify(token, JWT_SECRET, "HS256")
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

// ============================================
// Password hashing (PBKDF2)
// ============================================

const ITERATIONS = 100000
const DEFAULT_SALT = "herald-default-salt" // In production, use unique salts per user

async function hashPassword(password: string, salt: string = DEFAULT_SALT): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  )
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256
  )
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(derived)))
}

export async function hashPasswordWithSalt(password: string): Promise<{ hash: string; salt: string}> {
  const salt = crypto.randomUUID()
  return {
    hash: await hashPassword(password, salt),
    salt,
  }
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password, salt)
  return computed === hash
}

// ============================================
// Token hashing (SHA-256 for storage)
// ============================================

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token))
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(hashBuffer)))
}

// ============================================
// Auth middleware
// ============================================

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "")
}

function traitString(
  traits: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = traits?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function usernameFromSession(session: KratosSession): string | null {
  const username = traitString(session.identity?.traits, "username")?.toLowerCase()
  if (!username || !/^[a-z0-9._-]{1,64}$/.test(username)) return null
  return username
}

function addressFromUsername(username: string, mailDomain: string): string {
  return `${username}@${mailDomain.toLowerCase()}`
}

function kratosIdFromSession(session: KratosSession): string | null {
  const kratosId = session.identity?.id
  return typeof kratosId === "string" && kratosId.trim() ? kratosId : null
}

async function fetchKratosSession(c: Context): Promise<KratosSession | null> {
  const env = c.env as AuthEnv
  const kratosUrl = env.KRATOS_PUBLIC_URL
  const cookie = c.req.header("Cookie")
  if (!kratosUrl || !cookie) return null

  const res = await fetch(`${trimTrailingSlash(kratosUrl)}/sessions/whoami`, {
    headers: {
      Accept: "application/json",
      Cookie: cookie,
    },
  })
  if (!res.ok) return null

  return (await res.json()) as KratosSession
}

async function ensureLocalUser(
  c: Context,
  session: KratosSession
): Promise<UserRow | null> {
  const env = c.env as AuthEnv
  const mailDomain = env.MAIL_DOMAIN ?? "panit.dev"
  const kratosId = kratosIdFromSession(session)
  const username = usernameFromSession(session)
  if (!kratosId || !username) return null

  const byKratosId = await env.DB.prepare(
    `SELECT id, address, kratos_id FROM users WHERE kratos_id = ?`
  ).bind(kratosId).first<UserRow>()
  if (byKratosId) return byKratosId

  const address = addressFromUsername(username, mailDomain)

  const existing = await env.DB.prepare(
    `SELECT id, address, kratos_id FROM users WHERE address = ?`
  ).bind(address).first<UserRow>()

  if (existing) {
    if (existing.kratos_id && existing.kratos_id !== kratosId) return null

    await env.DB.prepare(
      `UPDATE users SET kratos_id = ? WHERE id = ? AND kratos_id IS NULL`
    ).bind(kratosId, existing.id).run()

    return { ...existing, kratos_id: kratosId }
  }

  const id = crypto.randomUUID()

  try {
    await env.DB.prepare(
      `INSERT INTO users (id, address, password_hash, salt, kratos_id) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, address, "kratos-managed", kratosId, kratosId).run()

    await env.DB.prepare(
      `INSERT INTO mailboxes (id, user_id, name, is_system) VALUES (?, ?, 'inbox', 1), (?, ?, 'sent', 1), (?, ?, 'archive', 1), (?, ?, 'trash', 1), (?, ?, 'spam', 1)`
    ).bind(
      crypto.randomUUID(), id,
      crypto.randomUUID(), id,
      crypto.randomUUID(), id,
      crypto.randomUUID(), id,
      crypto.randomUUID(), id,
    ).run()

    return { id, address, kratos_id: kratosId }
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      const linked = await env.DB.prepare(
        `SELECT id, address, kratos_id FROM users WHERE kratos_id = ?`
      ).bind(kratosId).first<UserRow>()
      if (linked) return linked

      const addressMatch = await env.DB.prepare(
        `SELECT id, address, kratos_id FROM users WHERE address = ?`
      ).bind(address).first<UserRow>()
      if (!addressMatch || addressMatch.kratos_id) return null

      await env.DB.prepare(
        `UPDATE users SET kratos_id = ? WHERE id = ? AND kratos_id IS NULL`
      ).bind(kratosId, addressMatch.id).run()

      return { ...addressMatch, kratos_id: kratosId }
    }
    throw e
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization")

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    const payload = await verifyAccessToken(token)

    if (payload) {
      c.set("user", { id: payload.sub, address: payload.address })
      await next()
      return
    }
  }

  const session = await fetchKratosSession(c)
  const user = session ? await ensureLocalUser(c, session) : null
  if (!user) {
    throw new HTTPException(401, { message: "Missing or invalid session" })
  }

  c.set("user", user)
  await next()
}

export function getUser(c: Context): { id: string; address: string } {
  return c.get("user") as { id: string; address: string }
}
