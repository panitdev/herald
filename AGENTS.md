# Agents & Conventions

## Conventional Commits

This project follows **Conventional Commits** (<https://www.conventionalcommits.org/>).

Available types: feat, fix, chore, refactor, docs, style, test, ci, perf
Scope must be one of: `api`, `auth`, `db`, `ui`, `mail`, `queue`, `infra`

```
<type>(<optional scope>): <short summary>

[optional body]

[optional footer(s)]
```

## Backend (REST API)

The backend lives in `crates/api/` and is a **Rust** binary built with **axum 0.8**.
It uses **PostgreSQL** (via diesel + diesel-async) for relational data, a local
filesystem blob store for raw email bodies and attachments, and an in-process
`RealtimeHub` that serves WebSocket connections for mailbox events.

Run locally with Docker Compose:

```
docker compose -f infra/compose.yml up
```

Database migrations are embedded in the binary and run automatically on startup
(`diesel_migrations`). To apply them against an external DB directly:

```
# local
bun db:migrate:local

# remote
bun db:migrate:remote
```

## Email Receiver (Cloudflare Workers)

The inbound email entry point lives in `packages/workers-receiver/` and runs as a
**Cloudflare Worker** (Hono). It receives raw RFC 822 messages and POSTs them to
the Rust API at `/internal/mail/inbound`. On failure it stages the raw email in
**R2** under `inbound/`; the Rust API replays these on startup via a recovery scan.

Run locally with:

```
bun dev:receiver
```

## Frontend (UI)

The web frontend lives in `packages/ui/` and is a **React 19** PWA built with
Vite 8, TanStack Router/Query, Radix UI, and Tailwind 4.

Run locally with:

```
bun dev:ui
```

## Browser interaction

Use `https://localhost.panit.dev` instead of `http://localhost:3000` for real
browser testing.
