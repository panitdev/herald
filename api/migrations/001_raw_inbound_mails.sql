-- migrations/001_raw_inbound_mails.sql
-- Raw inbound mail buffer: persist first, process asynchronously

CREATE TABLE raw_inbound_mails (
    id           BIGINT PRIMARY KEY,
    raw_mime     BYTEA NOT NULL,
    r2_key       TEXT,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error        TEXT
);

-- Fast lookup of unprocessed rows
CREATE INDEX idx_raw_inbound_mails_unprocessed
    ON raw_inbound_mails(received_at)
    WHERE processed_at IS NULL;

-- Deduplication during R2 recovery (r2_key is cleared after confirmed DELETE)
CREATE INDEX idx_raw_inbound_mails_r2_key
    ON raw_inbound_mails(r2_key)
    WHERE r2_key IS NOT NULL;
