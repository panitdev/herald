// apps/api/src/auth.ts
// Authentication utilities: JWT, password hashing, middleware

import { Context, Next } from "hono"
import { HTTPException } from "hono/http-exception"

// ============================================
// Types
// ============================================

export interface JWTPayload {
  sub: string // user_id
  email: string
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
    email: string
  }
}

// ============================================
// Constants
// ============================================

const JWT_SECRET = "herald-jwt-secret-change-in-production"
const ACCESS_TOKEN_EXPIRY = 15 * 60 // 15 minutes in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 // 7 days in seconds

// ============================================
// Base64URL encoding/decoding
// ============================================

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const padding = base64.length % 4
  const padded = padding ? base64 + "====".slice(0, 4 - padding) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ============================================
// SHA-256 HMAC for JWT
// ============================================

async function signHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return base64UrlEncode(new Uint8Array(signature))
}

async function verifyHMAC(data: string, secret: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  const signatureBytes = base64UrlDecode(signature)
  return crypto.subtle.verify("HMAC", key, encoder.encode(data), signatureBytes)
}

// ============================================
// JWT functions
// ============================================

export function createAccessToken(userId: string, email: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: userId,
    email,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY,
  }
  
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })))
  const signatureInput = `${header}.${encodedPayload}`
  
  return `${signatureInput}.${signHMAC(signatureInput, JWT_SECRET) as unknown as string}`
}

export function createRefreshToken(userId: string): string {
  const token = crypto.randomUUID()
  return token // Return raw token, stored as hash
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  
  const [header, payload, signature] = parts
  
  // Verify signature
  const signatureInput = `${header}.${payload}`
  const isValid = await verifyHMAC(signatureInput, JWT_SECRET, signature)
  if (!isValid) return null
  
  // Parse payload
  const payloadData = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as JWTPayload
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000)
  if (payloadData.exp < now) return null
  
  return payloadData
}

// ============================================
// Password hashing (PBKDF2)
// ============================================

const SALT_LENGTH = 16
const ITERATIONS = 100000

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  
  // Derive key
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    ),
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"]
  )
  
  // Export key
  const keyBytes = await crypto.subtle.exportKey("raw", key)
  
  // Combine salt + hash
  const combined = new Uint8Array(salt.length + keyBytes.byteLength)
  combined.set(salt, 0)
  combined.set(new Uint8Array(keyBytes), salt.length)
  
  return base64UrlEncode(combined)
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const combined = base64UrlDecode(storedHash)
  
  const salt = combined.slice(0, SALT_LENGTH)
  const keyBytes = combined.slice(SALT_LENGTH)
  
  // Derive key with same salt
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    ),
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"]
  )
  
  const derivedKey = await crypto.subtle.exportKey("raw", key)
  
  // Compare timing-safely
  if (derivedKey.byteLength !== keyBytes.byteLength) return false
  
  const derivedBytes = new Uint8Array(derivedKey)
  let result = 0
  for (let i = 0; i < derivedBytes.length; i++) {
    result |= derivedBytes[i] ^ keyBytes[i]
  }
  return result === 0
}

// ============================================
// Token hash (for storage)
// ============================================

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token))
  return base64UrlEncode(new Uint8Array(hashBuffer))
}

// ============================================
// Auth middleware
// ============================================

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization")
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid authorization header" })
  }
  
  const token = authHeader.slice(7)
  const payload = await verifyAccessToken(token)
  
  if (!payload) {
    throw new HTTPException(401, { message: "Invalid or expired token" })
  }
  
  // Add user to context
  c.set("user", { id: payload.sub, email: payload.email })
  
  await next()
}

// ============================================
// Helper to get current user from context
// ============================================

export function getUser(c: Context): AuthContext["user"] {
  return c.get("user")
}