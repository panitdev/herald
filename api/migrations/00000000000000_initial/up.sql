CREATE TABLE users (
    id          BIGINT          PRIMARY KEY,
    kratos_id   UUID            NOT NULL UNIQUE,
    address     VARCHAR         NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE mailboxes (
    id          BIGINT          PRIMARY KEY,
    user_id     BIGINT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR         NOT NULL,
    is_system   BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE TABLE messages (
    id          BIGINT          PRIMARY KEY,
    mailbox_id  BIGINT          NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    thread_id   BIGINT,
    from_addr   VARCHAR         NOT NULL,
    subject     TEXT,
    preview     TEXT,
    body_text   TEXT,
    received_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mailboxes_user_id        ON mailboxes(user_id);
CREATE INDEX idx_messages_mailbox_received ON messages(mailbox_id, received_at DESC);
CREATE INDEX idx_messages_thread_id       ON messages(thread_id);
CREATE INDEX idx_users_kratos_id          ON users(kratos_id);
