use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, SelectableHelper};
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::{
    error::AppError,
    ids::IdGen,
    mailboxes::{ensure_system_mailboxes, EnsuredSystemMailboxes},
    models::{
        address::{Address, NewAddress},
        user_address::NewUserAddress,
    },
    receivers,
    schema::{addresses, user_addresses},
};

#[derive(Debug, Clone)]
pub struct EnsuredUserAddress {
    pub address: Address,
    pub mailboxes: EnsuredSystemMailboxes,
    pub granted: bool,
}

pub async fn ensure_user_address(
    conn: &mut AsyncPgConnection,
    ids: &IdGen,
    user_id: i64,
    address_value: &str,
) -> Result<EnsuredUserAddress, AppError> {
    let address = ensure_address(conn, ids, address_value).await?;

    let grant = NewUserAddress {
        user_id,
        address_id: address.id,
    };
    let granted = diesel::insert_into(user_addresses::table)
        .values(&grant)
        .on_conflict_do_nothing()
        .execute(conn)
        .await
        .map_err(|err| AppError::db(err, "addresses.ensure_user_address.grant_address"))?
        > 0;

    let mailboxes = ensure_system_mailboxes(conn, ids, address.id).await?;

    Ok(EnsuredUserAddress {
        address,
        mailboxes,
        granted,
    })
}

pub async fn user_has_address(
    conn: &mut AsyncPgConnection,
    user_id: i64,
    address_id: i64,
) -> Result<bool, AppError> {
    let existing = user_addresses::table
        .filter(user_addresses::user_id.eq(user_id))
        .filter(user_addresses::address_id.eq(address_id))
        .select(user_addresses::user_id)
        .first::<i64>(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "addresses.user_has_address.lookup"))?;

    Ok(existing.is_some())
}

pub async fn find_address(
    conn: &mut AsyncPgConnection,
    address_value: &str,
) -> Result<Option<Address>, AppError> {
    let address = addresses::table
        .filter(addresses::address.eq(address_value))
        .select(Address::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "addresses.find_address.lookup"))?;

    Ok(address)
}

/// Look up (or create) an address row, binding it to the receiver registered
/// for its domain. An address with no receiver cannot be delivered to by
/// anything except the system receiver, so the binding is resolved eagerly —
/// including for rows created before their domain had a receiver.
async fn ensure_address(
    conn: &mut AsyncPgConnection,
    ids: &IdGen,
    address_value: &str,
) -> Result<Address, AppError> {
    let receiver_id = match address_value.split_once('@') {
        Some((_, domain)) => receivers::find_for_domain(conn, domain)
            .await?
            .map(|receiver| receiver.id),
        None => None,
    };

    let new_address = NewAddress {
        id: ids.next(),
        address: address_value,
        receiver_id,
        sender_id: None,
    };

    let inserted = diesel::insert_into(addresses::table)
        .values(&new_address)
        .on_conflict_do_nothing()
        .returning(Address::as_returning())
        .get_result(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "addresses.ensure_address.insert"))?;

    if let Some(address) = inserted {
        return Ok(address);
    }

    let existing: Address = addresses::table
        .filter(addresses::address.eq(address_value))
        .select(Address::as_select())
        .first(conn)
        .await
        .map_err(|err| AppError::db(err, "addresses.ensure_address.lookup_existing"))?;

    if existing.receiver_id.is_none() && receiver_id.is_some() {
        return diesel::update(addresses::table.find(existing.id))
            .set(addresses::receiver_id.eq(receiver_id))
            .returning(Address::as_returning())
            .get_result(conn)
            .await
            .map_err(|err| AppError::db(err, "addresses.ensure_address.bind_receiver"));
    }

    Ok(existing)
}
