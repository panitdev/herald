CREATE TABLE addresses (
    id          BIGINT PRIMARY KEY,
    address     VARCHAR NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_address
    ON addresses(address);

CREATE TABLE user_addresses (
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_id  BIGINT NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id, address_id)
);

CREATE INDEX idx_user_addresses_address_id
    ON user_addresses(address_id);

INSERT INTO addresses (id, address, created_at)
SELECT id, LOWER(address), created_at
FROM users
ON CONFLICT (address) DO NOTHING;

INSERT INTO user_addresses (user_id, address_id, created_at)
SELECT users.id, addresses.id, users.created_at
FROM users
JOIN addresses ON addresses.address = LOWER(users.address)
ON CONFLICT DO NOTHING;

ALTER TABLE mailboxes
    ADD COLUMN address_id BIGINT;

UPDATE mailboxes
SET address_id = user_addresses.address_id
FROM user_addresses
WHERE user_addresses.user_id = mailboxes.user_id;

ALTER TABLE mailboxes
    ALTER COLUMN address_id SET NOT NULL,
    ADD CONSTRAINT mailboxes_address_id_fkey
        FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_mailboxes_user_system_role;
DROP INDEX IF EXISTS idx_mailboxes_user_id;

ALTER TABLE mailboxes
    DROP CONSTRAINT IF EXISTS mailboxes_user_id_name_key,
    DROP COLUMN user_id,
    ADD CONSTRAINT mailboxes_address_id_name_key UNIQUE (address_id, name);

CREATE INDEX idx_mailboxes_address_id
    ON mailboxes(address_id);

CREATE UNIQUE INDEX idx_mailboxes_address_system_role
    ON mailboxes(address_id, system_role)
    WHERE system_role IS NOT NULL;
