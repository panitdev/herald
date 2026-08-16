-- Inbound email receivers, and the wiring that turns a single hardcoded
-- serverbound receiver into registrable units.
--
-- Before this migration the inbound path was one global endpoint: the
-- Cloudflare worker authenticated with HERALD_INTERNAL_SECRET and every
-- delivered message was matched against *all* rows in `addresses`. That model
-- cannot survive user-registered receivers — whoever holds a receiver
-- credential could otherwise inject mail into anybody's inbox.
--
-- The unit model here mirrors `email_senders` deliberately: same scope/owner
-- columns, same config/secret split. There is no discriminator column: every
-- receiver is "something that POSTs /internal/mail/inbound with a bearer token",
-- and what varies (a staging endpoint today, Cloudflare provisioning state
-- later) belongs in `config`/`secret` or a table of its own.
CREATE TABLE email_receivers (
    id                 BIGINT PRIMARY KEY,
    -- Who is allowed to use this receiver.
    scope              TEXT NOT NULL DEFAULT 'system'
                           CHECK (scope IN ('system', 'user', 'group')),
    owner_user_id      BIGINT REFERENCES users(id) ON DELETE CASCADE,
    -- Reserved for upcoming group controls, mirroring email_senders.
    owner_group_id     BIGINT,
    display_name       TEXT NOT NULL,
    -- Mail domain this receiver accepts mail for. Addresses under this domain
    -- may be bound to it. NULL means the receiver is not pinned to a domain and
    -- can only receive for addresses bound to it explicitly.
    mail_domain        TEXT,
    -- Non-secret configuration. `worker_url` (when set) is the receiver's own
    -- staging endpoint used for R2 recovery.
    config             JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Secret configuration. `worker_token` authenticates herald -> worker calls
    -- against the receiver's staging endpoints. Never serialised to clients.
    secret             JSONB,
    -- SHA-256 of the bearer token the receiver uses for herald -> inbound auth.
    -- The plaintext is shown once at registration and never stored.
    inbound_token_hash TEXT NOT NULL UNIQUE,
    -- Last few characters of the plaintext token, so a user can tell their
    -- registered receivers apart without revealing the credential.
    inbound_token_hint TEXT NOT NULL DEFAULT '',
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_receivers_scope_owner_chk CHECK (
        (scope = 'system' AND owner_user_id IS NULL AND owner_group_id IS NULL)
        OR (scope = 'user' AND owner_user_id IS NOT NULL AND owner_group_id IS NULL)
        OR (scope = 'group' AND owner_group_id IS NOT NULL AND owner_user_id IS NULL)
    )
);

-- A domain has at most one receiver: inbound mail for an address must have one
-- unambiguous entry point, so domain claims are first-come.
CREATE UNIQUE INDEX idx_email_receivers_mail_domain
    ON email_receivers(mail_domain)
    WHERE mail_domain IS NOT NULL;

CREATE INDEX idx_email_receivers_owner_user
    ON email_receivers(owner_user_id)
    WHERE owner_user_id IS NOT NULL;

-- Sharing: membership governs who may administer a unit and bind addresses to
-- it. This is a different axis from `user_addresses`, which governs who
-- actually receives the mail delivered to an address.
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

-- Exactly one receiver and one sender per address. The relation is
-- many-addresses-to-one-unit (one worker catches a whole zone), so the FK
-- column on `addresses` *is* the uniqueness constraint.
ALTER TABLE addresses
    ADD COLUMN receiver_id BIGINT REFERENCES email_receivers(id) ON DELETE SET NULL,
    ADD COLUMN sender_id   BIGINT REFERENCES email_senders(id) ON DELETE SET NULL;

CREATE INDEX idx_addresses_receiver ON addresses(receiver_id) WHERE receiver_id IS NOT NULL;
CREATE INDEX idx_addresses_sender ON addresses(sender_id) WHERE sender_id IS NOT NULL;

-- Which receiver accepted a raw message. Delivery only matches addresses bound
-- to this receiver, so a receiver cannot deliver into addresses it does not own.
-- NULL means "ingested before receivers existed" and is treated as the system
-- receiver at delivery time.
ALTER TABLE raw_inbound_mails
    ADD COLUMN receiver_id BIGINT REFERENCES email_receivers(id) ON DELETE SET NULL;

CREATE INDEX idx_raw_inbound_mails_receiver
    ON raw_inbound_mails(receiver_id)
    WHERE receiver_id IS NOT NULL;

-- Deduplication is per receiver now. The same bytes legitimately arrive at two
-- different receivers (one message, two domains, two workers) and each delivery
-- is a separate fact; a global hash key would let whichever receiver arrived
-- second silently lose its copy.
ALTER TABLE raw_inbound_mails DROP CONSTRAINT raw_inbound_mails_raw_sha256_key;

CREATE UNIQUE INDEX raw_inbound_mails_raw_sha256_receiver_key
    ON raw_inbound_mails(raw_sha256, receiver_id);
