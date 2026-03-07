FROM lukemathwalker/cargo-chef:latest-rust-1.91.0-slim-bookworm AS chef
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release
RUN mkdir -p /runtime/etc/ssl/certs /runtime/tmp/banji-artifacts \
    && cp /etc/ssl/certs/ca-certificates.crt /runtime/etc/ssl/certs/ca-certificates.crt

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /
COPY --from=builder /runtime/etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder --chown=10001:10001 /runtime/tmp /tmp
COPY --from=builder --chown=10001:10001 /app/target/release/banji-api /banji-api
COPY --from=builder --chmod=0755 /app/start.sh /start.sh
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
USER 10001:10001
EXPOSE 8080
CMD ["/start.sh"]
