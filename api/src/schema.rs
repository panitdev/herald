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

diesel::table! {
    users (id) {
        id         -> Int8,
        kratos_id  -> Uuid,
        username   -> Varchar,
        address    -> Varchar,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    mailboxes (id) {
        id         -> Int8,
        user_id    -> Int8,
        name       -> Varchar,
        is_system  -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::joinable!(mailboxes -> users (user_id));
