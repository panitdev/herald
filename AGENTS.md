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

The backend REST API lives in `api/` and is built with **Axum** (Rust) on top of
PostgreSQL via `diesel` / `diesel-async`. Authentication uses **Ory Kratos**
sessions verified through `/sessions/whoami` — the same pattern as the sibling
`dispatch` project. Local `User` rows (and their default mailbox folders) are
lazily provisioned on first authenticated request.

Run locally with `cargo run -p api` (requires `DATABASE_URL` and a reachable
Kratos). See `.env.example` for configuration.

## Browser interaction

Use `https://localhost.panit.dev` instead of `http://localhost:3000` for real
browser testing. This is required for Kratos auth integration.
