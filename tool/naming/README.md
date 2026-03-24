# Naming Tool

Deterministically renders contract-compliant resource names from canonical base variables.

## Usage

Run with defaults:

```bash
bash tool/naming/print_names.sh
```

Run from an environment template:

```bash
set -a
source config/env/dev.env
set +a
bash tool/naming/print_names.sh
```

## Contract Notes
- `BANJI_ENV` must be one of `dev|staging|prod`.
- `BANJI_SYSTEM`, `BANJI_REGION`, and `BANJI_TENANT` must already be canonical kebab tokens.
- Postgres names are emitted in snake case (`[a-z0-9_]+`) and are unquoted-safe.
- Kafka topics and RabbitMQ queues do not include region tokens.
- Output order is stable and intended for repeatable local checks.
- The repo only tracks `config/env/dev.env`; use inline exports if you want to render names for non-dev environments.
