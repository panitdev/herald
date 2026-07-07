-- Kratos -> Surge migration: the column keeps the same UUID values (identity IDs are
-- preserved 1:1 across providers), only the provider-specific name changes.
ALTER TABLE users RENAME COLUMN kratos_id TO identity_id;
ALTER INDEX idx_users_kratos_id RENAME TO idx_users_identity_id;
