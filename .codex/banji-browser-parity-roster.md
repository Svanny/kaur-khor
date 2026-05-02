# Banji Browser Parity Agent Roster

Task: Single-threaded SENA WASM + while-tab browser automation parity.

## Coding agents

| Agent | Model | Task | Files touched | Status | Handoff notes |
| --- | --- | --- | --- | --- | --- |
| Epicurus (`019de611-17d0-76f1-b36b-67f8fbe10383`) | GPT-5.5 medium | SENA WASM/runtime/storage slice | `apps/sena-core/Cargo.toml`, `apps/sena-core/src/browser.rs`, `apps/sena-core/src/inference.rs`, `apps/sena-core/src/lib.rs`, `src/renderer/src/runtime/web/client.ts`, `src/renderer/src/runtime/web/index.ts`, `src/renderer/src/runtime/web/protocol.ts`, `src/renderer/src/runtime/web/schema.ts`, `src/renderer/src/runtime/web/schema.test.ts`, `src/renderer/src/runtime/web/sena-analysis.ts`, `src/renderer/src/runtime/web/sena-analysis.test.ts`, `src/renderer/src/runtime/web/sena-persistence.ts`, `src/renderer/src/runtime/web/sqlite-worker.ts`, coordinated bridge/web-route edits | Completed | Added desktop-gated SENA core dependencies, a browser JSON analysis boundary, single-threaded no-default feature check, browser SENA projection/persistence, diagnostics cache, and normalized OPFS table writes. The browser runtime currently uses the TypeScript projector while the Rust browser boundary is kept buildable for the WASM packaging step. |
| Gibbs (`019de611-3b5f-7741-b7cb-5ef1ed8b8200`) | GPT-5.5 medium | Browser UI parity, while-tab automation UX, docs/install surfaces | `README.md`, `docs/browser-app.md`, `docs/development/automation-workspace.md`, `docs/development/web-runtime-and-opfs.md`, `docs/install-guide.md`, `src/renderer/src/dev/browser-desktop-bridge.ts`, `src/renderer/src/dev/browser-desktop-bridge.test.ts`, `src/renderer/src/hooks/use-runtime-mode.ts`, `src/renderer/src/lib/km-ui-copy.ts`, `src/renderer/src/routes/automations.tsx`, `src/renderer/src/routes/automations.test.tsx`, `src/renderer/src/routes/automations/connection-card.tsx`, `src/renderer/src/routes/benchmark-settings.tsx`, `src/renderer/src/routes/catalog-image-field.tsx`, `src/renderer/src/routes/settings.tsx`, `src/renderer/src/routes/settings.test.tsx`, `src/renderer/src/routes/web/index.tsx` | Completed | Added browser runtime warnings, direct while-tab Telegram polling/test behavior, browser-only Settings/Benchmark/Image UX, Khmer copy, and docs for browser SENA/automation/storage limits. |

## Completed scouts reused

| Agent | Task | Status | Handoff notes |
| --- | --- | --- | --- |
| Godel (`019de5f1-ef8d-7563-abcc-6ac9c3d819bb`) | SENA renderer/IPC contract inventory | Completed | Startup must stay on `sena.getStartupWorkspace`; Work support remains bounded; browser parity needs cache invalidation and validation. |
| Rawls (`019de5f1-efb0-7a92-b142-8ef9913e9a8f`) | Automation contract inventory | Completed | Browser needs real local workspace semantics plus explicit limits for Telegram/live polling and desktop-only benchmark seeding. |
| Copernicus (`019de5f1-efcf-7061-a1d9-1e7ebe664c63`) | Browser runtime/storage scan | Completed | `/app` currently persists one mock-state document; normalized OPFS schema exists but is mostly unused. |
| Turing (`019de5f1-efee-7ab1-8c93-c97f1a55668a`) | Verification gap scan | Completed | Add browser smoke/persistence/automation proof rather than cloning full desktop benchmark suite. |

## Coordination rules

- Do not edit overlapping files concurrently unless the orchestrator serializes the integration.
- Package/build script changes are orchestrator-owned unless a worker explicitly reports a required change.
- Desktop Electron runtime must remain intact.
- Browser SENA is single-threaded for this phase: no Rayon pool, no `SharedArrayBuffer`, no COOP/COEP dependency.
- Browser Telegram/live automation is while-tab-open only and must show visible warnings.
