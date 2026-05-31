// @generated — keep in sync with migrations/00000000000000_initial/up.sql

diesel::table! {
    users (id) {
        id         -> Int8,
        kratos_id  -> Uuid,
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

diesel::table! {
    messages (id) {
        id          -> Int8,
        mailbox_id  -> Int8,
        thread_id   -> Nullable<Int8>,
        from_addr   -> Varchar,
        subject     -> Nullable<Text>,
        preview     -> Nullable<Text>,
        body_text   -> Nullable<Text>,
        received_at -> Timestamptz,
        read_at     -> Nullable<Timestamptz>,
        created_at  -> Timestamptz,
    }
}

diesel::joinable!(mailboxes -> users (user_id));
diesel::joinable!(messages -> mailboxes (mailbox_id));

diesel::allow_tables_to_appear_in_same_query!(users, mailboxes, messages);
