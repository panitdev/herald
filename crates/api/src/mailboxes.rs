use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::{
    error::AppError,
    ids::IdGen,
    models::mailbox::{Mailbox, NewMailbox},
    schema::mailboxes,
};

#[derive(Debug, Clone, Copy)]
pub struct SystemMailboxSpec {
    pub role: &'static str,
    pub name: &'static str,
    pub sort_order: i32,
}

pub const SYSTEM_MAILBOX_SPECS: [SystemMailboxSpec; 6] = [
    SystemMailboxSpec {
        role: "inbox",
        name: "Inbox",
        sort_order: 0,
    },
    SystemMailboxSpec {
        role: "sent",
        name: "Sent",
        sort_order: 10,
    },
    SystemMailboxSpec {
        role: "drafts",
        name: "Drafts",
        sort_order: 20,
    },
    SystemMailboxSpec {
        role: "archive",
        name: "Archive",
        sort_order: 30,
    },
    SystemMailboxSpec {
        role: "trash",
        name: "Trash",
        sort_order: 40,
    },
    SystemMailboxSpec {
        role: "spam",
        name: "Spam",
        sort_order: 50,
    },
];

#[derive(Debug, Clone)]
pub struct EnsuredSystemMailboxes {
    pub all: Vec<Mailbox>,
    pub created: Vec<Mailbox>,
}

pub async fn ensure_system_mailboxes(
    conn: &mut AsyncPgConnection,
    ids: &IdGen,
    address_id: i64,
) -> Result<EnsuredSystemMailboxes, AppError> {
    let existing: Vec<Mailbox> = mailboxes::table
        .filter(mailboxes::address_id.eq(address_id))
        .filter(mailboxes::system_role.is_not_null())
        .select(Mailbox::as_select())
        .load(conn)
        .await
        .map_err(|err| AppError::db(err, "mailboxes.ensure_system_mailboxes.load_existing"))?;

    let missing: Vec<NewMailbox<'_>> = SYSTEM_MAILBOX_SPECS
        .iter()
        .filter(|spec| {
            !existing
                .iter()
                .any(|mailbox| mailbox.system_role.as_deref() == Some(spec.role))
        })
        .map(|spec| NewMailbox {
            id: ids.next(),
            address_id,
            name: spec.name,
            is_system: true,
            system_role: Some(spec.role),
            sort_order: spec.sort_order,
        })
        .collect();

    let created_ids: Vec<i64> = missing.iter().map(|mailbox| mailbox.id).collect();

    if !missing.is_empty() {
        diesel::insert_into(mailboxes::table)
            .values(&missing)
            .on_conflict_do_nothing()
            .execute(conn)
            .await
            .map_err(|err| AppError::db(err, "mailboxes.ensure_system_mailboxes.insert_missing"))?;
    }

    let all = mailboxes::table
        .filter(mailboxes::address_id.eq(address_id))
        .filter(mailboxes::system_role.is_not_null())
        .order((mailboxes::sort_order.asc(), mailboxes::created_at.asc()))
        .select(Mailbox::as_select())
        .load(conn)
        .await
        .map_err(|err| AppError::db(err, "mailboxes.ensure_system_mailboxes.load_all"))?;

    let created = if created_ids.is_empty() {
        Vec::new()
    } else {
        all.iter()
            .filter(|mailbox| created_ids.contains(&mailbox.id))
            .cloned()
            .collect()
    };

    Ok(EnsuredSystemMailboxes { all, created })
}
