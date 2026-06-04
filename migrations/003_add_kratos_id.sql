-- Associate Herald users with Kratos identities.
ALTER TABLE users ADD COLUMN kratos_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kratos_id ON users(kratos_id);
