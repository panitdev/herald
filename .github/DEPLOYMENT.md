# Deployment

Production deploys run through GitHub Actions in `workflows/deploy.yml`.

## Triggers

- Pushes to `main`
- Manual runs through `workflow_dispatch`

The deploy job uses the `production` GitHub environment and runs these steps:

1. Install dependencies with `bun install --frozen-lockfile`
2. Typecheck and build the UI
3. Apply remote D1 migrations
4. Deploy the API Worker
5. Deploy the email Worker
6. Deploy the queue Worker
7. Deploy the UI Worker

## Required GitHub Secrets

Configure these secrets in the repository or `production` environment:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Cloudflare API token must be allowed to deploy the Workers in this repo and
apply D1 migrations for `herald-database`.

Runtime secrets such as `BREVO_API_KEY` or `RESEND_API_KEY` should stay in
Cloudflare Worker secrets. The deploy workflow publishes code and migrations; it
does not write Worker secrets.
