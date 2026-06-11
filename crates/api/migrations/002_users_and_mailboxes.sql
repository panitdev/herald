CREATE TABLE users (
    id          BIGINT          PRIMARY KEY,
    kratos_id   UUID            NOT NULL UNIQUE,
    username    VARCHAR         NOT NULL UNIQUE,
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

CREATE INDEX idx_users_kratos_id    ON users(kratos_id);
CREATE INDEX idx_mailboxes_user_id  ON mailboxes(user_id);
