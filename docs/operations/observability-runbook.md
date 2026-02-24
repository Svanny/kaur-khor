# Observability Runbook

## Objectives
Answer in minutes:
- what is slow
- what is failing
- what is growing
- what changed

## Dashboards
1. API golden signals:
   - throughput
   - error rate
   - p50/p95/p99 latency by route
2. Jobs:
   - outbox pending
   - publish failures
   - retry rate
   - DLQ growth
3. Event consumers:
   - lag by stream
   - checkpoint heartbeat age
   - consumer error rate
4. Change view:
   - same metrics grouped by `deployment.id`

## Starter Alerts
- API p95 latency sustained breach
- API 5xx rate sustained breach
- outbox pending depth/age sustained breach
- DLQ depth growth sustained breach
- consumer lag sustained growth + stale heartbeat
- collector export failures sustained breach

## Triage Flow
1. Start in API dashboard by route + status.
2. Pivot to traces using `trace_id`.
3. Correlate with logs via `correlation_id` and `trace_id`.
4. Check deployment segmentation (`deployment.id`) to isolate regressions.
5. If async symptoms appear, inspect jobs and event consumer dashboards.

## Collector Health Checks
- collector process alive
- receiver listening on configured OTLP endpoint
- exporter error rate and queue pressure acceptable
- no sustained memory limiter drops

