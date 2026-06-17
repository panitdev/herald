// @generated — keep in sync with migrations

diesel::table! {
    conversations (id) {
        id                 -> Int8,
        kind               -> Text,
        title              -> Nullable<Text>,
        direct_key         -> Nullable<Text>,
        created_by_user_id -> Int8,
        created_at         -> Timestamptz,
        updated_at         -> Timestamptz,
    }
}

diesel::table! {
    conversation_participants (conversation_id, user_id) {
        conversation_id -> Int8,
        user_id         -> Int8,
        role            -> Text,
        joined_at       -> Timestamptz,
        left_at         -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    chat_messages (id) {
        id                 -> Int8,
        conversation_id    -> Int8,
        sender_user_id     -> Int8,
        body               -> Text,
        client_mutation_id -> Nullable<Text>,
        created_at         -> Timestamptz,
    }
}

diesel::table! {
    addresses (id) {
        id         -> Int8,
        address    -> Varchar,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    attachments (id) {
        id           -> Int8,
        message_id   -> Int8,
        filename     -> Nullable<Text>,
        content_type -> Nullable<Text>,
        size         -> Nullable<Int8>,
        content_id   -> Nullable<Text>,
        inline       -> Bool,
        blob_key     -> Nullable<Text>,
        created_at   -> Timestamptz,
    }
}

diesel::table! {
    email_senders (id) {
        id             -> Int8,
        scope          -> Text,
        owner_user_id  -> Nullable<Int8>,
        owner_group_id -> Nullable<Int8>,
        provider       -> Text,
        display_name   -> Text,
        mail_domain    -> Nullable<Text>,
        from_address   -> Nullable<Text>,
        config         -> Jsonb,
        secret         -> Nullable<Jsonb>,
        is_active      -> Bool,
        created_at     -> Timestamptz,
        updated_at     -> Timestamptz,
    }
}

diesel::table! {
    raw_inbound_mails (id) {
        id           -> Int8,
        blob_key     -> Text,
        raw_sha256   -> Text,
        raw_size     -> Int8,
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
        display_name -> Text,
        avatar_url -> Nullable<Text>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    user_addresses (user_id, address_id) {
        user_id    -> Int8,
        address_id -> Int8,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    mailboxes (id) {
        id         -> Int8,
        address_id -> Int8,
        name       -> Varchar,
        is_system  -> Bool,
        system_role -> Nullable<Text>,
        sort_order -> Int4,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    message_mailboxes (message_id, mailbox_id) {
        message_id -> Int8,
        mailbox_id -> Int8,
        relation   -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    message_recipients (id) {
        id           -> Int8,
        message_id   -> Int8,
        kind         -> Text,
        address      -> Text,
        display_name -> Nullable<Text>,
    }
}

diesel::table! {
    messages (id) {
        id                  -> Int8,
        raw_inbound_mail_id -> Int8,
        message_id_header   -> Nullable<Text>,
        thread_id           -> Nullable<Text>,
        from_addr           -> Nullable<Text>,
        from_name           -> Nullable<Text>,
        subject             -> Nullable<Text>,
        preview             -> Nullable<Text>,
        received_at         -> Timestamptz,
        created_at          -> Timestamptz,
    }
}

diesel::table! {
    sync_events (id) {
        id          -> Int8,
        user_id     -> Int8,
        object_type -> Text,
        object_id   -> Int8,
        op          -> Text,
        data_json   -> Nullable<Jsonb>,
        created_at  -> Timestamptz,
    }
}

diesel::joinable!(email_senders -> users (owner_user_id));
diesel::joinable!(mailboxes -> addresses (address_id));
diesel::joinable!(attachments -> messages (message_id));
diesel::joinable!(chat_messages -> conversations (conversation_id));
diesel::joinable!(chat_messages -> users (sender_user_id));
diesel::joinable!(conversation_participants -> conversations (conversation_id));
diesel::joinable!(conversation_participants -> users (user_id));
diesel::joinable!(conversations -> users (created_by_user_id));
diesel::joinable!(message_mailboxes -> mailboxes (mailbox_id));
diesel::joinable!(message_mailboxes -> messages (message_id));
diesel::joinable!(message_recipients -> messages (message_id));
diesel::joinable!(messages -> raw_inbound_mails (raw_inbound_mail_id));
diesel::joinable!(sync_events -> users (user_id));
diesel::joinable!(user_addresses -> addresses (address_id));
diesel::joinable!(user_addresses -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    addresses,
    attachments,
    chat_messages,
    conversation_participants,
    conversations,
    email_senders,
    mailboxes,
    message_mailboxes,
    message_recipients,
    messages,
    raw_inbound_mails,
    sync_events,
    user_addresses,
    users,
);
