ALTER TABLE messages
    ADD COLUMN outbound_provider TEXT,
    ADD COLUMN outbound_provider_message_id TEXT;
