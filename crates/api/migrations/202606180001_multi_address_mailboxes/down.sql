DROP INDEX IF EXISTS idx_mailboxes_address_system_role;
DROP INDEX IF EXISTS idx_mailboxes_address_id;

ALTER TABLE mailboxes
    ADD COLUMN user_id BIGINT;

UPDATE mailboxes
SET user_id = user_addresses.user_id
FROM user_addresses
WHERE user_addresses.address_id = mailboxes.address_id;

ALTER TABLE mailboxes
    ALTER COLUMN user_id SET NOT NULL,
    ADD CONSTRAINT mailboxes_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE mailboxes
    DROP CONSTRAINT IF EXISTS mailboxes_address_id_name_key,
    DROP CONSTRAINT IF EXISTS mailboxes_address_id_fkey,
    DROP COLUMN address_id,
    ADD CONSTRAINT mailboxes_user_id_name_key UNIQUE (user_id, name);

CREATE INDEX idx_mailboxes_user_id
    ON mailboxes(user_id);

CREATE UNIQUE INDEX idx_mailboxes_user_system_role
    ON mailboxes(user_id, system_role)
    WHERE system_role IS NOT NULL;

DROP INDEX IF EXISTS idx_user_addresses_address_id;
DROP TABLE IF EXISTS user_addresses;

DROP INDEX IF EXISTS idx_addresses_address;
DROP TABLE IF EXISTS addresses;
