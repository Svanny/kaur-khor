#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "error: $*" >&2
  exit 1
}

normalize_kebab() {
  local raw="$1"
  local out
  out="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//')"
  if [[ -z "$out" ]]; then
    fail "token '$raw' normalizes to empty; provide lowercase letters/digits/hyphens"
  fi
  printf '%s' "$out"
}

require_canonical_kebab() {
  local raw="$1"
  local name="$2"
  local normalized
  normalized="$(normalize_kebab "$raw")"
  if [[ "$normalized" != "$raw" ]]; then
    fail "$name must already be canonical kebab token; got '$raw', expected '$normalized'"
  fi
}

to_snake() {
  local kebab="$1"
  printf '%s' "${kebab//-/_}"
}

join_by() {
  local sep="$1"
  shift
  local first=1
  local value
  for value in "$@"; do
    if [[ $first -eq 1 ]]; then
      printf '%s' "$value"
      first=0
    else
      printf '%s%s' "$sep" "$value"
    fi
  done
}

upper() {
  printf '%s' "$1" | tr '[:lower:]' '[:upper:]'
}

BANJI_SYSTEM="${BANJI_SYSTEM-banji-core}"
BANJI_ENV="${BANJI_ENV-dev}"
BANJI_REGION="${BANJI_REGION-kh-pp}"
BANJI_TENANT="${BANJI_TENANT-default}"
BANJI_DEPLOYMENT_ID="${BANJI_DEPLOYMENT_ID-unknown}"

case "$BANJI_ENV" in
  dev|staging|prod) ;;
  *) fail "BANJI_ENV must be one of: dev, staging, prod (got '$BANJI_ENV')" ;;
esac

require_canonical_kebab "$BANJI_SYSTEM" "BANJI_SYSTEM"
require_canonical_kebab "$BANJI_REGION" "BANJI_REGION"
require_canonical_kebab "$BANJI_TENANT" "BANJI_TENANT"

SYSTEM_KEBAB="$BANJI_SYSTEM"
ENV_KEBAB="$BANJI_ENV"
REGION_KEBAB="$BANJI_REGION"
TENANT_KEBAB="$BANJI_TENANT"

SYSTEM_SNAKE="$(to_snake "$SYSTEM_KEBAB")"
ENV_SNAKE="$(to_snake "$ENV_KEBAB")"
REGION_SNAKE="$(to_snake "$REGION_KEBAB")"

SERVICES_RAW="${BANJI_SERVICES:-api,worker,scheduler}"
TOPICS_RAW="${BANJI_TOPICS:-inventory-updated,stock-adjusted,ranking-recomputed}"
QUEUES_RAW="${BANJI_QUEUES:-stock-update-jobs,ranking-jobs,notification-jobs}"
EXCHANGES_RAW="${BANJI_EXCHANGES:-events}"
DATABASES_RAW="${BANJI_DATABASES:-app,analytics}"
LOG_CHANNELS_RAW="${BANJI_LOG_CHANNELS:-app,audit,security,access}"
BUCKETS_RAW="${BANJI_BUCKETS:-main}"
CONSUMERS_RAW="${BANJI_CONSUMERS:-ranking-projector}"
CONSUMER_SERVICE_RAW="${BANJI_CONSUMER_SERVICE:-worker}"
ROUTING_DOMAIN_RAW="${BANJI_ROUTING_DOMAIN:-inventory}"
ROUTING_EVENT_RAW="${BANJI_ROUTING_EVENT:-stock-adjusted}"

IFS=',' read -r -a SERVICES <<< "$SERVICES_RAW"
IFS=',' read -r -a TOPICS <<< "$TOPICS_RAW"
IFS=',' read -r -a QUEUES <<< "$QUEUES_RAW"
IFS=',' read -r -a EXCHANGES <<< "$EXCHANGES_RAW"
IFS=',' read -r -a DATABASES <<< "$DATABASES_RAW"
IFS=',' read -r -a LOG_CHANNELS <<< "$LOG_CHANNELS_RAW"
IFS=',' read -r -a BUCKETS <<< "$BUCKETS_RAW"
IFS=',' read -r -a CONSUMERS <<< "$CONSUMERS_RAW"

CONSUMER_SERVICE="$(normalize_kebab "$CONSUMER_SERVICE_RAW")"
ROUTING_DOMAIN="$(normalize_kebab "$ROUTING_DOMAIN_RAW")"
ROUTING_EVENT="$(normalize_kebab "$ROUTING_EVENT_RAW")"

