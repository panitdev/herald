# syntax=docker/dockerfile:1.7

FROM rust:1-trixie AS chef
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        clang \
        libpq-dev \
        libssl-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked

FROM chef AS planner

COPY Cargo.toml Cargo.lock ./
COPY api/Cargo.toml api/Cargo.toml

RUN mkdir -p api/src \
    && printf 'fn main() {}\n' > api/src/main.rs

RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS cacher

COPY --from=planner /app/recipe.json recipe.json

RUN --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo chef cook --release --locked --recipe-path recipe.json

FROM cacher AS builder

COPY Cargo.toml Cargo.lock ./
COPY api ./api

RUN --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release --locked -p api \
    && cp target/release/api /usr/local/bin/herald-api

FROM debian:trixie-slim AS runtime
WORKDIR /app

ENV RUST_LOG=info
ENV API_PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 api \
    && useradd --system --uid 1001 --gid api --home-dir /app api

COPY --from=builder /usr/local/bin/herald-api /usr/local/bin/herald-api

USER api

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["/usr/local/bin/herald-api"]
