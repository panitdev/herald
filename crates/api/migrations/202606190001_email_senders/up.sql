-- Outbound email sender providers (Resend, AWS SES, ...).
--
-- A sender credential is intentionally decoupled from the rest of the system:
--   * The herald-api deployment may ship with no provider key at all, in which
--     case end users can register their own (scope = 'user').
--   * The deployment may also configure a shared provider via environment
--     variables (handled in code, not stored here) or as a 'system' row that is
--     usable by everyone.
--
-- The schema is access-control aware so that a sender can be owned by a single
-- user (e.g. someone sending from their own company domain on hosted herald)
-- and, in the future, by a group. No access-control enforcement beyond
-- ownership exists yet; the columns simply make the model forward compatible.
CREATE TABLE email_senders (
    id              BIGINT PRIMARY KEY,
    -- Who is allowed to use this sender.
    scope           TEXT NOT NULL DEFAULT 'system'
                        CHECK (scope IN ('system', 'user', 'group')),
    owner_user_id   BIGINT REFERENCES users(id) ON DELETE CASCADE,
    -- Reserved for upcoming group controls. No FK yet because groups do not
    -- exist as a table; kept nullable so the data model is group-aware now.
    owner_group_id  BIGINT,
    -- Provider adapter selector.
    provider        TEXT NOT NULL CHECK (provider IN ('resend', 'ses')),
    display_name    TEXT NOT NULL,
    -- Mail domain this sender is authorised to send from. NULL means the sender
    -- is not pinned to a single domain.
    mail_domain     TEXT,
    -- Optional default From address used when a caller does not specify one.
    from_address    TEXT,
    -- Non-secret provider configuration (e.g. SES region). Never contains keys.
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Secret provider credentials (API key, AWS secret access key, ...).
    -- Never serialised back to API clients.
    secret          JSONB,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ownership must line up with the declared scope.
    CONSTRAINT email_senders_scope_owner_chk CHECK (
        (scope = 'system' AND owner_user_id IS NULL AND owner_group_id IS NULL)
        OR (scope = 'user' AND owner_user_id IS NOT NULL AND owner_group_id IS NULL)
        OR (scope = 'group' AND owner_group_id IS NOT NULL AND owner_user_id IS NULL)
    )
);

-- Resolve senders available to a user quickly (own + system).
CREATE INDEX idx_email_senders_owner_user
    ON email_senders(owner_user_id)
    WHERE owner_user_id IS NOT NULL;

CREATE INDEX idx_email_senders_scope_active
    ON email_senders(scope, is_active);

CREATE INDEX idx_email_senders_mail_domain
    ON email_senders(mail_domain)
    WHERE mail_domain IS NOT NULL;
