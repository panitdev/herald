-- migrations/002_add_archive.sql
-- Add archive mailbox for existing users who don't have one
-- Run with: pnpm db:migrate:local

-- Add archive mailbox to existing users who don't have one
INSERT INTO mailboxes (id, user_id, name, is_system)
SELECT crypto.randomUUID(), id, 'archive', 1
FROM users
WHERE id NOT IN (
  SELECT user_id FROM mailboxes WHERE name = 'archive'
);