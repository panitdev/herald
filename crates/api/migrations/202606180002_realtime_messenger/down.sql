DROP INDEX IF EXISTS idx_chat_messages_sender_client_mutation;
DROP INDEX IF EXISTS idx_chat_messages_conversation_created;
DROP TABLE IF EXISTS chat_messages;

DROP INDEX IF EXISTS idx_conversation_participants_user_active;
DROP TABLE IF EXISTS conversation_participants;

DROP INDEX IF EXISTS idx_conversations_updated_at;
DROP TABLE IF EXISTS conversations;
