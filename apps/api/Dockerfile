<<<<<<< ours
<<<<<<< ours
FROM lukemathwalker/cargo-chef:latest-rust-1.91.0-slim-bookworm AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd -u 10001 -m app
WORKDIR /srv
COPY --from=builder /app/target/release/banji-api /srv/banji-api
COPY --from=builder /app/start.sh /srv/start.sh
RUN chmod +x /srv/banji-api /srv/start.sh && chown -R app:app /srv
USER app
EXPOSE 8080
CMD ["./start.sh"]
=======
FROM rust:1.91-bookworm AS build
=======
FROM lukemathwalker/cargo-chef:latest-rust-1.91.0-slim-bookworm AS chef
>>>>>>> theirs
RUN apt-get update \
    && apt-get install -y --no-install-recommends musl-tools ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN rustup target add x86_64-unknown-linux-musl
WORKDIR /app

ENV CC_x86_64_unknown_linux_musl=musl-gcc
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=musl-gcc
<<<<<<< ours

COPY apps/api/Cargo.toml apps/api/Cargo.toml
COPY apps/api/Cargo.lock apps/api/Cargo.lock
COPY apps/api/rust-toolchain.toml apps/api/rust-toolchain.toml
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations

WORKDIR /app/apps/api
RUN cargo build --release --target x86_64-unknown-linux-musl
RUN mkdir -p /runtime/etc/ssl/certs /runtime/tmp/banji-artifacts \
    && cp /etc/ssl/certs/ca-certificates.crt /runtime/etc/ssl/certs/ca-certificates.crt

FROM scratch
COPY --from=build /runtime/etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build --chown=10001:10001 /runtime/tmp /tmp
COPY --from=build --chown=10001:10001 /app/apps/api/target/x86_64-unknown-linux-musl/release/banji-api /banji-api
=======

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --target x86_64-unknown-linux-musl --recipe-path recipe.json
COPY . .
RUN cargo build --release --target x86_64-unknown-linux-musl
RUN mkdir -p /runtime/etc/ssl/certs /runtime/tmp/banji-artifacts \
    && cp /etc/ssl/certs/ca-certificates.crt /runtime/etc/ssl/certs/ca-certificates.crt

FROM scratch
COPY --from=builder /runtime/etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder --chown=10001:10001 /runtime/tmp /tmp
COPY --from=builder --chown=10001:10001 /app/target/x86_64-unknown-linux-musl/release/banji-api /banji-api
>>>>>>> theirs
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
USER 10001:10001
EXPOSE 8080
CMD ["/banji-api"]
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
