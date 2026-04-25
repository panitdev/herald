-- migrations/002_auth.sql
-- Add authentication tables and user ownership
-- Run with: wrangler d1 migrations apply herald-database --local --remote

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- API tokens table (for programmatic access)
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Add user_id to mailboxes (mailbox ownership)
-- SQLite D1 doesn't support ADD COLUMN with NOT NULL on existing tables
-- So we add it as nullable first, then update existing rows, then add NOT NULL
ALTER TABLE mailboxes ADD COLUMN user_id TEXT;
-- Note: Foreign key constraint not enforced at DB level in SQLite

-- Add index for mailboxes by user
CREATE INDEX IF NOT EXISTS idx_mailboxes_user ON mailboxes(user_id);

-- Add index for api_tokens lookup
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);

-- Add index for refresh_tokens lookup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);