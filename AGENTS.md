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

The backend REST API lives in `apps/api/` and is built with **Hono** on
Cloudflare Workers. It uses D1 for relational data, R2 for raw email storage,
and a Durable Object for mailbox realtime events.

Run locally with `bun dev:api`.

## Browser interaction

Use `https://localhost.panit.dev` instead of `http://localhost:3000` for real
browser testing.
