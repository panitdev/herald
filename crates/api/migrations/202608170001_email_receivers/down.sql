DROP INDEX raw_inbound_mails_raw_sha256_receiver_key;
ALTER TABLE raw_inbound_mails ADD CONSTRAINT raw_inbound_mails_raw_sha256_key UNIQUE (raw_sha256);
ALTER TABLE raw_inbound_mails DROP COLUMN receiver_id;
ALTER TABLE addresses DROP COLUMN receiver_id, DROP COLUMN sender_id;
DROP TABLE email_sender_members;
DROP TABLE email_receiver_members;
DROP TABLE email_receivers;
