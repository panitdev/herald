ALTER INDEX idx_users_identity_id RENAME TO idx_users_kratos_id;
ALTER TABLE users RENAME COLUMN identity_id TO kratos_id;
