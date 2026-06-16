# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1 — Build
# =============================================================================
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/ui/package.json ./packages/ui/package.json
RUN bun install --frozen-lockfile

WORKDIR /app/packages/ui

COPY packages/ui/.env.production ./
COPY packages/ui/components ./components
COPY packages/ui/hooks ./hooks
COPY packages/ui/lib ./lib
COPY packages/ui/public ./public
COPY packages/ui/src ./src
COPY packages/ui/styles ./styles
COPY packages/ui/components.json ./
COPY packages/ui/server.ts ./
COPY packages/ui/tsconfig.json ./
COPY packages/ui/vite.config.ts ./

ENV NODE_ENV=production

RUN bun run build


# =============================================================================
# Stage 2 — Production
# =============================================================================
FROM oven/bun:1-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=builder --chown=bun:bun /app/packages/ui/dist ./packages/ui/dist
COPY --from=builder --chown=bun:bun /app/packages/ui/server.ts ./packages/ui/server.ts

WORKDIR /app/packages/ui

USER bun

EXPOSE 3000

CMD ["bun", "server.ts"]
