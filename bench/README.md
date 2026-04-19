# Banji Desktop Benchmarks

This benchmark stack measures Banji as a desktop system: Electron main process,
preload bridge, React renderer, IPC queueing, and the Rust desktop core.

Run the full local suite:

```bash
pnpm bench
```

Run a focused scenario:

```bash
pnpm bench:startup
pnpm bench:navigation
pnpm bench:record-update
pnpm bench:detail-pages
pnpm bench:stability
```

Benchmark runs set these environment variables for the launched app:

- `BANJI_BENCHMARK=1`
- `BANJI_BENCHMARK_RUN_ID=<scenario-run-id>`
- `BANJI_BENCHMARK_OUTPUT_DIR=bench-results/<scenario-run-id>`
- `BANJI_BENCHMARK_DATA_DIR=bench-results/data/<scenario-run-id>`
- `BANJI_DESKTOP_TRACE_IPC=1`
- `BANJI_BENCHMARK_DISABLE_DEV_SEED=1`

Fixture size can be selected with `BANJI_BENCHMARK_FIXTURE_SIZE`.

| Fixture | History | Interval | Expected observations |
| --- | ---: | ---: | ---: |
| `minimal` | 30 days | 7 days | 5 |
| `medium` | 1 year | 7 days | 53 |
| `heavy` | 3 years | 3 days | 366 |
| `power-user` | 10 years | 1 day | 3,653 |

Run the Power User startup benchmark:

```bash
BANJI_BENCHMARK_FIXTURE_SIZE=power-user pnpm bench:startup
```

Each run writes:

- `events.jsonl`: Electron-side event stream from renderer, preload, main, and Playwright
- `core-events-<role>-<index>-<pid>.jsonl`: Rust core events from the writer and read workers, kept in per-worker files to avoid concurrent append interleaving
- `<scenario>.summary.json`: duration summaries and slowest IPC/core entries
- Playwright artifacts under `bench-results/playwright-artifacts`

Startup summaries track the compact startup architecture. The old startup target
for `ipc.sena_get_workspace_summary_ms` has been replaced by
`ipc.sena_get_startup_workspace_ms`. Queue metrics include the legacy aggregate
`backend.core.queue_wait_p95_ms` and read-pool-specific
`backend.core.read_pool_queue_wait_p95_ms`.

Compare two result directories:

```bash
pnpm bench:compare bench-results/<baseline> bench-results/<candidate>
```

The benchmark data directory is isolated per run. In dev builds the benchmark
seed helper prepares the workspace first, then launches Banji with dev seeding
disabled so the measured startup path uses the prepared fixture.
