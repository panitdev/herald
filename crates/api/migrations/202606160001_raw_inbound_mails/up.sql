CREATE TABLE users (
    id          BIGINT PRIMARY KEY,
    kratos_id   UUID NOT NULL UNIQUE,
    username    VARCHAR NOT NULL UNIQUE,
    address     VARCHAR NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_kratos_id
    ON users(kratos_id);

CREATE TABLE raw_inbound_mails (
    id           BIGINT PRIMARY KEY,
    blob_key     TEXT NOT NULL,
    raw_sha256   TEXT NOT NULL UNIQUE,
    raw_size     BIGINT NOT NULL,
    r2_key       TEXT,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error        TEXT
);

CREATE INDEX idx_raw_inbound_mails_unprocessed
    ON raw_inbound_mails(received_at)
    WHERE processed_at IS NULL;

CREATE INDEX idx_raw_inbound_mails_blob_key
    ON raw_inbound_mails(blob_key);

CREATE INDEX idx_raw_inbound_mails_r2_key
    ON raw_inbound_mails(r2_key)
    WHERE r2_key IS NOT NULL;

CREATE TABLE mailboxes (
    id           BIGINT PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         VARCHAR NOT NULL,
    is_system    BOOLEAN NOT NULL DEFAULT FALSE,
    system_role  TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE INDEX idx_mailboxes_user_id
    ON mailboxes(user_id);

CREATE UNIQUE INDEX idx_mailboxes_user_system_role
    ON mailboxes(user_id, system_role)
    WHERE system_role IS NOT NULL;

CREATE TABLE messages (
    id                   BIGINT PRIMARY KEY,
    raw_inbound_mail_id  BIGINT NOT NULL UNIQUE REFERENCES raw_inbound_mails(id) ON DELETE CASCADE,
    message_id_header    TEXT,
    thread_id            TEXT,
    from_addr            TEXT,
    from_name            TEXT,
    subject              TEXT,
    preview              TEXT,
    received_at          TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_received
    ON messages(received_at DESC);

CREATE TABLE message_recipients (
    id           BIGINT PRIMARY KEY,
    message_id   BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,
    address      TEXT NOT NULL,
    display_name TEXT
);

CREATE INDEX idx_message_recipients_message
    ON message_recipients(message_id);

CREATE TABLE message_mailboxes (
    message_id   BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    mailbox_id   BIGINT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    relation     TEXT NOT NULL DEFAULT 'location',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(message_id, mailbox_id)
);

CREATE INDEX idx_message_mailboxes_mailbox
    ON message_mailboxes(mailbox_id);

CREATE TABLE attachments (
    id           BIGINT PRIMARY KEY,
    message_id   BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename     TEXT,
    content_type TEXT,
    size         BIGINT,
    content_id   TEXT,
    inline       BOOLEAN NOT NULL DEFAULT FALSE,
    blob_key     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_message
    ON attachments(message_id);

CREATE TABLE sync_events (
    id          BIGINT PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL,
    object_id   BIGINT NOT NULL,
    op          TEXT NOT NULL,
    data_json   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_events_user_id_id
    ON sync_events(user_id, id);