printf 'BANJI_SYSTEM_KEBAB=%s\n' "$SYSTEM_KEBAB"
printf 'BANJI_ENV_KEBAB=%s\n' "$ENV_KEBAB"
printf 'BANJI_REGION_KEBAB=%s\n' "$REGION_KEBAB"
printf 'BANJI_SYSTEM_SNAKE=%s\n' "$SYSTEM_SNAKE"
printf 'BANJI_ENV_SNAKE=%s\n' "$ENV_SNAKE"
printf 'BANJI_REGION_SNAKE=%s\n' "$REGION_SNAKE"
printf 'BANJI_TENANT_KEBAB=%s\n' "$TENANT_KEBAB"
printf 'BANJI_DEPLOYMENT_ID=%s\n' "$BANJI_DEPLOYMENT_ID"
printf 'METRICS_NAMESPACE=%s.%s\n' "$SYSTEM_KEBAB" "$ENV_KEBAB"
printf 'SECRET_PREFIX=%s/%s/%s\n' "$SYSTEM_KEBAB" "$ENV_KEBAB" "$REGION_KEBAB"
printf 'RABBIT_ROUTING_KEY=%s.%s\n' "$ROUTING_DOMAIN" "$ROUTING_EVENT"

for service_raw in "${SERVICES[@]}"; do
  service="$(normalize_kebab "$service_raw")"
  key="$(to_snake "$service")"
  service_name="$(join_by '-' "$SYSTEM_KEBAB" "$ENV_KEBAB" "$REGION_KEBAB" "$service")"
  key_upper="$(upper "$key")"
  printf 'SERVICE_NAME_%s=%s\n' "$key_upper" "$service_name"
  printf 'TRACE_SERVICE_NAME_%s=%s\n' "$key_upper" "$service_name"
  for channel_raw in "${LOG_CHANNELS[@]}"; do
    channel="$(normalize_kebab "$channel_raw")"
    channel_key="$(to_snake "$channel")"
    channel_key_upper="$(upper "$channel_key")"
    printf 'LOG_STREAM_KEY_%s_%s=%s/%s/%s/%s/%s\n' "$key_upper" "$channel_key_upper" "$SYSTEM_KEBAB" "$ENV_KEBAB" "$REGION_KEBAB" "$service" "$channel"
  done
  printf 'OBJECT_PREFIX_TEMPLATE_%s=%s/{yyyy}/{mm}/{dd}/\n' "$key_upper" "$service"
done

for topic_raw in "${TOPICS[@]}"; do
  topic="$(normalize_kebab "$topic_raw")"
  key="$(to_snake "$topic")"
  key_upper="$(upper "$key")"
  printf 'KAFKA_TOPIC_%s=%s.%s.%s\n' "$key_upper" "$SYSTEM_KEBAB" "$ENV_KEBAB" "$topic"
done

for consumer_raw in "${CONSUMERS[@]}"; do
  consumer="$(normalize_kebab "$consumer_raw")"
  key="$(to_snake "$consumer")"
  key_upper="$(upper "$key")"
  printf 'KAFKA_CONSUMER_GROUP_%s=%s.%s.%s.%s\n' "$key_upper" "$SYSTEM_KEBAB" "$ENV_KEBAB" "$CONSUMER_SERVICE" "$consumer"
done

for exchange_raw in "${EXCHANGES[@]}"; do
  exchange="$(normalize_kebab "$exchange_raw")"
  key="$(to_snake "$exchange")"
  key_upper="$(upper "$key")"
  printf 'RABBIT_EXCHANGE_%s=%s.%s.%s\n' "$key_upper" "$SYSTEM_KEBAB" "$ENV_KEBAB" "$exchange"
done

for queue_raw in "${QUEUES[@]}"; do
  queue="$(normalize_kebab "$queue_raw")"
  key="$(to_snake "$queue")"
  key_upper="$(upper "$key")"
  queue_name="$(join_by '.' "$SYSTEM_KEBAB" "$ENV_KEBAB" "$queue")"
  printf 'RABBIT_QUEUE_%s=%s\n' "$key_upper" "$queue_name"
  printf 'RABBIT_DLQ_%s=%s.dlq\n' "$key_upper" "$queue_name"
done

for db_raw in "${DATABASES[@]}"; do
  db_kebab="$(normalize_kebab "$db_raw")"
  db_snake="$(to_snake "$db_kebab")"
  key="$(upper "$db_snake")"
  db_name="${SYSTEM_SNAKE}_${ENV_SNAKE}_${REGION_SNAKE}_${db_snake}"
  if [[ ! "$db_name" =~ ^[a-z0-9_]+$ ]]; then
    fail "derived database name '$db_name' is not unquoted-safe"
  fi
  printf 'POSTGRES_DB_%s=%s\n' "$key" "$db_name"
done

for bucket_raw in "${BUCKETS[@]}"; do
  bucket="$(normalize_kebab "$bucket_raw")"
  key="$(to_snake "$bucket")"
  key_upper="$(upper "$key")"
  printf 'OBJECT_BUCKET_%s=%s-%s-%s-%s\n' "$key_upper" "$SYSTEM_KEBAB" "$ENV_KEBAB" "$REGION_KEBAB" "$bucket"
done
