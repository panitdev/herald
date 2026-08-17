-- Reverse the workspace collapse: ownership and membership move back onto the
-- units themselves. This is lossy in one direction — a workspace's members are
-- copied onto *every* unit in it, because the per-unit lists they were merged
-- from no longer exist.

ALTER TABLE email_receivers
    ADD COLUMN scope          TEXT NOT NULL DEFAULT 'system'
                                  CHECK (scope IN ('system', 'user', 'group')),
    ADD COLUMN owner_user_id  BIGINT REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN owner_group_id BIGINT;

ALTER TABLE email_senders
    ADD COLUMN scope          TEXT NOT NULL DEFAULT 'system'
                                  CHECK (scope IN ('system', 'user', 'group')),
    ADD COLUMN owner_user_id  BIGINT REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN owner_group_id BIGINT;

UPDATE email_receivers
SET scope = CASE WHEN workspaces.kind = 'system' THEN 'system' ELSE 'user' END,
    owner_user_id = workspaces.owner_user_id
FROM workspaces
WHERE workspaces.id = email_receivers.workspace_id;

UPDATE email_senders
SET scope = CASE WHEN workspaces.kind = 'system' THEN 'system' ELSE 'user' END,
    owner_user_id = workspaces.owner_user_id
FROM workspaces
WHERE workspaces.id = email_senders.workspace_id;

ALTER TABLE email_receivers
    ADD CONSTRAINT email_receivers_scope_owner_chk CHECK (
        (scope = 'system' AND owner_user_id IS NULL AND owner_group_id IS NULL)
        OR (scope = 'user' AND owner_user_id IS NOT NULL AND owner_group_id IS NULL)
        OR (scope = 'group' AND owner_group_id IS NOT NULL AND owner_user_id IS NULL)
    );

ALTER TABLE email_senders
    ADD CONSTRAINT email_senders_scope_owner_chk CHECK (
        (scope = 'system' AND owner_user_id IS NULL AND owner_group_id IS NULL)
        OR (scope = 'user' AND owner_user_id IS NOT NULL AND owner_group_id IS NULL)
        OR (scope = 'group' AND owner_group_id IS NOT NULL AND owner_user_id IS NULL)
    );

CREATE INDEX idx_email_receivers_owner_user
    ON email_receivers(owner_user_id)
    WHERE owner_user_id IS NOT NULL;

CREATE INDEX idx_email_senders_owner_user
    ON email_senders(owner_user_id)
    WHERE owner_user_id IS NOT NULL;

CREATE INDEX idx_email_senders_scope_active
    ON email_senders(scope, is_active);

CREATE TABLE email_receiver_members (
    receiver_id BIGINT NOT NULL REFERENCES email_receivers(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (receiver_id, user_id)
);

CREATE INDEX idx_email_receiver_members_user ON email_receiver_members(user_id);

CREATE TABLE email_sender_members (
    sender_id  BIGINT NOT NULL REFERENCES email_senders(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (sender_id, user_id)
);

CREATE INDEX idx_email_sender_members_user ON email_sender_members(user_id);

INSERT INTO email_receiver_members (receiver_id, user_id, role, created_at)
SELECT r.id, m.user_id, m.role, m.created_at
FROM workspace_members m
JOIN email_receivers r ON r.workspace_id = m.workspace_id;

INSERT INTO email_sender_members (sender_id, user_id, role, created_at)
SELECT s.id, m.user_id, m.role, m.created_at
FROM workspace_members m
JOIN email_senders s ON s.workspace_id = m.workspace_id;

DROP INDEX idx_email_senders_workspace;
DROP INDEX idx_email_receivers_workspace;

ALTER TABLE email_receivers DROP COLUMN workspace_id;
ALTER TABLE email_senders DROP COLUMN workspace_id;

DROP TABLE workspace_members;
DROP TABLE workspaces;
