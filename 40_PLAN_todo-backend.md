## Core build to do list ranked from pillars to walls

This is ordered so you can stand up the load bearing infrastructure first, then connect it with services, then harden it until it survives bad days.

### Part A Core infrastructure

#### Pillars, must have to make the system real

1. [DONE] Create the environment map and naming contract
   Decide what exists and what it is called in every environment: dev, staging, prod. Decide service names, topic and queue prefixes, database naming, secret naming, and log naming. Done means a single short document that never changes casually and a set of environment variables that follow it.

2. [DONE] Stand up source control, CI, and release gates
   Set up GitHub Actions pipelines for Rust build, tests, formatting, linting, container build, and deploy. Done means every merge produces a build artifact, every deploy is traceable to a commit, and migrations are enforced as a required step.

3. [DONE] Provision postgres as the source of truth
   Create postgresql in each environment with backups enabled. Define a migration tool and process. Done means you can create schema from scratch from migrations, apply forward migrations automatically in deploy, and restore to a clean environment.

4. [DONE] Provision Redis for cache and lightweight coordination
   Create Redis with a clear policy that it is never required for correctness. Done means the API can run with cache disabled, and cache keys include a schema version prefix.

5. [OPTIONAL / FUTURE] Provision Kafka for streaming logs
   Optional future track: create Apache Kafka, decide retention defaults, and create initial topics with partitions sized for your expected parallelism. Done means you can publish and consume from a test topic, you can observe consumer lag, and you have a clear topic naming convention.

5a. [DONE / CURRENT FIX] Use PostgreSQL event log as Kafka substitute
   Implement an append-only `app.event_log` table as the current event stream transport. Publish events in the same transaction as canonical writes (outbox style), then poll/process by cursor (`id` or `created_at`) from worker services. Done means you can publish and consume from a test event stream in Postgres, track consumer progress with a durable checkpoint table, replay ranges for backfill, and keep naming/versioning conventions aligned with the current event vocabulary.

6. [DONE] Provision RabbitMQ for job queues
   Create RabbitMQ, define exchanges, queues, dead letter routing, and retry strategy. Done means you can enqueue a job, consume it, fail it, see it land in retry or dead letter, and recover it intentionally.

7. [DONE] Stand up secrets management and configuration boundaries
   Use platform secrets for now, later a dedicated secret manager if needed. Done means no secrets in code or logs, rotation is possible without redeploying everything, and every service has only the secrets it needs.

8. [DONE] Establish observability baseline before features
   Instrument Rust with OpenTelemetry, pick a metrics and logs destination, and ensure every request and job has a correlation id. Done means you can answer these questions in minutes: what is slow, what is failing, what is growing, what changed.

#### Walls, resilience that keeps you calm in production

9. [DONE] Add database connection pooling
   Introduce PgBouncer once you have more than one API instance or significant worker concurrency. Done means connection count is stable under load and deploys do not spike latency.

10. [DONE] Define backup and restore drills as a routine
    Backups are not enough. Done means you can restore Postgres to a new environment and pass a basic validation script, and you have a cadence for doing this.

11. [OPTIONAL / FUTURE] Define Kafka retention, compaction, and replay policy
    Optional future track: decide what must be replayable and for how long. Done means you can rebuild projections from a checkpoint, and you can justify retention cost.

11a. [DONE / CURRENT FIX] Define Postgres event log retention and replay policy
    Define retention window, archive strategy, and replay procedure for `app.event_log` so projections can be rebuilt from checkpoints without Kafka. Done means you can replay event ranges from Postgres, prune safely after archival, and justify storage/cost tradeoffs.

12. [DONE] Define RabbitMQ poison message and retry rules
   Set limits on retries and define a process for dead letter triage. Done means poison messages do not stall your system and you have a repeatable recovery playbook.

13. [DONE] Add edge protections
    Put a proper edge in front, often Cloudflare plus Railway routing. Done means TLS is handled, rate limits exist, request size limits exist, and your API is not exposed directly to the internet without guardrails.

