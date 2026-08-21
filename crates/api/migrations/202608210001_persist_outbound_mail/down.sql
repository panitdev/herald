ALTER TABLE messages
    DROP COLUMN IF EXISTS outbound_provider_message_id,
    DROP COLUMN IF EXISTS outbound_provider;
