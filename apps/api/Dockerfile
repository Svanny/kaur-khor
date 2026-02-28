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
