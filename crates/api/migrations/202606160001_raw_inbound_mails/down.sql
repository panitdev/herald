DROP INDEX IF EXISTS idx_sync_events_user_id_id;
DROP TABLE IF EXISTS sync_events;

DROP INDEX IF EXISTS idx_attachments_message;
DROP TABLE IF EXISTS attachments;

DROP INDEX IF EXISTS idx_message_mailboxes_mailbox;
DROP TABLE IF EXISTS message_mailboxes;

DROP INDEX IF EXISTS idx_message_recipients_message;
DROP TABLE IF EXISTS message_recipients;

DROP INDEX IF EXISTS idx_messages_received;
DROP TABLE IF EXISTS messages;

DROP INDEX IF EXISTS idx_mailboxes_user_system_role;
DROP INDEX IF EXISTS idx_mailboxes_user_id;
DROP TABLE IF EXISTS mailboxes;

DROP INDEX IF EXISTS idx_raw_inbound_mails_r2_key;
DROP INDEX IF EXISTS idx_raw_inbound_mails_blob_key;
DROP INDEX IF EXISTS idx_raw_inbound_mails_unprocessed;
DROP TABLE IF EXISTS raw_inbound_mails;

DROP INDEX IF EXISTS idx_users_kratos_id;
DROP TABLE IF EXISTS users;
