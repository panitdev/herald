# syntax=docker/dockerfile:1

FROM rust:1-bookworm AS builder

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY crates/api/Cargo.toml ./crates/api/Cargo.toml
COPY crates/api/migrations ./crates/api/migrations
COPY crates/api/src ./crates/api/src

RUN cargo build --release --locked -p herald-api

FROM debian:bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /usr/sbin/nologin herald \
    && install -d -o herald -g herald /data/blobs

WORKDIR /app

ENV API_PORT=3001
ENV BLOB_STORE_ROOT=/data/blobs

COPY --from=builder /app/target/release/herald-api /usr/local/bin/herald-api

USER herald

EXPOSE 3001

CMD ["herald-api"]
