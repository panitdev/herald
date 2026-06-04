-- migrations/002_add_archive.sql
-- Add archive mailbox for existing users who don't have one
-- Run with: bun run db:migrate:local

-- Add archive mailbox to existing users who don't have one
INSERT INTO mailboxes (id, user_id, name, is_system)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(6))),
  id,
  'archive',
  1
FROM users
WHERE NOT EXISTS (
  SELECT 1
  FROM mailboxes
  WHERE mailboxes.user_id = users.id
    AND mailboxes.name = 'archive'
);
