# Banji Desktop Benchmarks

This benchmark stack measures Banji as a desktop system: Electron main process,
preload bridge, React renderer, IPC queueing, and the Rust desktop core.

Run the full local suite:

```bash
pnpm bench
```

By default this runs only the managed scenario list in
`src/shared/benchmark-scenarios.json`; ad hoc diagnostic files under
`bench/scenarios` are ignored unless passed explicitly.

List the managed default scenario files without building or launching:

```bash
node ./scripts/run-benchmarks.mjs --list-managed-scenarios
```

Run a focused scenario:

```bash
pnpm bench:startup
pnpm bench:navigation
pnpm bench:work
pnpm bench:capture
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
| `minimal` | 0 years | 7 days | 0 |
| `medium` | 1 year | 7 days | 53 |
| `heavy` | 3 years | 3.5 days | 314 |
| `power-user` | 10 years | 1 day | 3,653 |

Run the Power User startup benchmark:

```bash
BANJI_BENCHMARK_FIXTURE_SIZE=power-user pnpm bench:startup
```

Run every scenario against the Power User fixture and retain Playwright traces:

```bash
BANJI_BENCHMARK_FIXTURE_SIZE=power-user BANJI_BENCHMARK_TRACE=1 pnpm bench --repeat-each=1
```

The terminal runner and the in-app benchmark runner share the same scenario
metadata and harness: both build first when requested, run
`playwright.bench.config.ts`, seed the selected fixture before launch, and write
scenario summaries from the same persisted event stream. Keep new benchmark
options wired through both `scripts/run-benchmarks.mjs`,
`src/main/benchmark-runner.ts`, and the shared scenario metadata before changing
scenario behavior.

Each run writes:

- `events.jsonl`: Electron-side event stream from renderer, preload, main, and Playwright
- `core-events-<role>-<index>-<pid>.jsonl`: Rust core events from the writer and read workers, kept in per-worker files to avoid concurrent append interleaving
- `<scenario>.summary.json`: duration summaries and slowest IPC/core entries
- Playwright artifacts under the active run directory, for example
  `bench-results/<runId>/playwright-artifacts`; trace-enabled runs also write
  `playwright-trace.zip` inside each scenario output directory

Startup summaries track the compact startup architecture. The old startup target
for `ipc.sena_get_workspace_summary_ms` has been replaced by
`ipc.sena_get_startup_workspace_ms`. Queue metrics include the legacy aggregate
`backend.core.interactive_queue_wait_p95_ms`, read-pool-specific
`backend.core.read_pool_queue_wait_p95_ms`, and setup-only
`backend.core.setup_queue_wait_p95_ms`.

Compare two result directories:

```bash
pnpm bench:compare bench-results/<baseline> bench-results/<candidate>
```

The benchmark data directory and GUI runner output directory are isolated per
run. GUI runs set `BANJI_BENCHMARK_OUTPUT_DIR` to `bench-results/<runId>` so
summary and event collection cannot mix artifacts from another active or prior
run. The benchmark seed helper and the development boot path now share the same
generated-history seeding script. Benchmark runs still prepare the workspace
first, then launch Banji with dev seeding disabled so the measured startup path
uses the prepared fixture instead of reseeding during startup. Scenario
summaries now isolate setup from measured interaction windows using
`benchmark.phase.seed_end`,
`benchmark.phase.measurement_start`, and `benchmark.phase.measurement_end`
markers.

Work and Capture scenarios now measure current operator-critical flows:

- `work`: supplier drawer open, customer intake drawer open, supplier/customer workflow toggles, supplier filter transitions, and task-tab transitions.
- `capture`: hub lane opens, stock-count saves, and supplier receipt saves.

Automation and customer benchmark coverage is seeded deterministically during the
scenario setup. Bench helpers now force a minimum exposed-row and intake-row
count before timing starts. If required rows are absent, the Playwright scenario
fails immediately instead of emitting target rows with `missing` status.

Interaction timers use the in-process benchmark event bridge where possible,
with the persisted JSONL helper kept as a compatibility wrapper for scenarios
that still need cumulative event counts across launches. Scenario summaries include harness truth metrics:
`harness.ready_latency_p95_ms`, `harness.measurement_duration_p95_ms`, and
`harness.overhead_p95_ms`.

Navigation and capture scenarios follow current UI routes and labels
instead of deprecated deep-link aliases. Sidebar benchmarks click visible shell
navigation, and capture benchmarks open lanes through the hub cards and
the New or Edit/Update prompts. Supplier receipt coverage is measured inside
the supplier-order flow rather than through a standalone receipt route.
Detail-page benchmarks navigate through hash routes and measure SKU/service
first-load and repeat-load timings against current detail surfaces.
