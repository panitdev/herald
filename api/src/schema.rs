// @generated — keep in sync with migrations

diesel::table! {
    raw_inbound_mails (id) {
        id           -> Int8,
        raw_mime     -> Bytea,
        r2_key       -> Nullable<Text>,
        received_at  -> Timestamptz,
        processed_at -> Nullable<Timestamptz>,
        error        -> Nullable<Text>,
    }
}
