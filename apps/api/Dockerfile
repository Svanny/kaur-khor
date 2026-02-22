FROM rust:1.85-bookworm AS build
WORKDIR /app

COPY apps/api/Cargo.toml apps/api/Cargo.toml
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations

WORKDIR /app/apps/api
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd -u 10001 -m app
WORKDIR /srv
COPY --from=build /app/apps/api/target/release/banji-api /usr/local/bin/banji-api
USER app
EXPOSE 8080
CMD ["banji-api"]
