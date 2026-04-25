-- migrations/001_init.sql
-- Initial D1 schema for Herald
-- Run with: wrangler d1 migrations apply herald-database --local --remote

-- Mailboxes table (user email addresses)
CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Messages table (email metadata)
CREATE TABLE IF NOT EXISTS messages (
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

-- Index for listing messages by mailbox
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_received
ON messages (mailbox_id, received_at DESC);

-- Attachments table
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  r2_key TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);