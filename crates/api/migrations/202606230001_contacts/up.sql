CREATE TABLE contacts (
    owner_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, contact_user_id)
);

CREATE INDEX idx_contacts_owner ON contacts(owner_user_id);
