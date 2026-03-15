FROM rust:1.91.0-slim-bookworm AS sqlx-builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates pkg-config \
    && rm -rf /var/lib/apt/lists/*
RUN cargo install sqlx-cli \
    --version 0.8.2 \
    --locked \
    --no-default-features \
    --features rustls,postgres

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      coreutils \
      curl \
      jq \
      openssl \
      postgresql-client \
      tar \
      xxd \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY --from=sqlx-builder /usr/local/cargo/bin/sqlx /usr/local/bin/sqlx
COPY apps/api/migrations /workspace/apps/api/migrations
COPY tool/ci/migrate_with_lock.sh /workspace/tool/ci/migrate_with_lock.sh
COPY tool/db /workspace/tool/db
COPY services/staging-db-ops/start.sh /start.sh

RUN chmod +x /start.sh \
    /workspace/tool/ci/migrate_with_lock.sh \
    /workspace/tool/db/restore_validate.sh \
    /workspace/tool/db/sqlx_migration_history_repair.sh

CMD ["/start.sh"]
