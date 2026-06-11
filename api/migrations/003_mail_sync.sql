ALTER TABLE raw_inbound_mails
    ADD COLUMN blob_key TEXT,
    ADD COLUMN raw_sha256 TEXT,
    ADD COLUMN raw_size BIGINT;

ALTER TABLE raw_inbound_mails
    ALTER COLUMN raw_mime DROP NOT NULL;

CREATE INDEX idx_raw_inbound_mails_blob_key
    ON raw_inbound_mails(blob_key)
    WHERE blob_key IS NOT NULL;

ALTER TABLE raw_inbound_mails
    ADD CONSTRAINT raw_inbound_mails_raw_sha256_key UNIQUE (raw_sha256);

ALTER TABLE mailboxes
    ADD COLUMN system_role TEXT,
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE mailboxes
SET
    system_role = CASE lower(name)
        WHEN 'inbox' THEN 'inbox'
        WHEN 'archive' THEN 'archive'
        WHEN 'trash' THEN 'trash'
        WHEN 'spam' THEN 'spam'
        WHEN 'sent' THEN 'sent'
        WHEN 'drafts' THEN 'drafts'
        ELSE NULL
    END,
    sort_order = CASE lower(name)
        WHEN 'inbox' THEN 0
        WHEN 'sent' THEN 10
        WHEN 'drafts' THEN 20
        WHEN 'archive' THEN 30
        WHEN 'trash' THEN 40
        WHEN 'spam' THEN 50
        ELSE sort_order
    END
WHERE is_system = TRUE;

CREATE UNIQUE INDEX idx_mailboxes_user_system_role
    ON mailboxes(user_id, system_role)
    WHERE system_role IS NOT NULL;

CREATE TABLE messages (
    id                   BIGINT PRIMARY KEY,
    user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    raw_inbound_mail_id  BIGINT REFERENCES raw_inbound_mails(id) ON DELETE SET NULL,
    raw_key              TEXT NOT NULL,
    raw_sha256           TEXT NOT NULL,
    raw_size             BIGINT NOT NULL,
    message_id_header    TEXT,
    thread_id            TEXT,
    from_addr            TEXT,
    from_name            TEXT,
    subject              TEXT,
    preview              TEXT,
    received_at          TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, raw_sha256)
);

CREATE INDEX idx_messages_user_received
    ON messages(user_id, received_at DESC);

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
