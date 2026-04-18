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

Each run writes:

- `events.jsonl`: Electron-side event stream from renderer, preload, main, and Playwright
- `core-events.jsonl`: Rust core events, kept separate to avoid concurrent append interleaving
- `<scenario>.summary.json`: duration summaries and slowest IPC/core entries
- Playwright artifacts under `bench-results/playwright-artifacts`

Compare two result directories:

```bash
pnpm bench:compare bench-results/<baseline> bench-results/<candidate>
```

The benchmark data directory is isolated per run. In dev builds Banji still uses
the existing dev seed unless `BANJI_BENCHMARK_DISABLE_DEV_SEED=1` is supplied.
