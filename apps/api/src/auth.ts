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

// ============================================
// Constants
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || "herald-jwt-secret-change-in-production"

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
    return payload as JWTPayload
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

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization")
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing authorization" })
  }
  
  const token = authHeader.slice(7)
  const payload = await verifyAccessToken(token)
  
  if (!payload) {
    throw new HTTPException(401, { message: "Invalid or expired token" })
  }
  
  c.set("user", { id: payload.sub, address: payload.address })
  await next()
}

export function getUser(c: Context): { id: string; address: string } {
  return c.get("user") as { id: string; address: string }
}