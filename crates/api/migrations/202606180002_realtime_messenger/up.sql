CREATE TABLE conversations (
    id                  BIGINT PRIMARY KEY,
    kind                TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
    title               TEXT,
    direct_key          TEXT UNIQUE,
    created_by_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((kind = 'direct' AND direct_key IS NOT NULL) OR (kind = 'group' AND direct_key IS NULL))
);

CREATE INDEX idx_conversations_updated_at
    ON conversations(updated_at DESC);

CREATE TABLE conversation_participants (
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at         TIMESTAMPTZ,
    PRIMARY KEY(conversation_id, user_id)
);

CREATE INDEX idx_conversation_participants_user_active
    ON conversation_participants(user_id, conversation_id)
    WHERE left_at IS NULL;

CREATE TABLE chat_messages (
    id                  BIGINT PRIMARY KEY,
    conversation_id     BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body                TEXT NOT NULL,
    client_mutation_id  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_conversation_created
    ON chat_messages(conversation_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX idx_chat_messages_sender_client_mutation
    ON chat_messages(sender_user_id, client_mutation_id)
    WHERE client_mutation_id IS NOT NULL;
