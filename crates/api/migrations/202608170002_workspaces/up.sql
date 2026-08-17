-- Workspaces: one owner and one membership list for both kinds of email unit.
--
-- 202608170001 gave receivers and senders a member table each, and kept
-- `scope`/`owner_user_id`/`owner_group_id` on the units themselves. That put
-- the same question — "who may administer this thing and bind addresses to
-- it?" — in four places, answered by two near-identical `access_for`
-- implementations.
--
-- A workspace answers it once. Units belong to a workspace, members belong to
-- a workspace, and `workspaces.kind` carries the special case that `scope`
-- used to: a `system` workspace counts everyone as a member, which is what
-- keeps open signup under MAIL_DOMAIN working.
--
-- Consequence worth stating plainly: collapsing two membership axes into one
-- widens access. Somebody who was a member of a user's receiver but not their
-- sender ends up with both, because those units now share a workspace.

CREATE TABLE workspaces (
    id            BIGINT PRIMARY KEY,
    -- `system`   — the deployment's own workspace; everyone is a member.
    -- `personal` — auto-provisioned, exactly one per user.
    -- `team`     — created explicitly and shared through workspace_members.
    kind          TEXT NOT NULL DEFAULT 'team'
                      CHECK (kind IN ('system', 'personal', 'team')),
    name          TEXT NOT NULL,
    owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workspaces_kind_owner_chk CHECK (
        (kind = 'system' AND owner_user_id IS NULL)
        OR (kind <> 'system' AND owner_user_id IS NOT NULL)
    )
);

-- Exactly one system workspace, and at most one personal workspace per user.
CREATE UNIQUE INDEX idx_workspaces_system
    ON workspaces((kind)) WHERE kind = 'system';

CREATE UNIQUE INDEX idx_workspaces_personal_owner
    ON workspaces(owner_user_id) WHERE kind = 'personal';

CREATE TABLE workspace_members (
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- The system workspace exists unconditionally: `ensure_system_receiver` needs
-- somewhere to put the deployment receiver on first boot, before any user has
-- registered anything. Its id is built the way `ids.rs` builds snowflakes
-- (millis since the 2024-01-01 epoch, shifted past the node and sequence bits)
-- with node 1023 — machine 31 / node 31, outside any configured range — so it
-- can never collide with a runtime-generated id.
INSERT INTO workspaces (id, kind, name, owner_user_id)
VALUES (
    ((((EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - 1704067200000) << 22) | (1023 << 12)),
    'system',
    'Deployment',
    NULL
);

-- One personal workspace per user. Reusing the user's own snowflake as the
-- workspace id is the idiom 202606180001 used for addresses: ids come from one
-- monotonic generator, so a future workspace id can never equal a past user id.
INSERT INTO workspaces (id, kind, name, owner_user_id, created_at)
SELECT id, 'personal', username, id, created_at
FROM users;

-- Owners administer their own workspace.
INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
SELECT id, owner_user_id, 'admin', created_at
FROM workspaces
WHERE kind = 'personal';

ALTER TABLE email_receivers
    ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE email_senders
    ADD COLUMN workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE email_receivers
SET workspace_id = workspaces.id
FROM workspaces
WHERE workspaces.kind = 'system' AND email_receivers.scope = 'system';

UPDATE email_receivers
SET workspace_id = workspaces.id
FROM workspaces
WHERE workspaces.kind = 'personal'
  AND workspaces.owner_user_id = email_receivers.owner_user_id;

UPDATE email_senders
SET workspace_id = workspaces.id
FROM workspaces
WHERE workspaces.kind = 'system' AND email_senders.scope = 'system';

UPDATE email_senders
SET workspace_id = workspaces.id
FROM workspaces
WHERE workspaces.kind = 'personal'
  AND workspaces.owner_user_id = email_senders.owner_user_id;

-- Only `scope = 'group'` rows can land here, and neither create path can
-- produce one (both hardcode `scope = 'user'`). Refusing to migrate is the
-- right failure: the alternative — sweeping them into the system workspace —
-- would silently hand every user administrative access to them.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM email_receivers WHERE workspace_id IS NULL)
       OR EXISTS (SELECT 1 FROM email_senders WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION
            'email unit rows have no owning workspace (scope = ''group''?); '
            'assign them a workspace manually before migrating';
    END IF;
END $$;

-- Membership moves up to the workspace. Where the two unit member lists
-- disagree about a user's role, the stronger one wins.
INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
SELECT
    workspace_id,
    user_id,
    CASE WHEN bool_or(role = 'admin') THEN 'admin' ELSE 'member' END,
    MIN(created_at)
FROM (
    SELECT r.workspace_id, m.user_id, m.role, m.created_at
    FROM email_receiver_members m
    JOIN email_receivers r ON r.id = m.receiver_id
    UNION ALL
    SELECT s.workspace_id, m.user_id, m.role, m.created_at
    FROM email_sender_members m
    JOIN email_senders s ON s.id = m.sender_id
) AS unit_members
GROUP BY workspace_id, user_id
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET role = CASE
    WHEN workspace_members.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'
    ELSE 'member'
END;

DROP TABLE email_receiver_members;
DROP TABLE email_sender_members;

-- The workspace is now the only owner. `scope` is replaced by
-- `workspaces.kind`, `owner_user_id` by the workspace's own owner (units still
-- cascade on user deletion, now through the personal workspace), and
-- `owner_group_id` — reserved for group controls that never arrived — by the
-- workspace itself, which is what a group was going to be.
ALTER TABLE email_receivers
    ALTER COLUMN workspace_id SET NOT NULL,
    DROP COLUMN scope,
    DROP COLUMN owner_user_id,
    DROP COLUMN owner_group_id;

ALTER TABLE email_senders
    ALTER COLUMN workspace_id SET NOT NULL,
    DROP COLUMN scope,
    DROP COLUMN owner_user_id,
    DROP COLUMN owner_group_id;

CREATE INDEX idx_email_receivers_workspace ON email_receivers(workspace_id);
CREATE INDEX idx_email_senders_workspace ON email_senders(workspace_id);