---

### Part B Subsequent services that connect the infrastructure

#### Pillars, the minimum set of services to make data flow end to end

1. [DONE] Rust API service
   Implement auth verification, request validation, idempotency keys for writes, Postgres transactions, and cache read through for hot reads. Done means the client can perform a write, read it back, and retries do not duplicate state.

2. [OPTIONAL / FUTURE] Postgres outbox table and outbox relay service (Kafka path)
   Optional future track: write an outbox row in the same transaction as the canonical write, then run a small Rust relay that publishes outbox rows into Kafka. Done means a committed DB write always produces a Kafka event, and failed publishes are retried without duplicates causing corruption.

2a. [DONE / CURRENT FIX] Postgres outbox table and Postgres event relay
   Write an outbox row in the same transaction as the canonical write, then run a small Rust relay/poller that moves rows into `app.event_log` (or marks outbox rows as published if writing directly). Done means a committed DB write always produces a durable Postgres event, retries are safe, and duplicates are prevented via idempotent publish keys.

3. [DONE] Event vocabulary and schema discipline
   Define event types, required fields, versioning rules, and compatibility expectations. Done means producers and consumers validate payloads and a schema change is an explicit version increment, not a silent drift.

4. [OPTIONAL / FUTURE] Streaming consumer service for projections (Kafka path)
   Optional future track: create a Rust consumer group that reads Kafka events and updates read optimized tables in Postgres. Done means your hottest read endpoints can hit projection tables with simple indexed queries.

4a. [DONE / CURRENT FIX] Event-log consumer service for projections (Postgres path)
   Create a Rust consumer worker that reads `app.event_log` by monotonic cursor and updates read optimized tables in Postgres. Done means projection consumers can resume from durable checkpoints and rebuild by replaying event ranges from Postgres.

5. [DONE] Job producer and worker services
   API or consumers enqueue jobs to RabbitMQ for heavy algorithms. Workers consume, write run records, write results, and publish result events back to Kafka only if/when the optional Kafka track is enabled. Done means jobs are idempotent, retriable, and every run is accountable in Postgres.

6. [DONE] Object storage integration for heavy artifacts
   Use S3 compatible storage for exports, large intermediate files, and reports. Done means Postgres holds only metadata and references, and workers can produce artifacts without bloating the database.

#### Walls, the service layer upgrades that prevent slow decay

7. Rate limiting and abuse controls in the API layer
   Implement per user and per device limits, plus backpressure behavior when RabbitMQ is unhealthy and Kafka is unhealthy only if the optional Kafka track is enabled. Done means overload degrades gracefully and does not cascade.

8. End to end tracing across API, relay, consumers, and workers
   Propagate correlation ids through RabbitMQ metadata, and through Kafka headers only if the optional Kafka track is enabled. Done means you can trace one user action through every hop.

9. [OPTIONAL / FUTURE] Replay and backfill tooling (Kafka replay path)
   Optional future track: build a controlled tool or service that can replay Kafka ranges into projections and re run batch jobs safely. Done means you can rebuild derived state after algorithm changes without manual database surgery.

9a. [CURRENT FIX] Replay and backfill tooling (Postgres event-log path)
   Build a controlled tool/service that replays `app.event_log` ranges into projections and re-runs batch jobs safely. Done means you can rebuild derived state after algorithm changes without Kafka.

10. SLOs and alerting tied to user pain
    Alerts for API latency, error rate, RabbitMQ queue depth, worker failure rate, Postgres locks, and cache hit rate; include Kafka consumer lag only if the optional Kafka track is enabled. Done means alerts predict incidents, not announce them after users complain.

11. Staging environment parity and safe rollout controls
    Ensure staging mirrors production topology and add feature flags for algorithm rollouts. Done means you can ship changes gradually and roll back fast.
    Status: implemented via four-role topology contract (`api`, `event-relay`, `projection-consumer`, `worker`), deploy parity checks, and Postgres-backed worker algorithm rollout policy keyed by `job_type`.
