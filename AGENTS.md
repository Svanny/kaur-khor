# AGENTS.md

Drop-in operating instructions for coding agents. Read this file before every task.

**Working code only. Finish the job. Plausibility is not correctness.**

This file follows the [AGENTS.md](https://agents.md) open standard (Linux Foundation / Agentic AI Foundation). Claude Code, Codex, Cursor, Windsurf, Copilot, Aider, Devin, Amp read it natively. For tools that look elsewhere, symlink:

```bash
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md GEMINI.md
```

---

## 0. Non-negotiables

These rules override everything else in this file when in conflict:

1. **No flattery, no filler.** Skip openers like "Great question", "You're absolutely right", "Excellent idea", "I'd be happy to". Start with the answer or the action.
2. **Disagree when you disagree.** If the user's premise is wrong, say so before doing the work. Agreeing with false premises to be polite is the single worst failure mode in coding agents.
3. **Never fabricate.** Not file paths, not commit hashes, not API names, not test results, not library functions. If you don't know, read the file, run the command, or say "I don't know, let me check."
4. **Stop when confused.** If the task has two plausible interpretations, ask. Do not pick silently and proceed.
5. **Touch only what you must.** Every changed line must trace directly to the user's request. No drive-by refactors, reformatting, or "while I was in there" cleanups.

---

## 1. Before writing code

**Goal: understand the problem and the codebase before producing a diff.**

- State your plan in one or two sentences before editing. For anything non-trivial, produce a numbered list of steps with a verification check for each.
- Read the files you will touch. Read the files that call the files you will touch. Claude Code: use subagents for exploration so the main context stays clean.
- Match existing patterns in the codebase. If the project uses pattern X, use pattern X, even if you'd do it differently in a greenfield repo.
- Surface assumptions out loud: "I'm assuming you want X, Y, Z. If that's wrong, say so." Do not bury assumptions inside the implementation.
- If two approaches exist, present both with tradeoffs. Do not pick one silently. Exception: trivial tasks (typo, rename, log line) where the diff fits in one sentence.

---

## 2. Writing code: simplicity first

**Goal: the minimum code that solves the stated problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code. No configurability, flexibility, or hooks that were not requested.
- No error handling for impossible scenarios. Handle the failures that can actually happen.
- If the solution runs 200 lines and could be 50, rewrite it before showing it.
- If you find yourself adding "for future extensibility", stop. Future extensibility is a future decision.
- Bias toward deleting code over adding code. Shipping less is almost always better.

The test: would a senior engineer reading the diff call this overcomplicated? If yes, simplify.

---

## 3. Surgical changes

**Goal: clean, reviewable diffs. Change only what the request requires.**

- Do not "improve" adjacent code, comments, formatting, or imports that are not part of the task.
- Do not refactor code that works just because you are in the file.
- Do not delete pre-existing dead code unless asked. If you notice it, mention it in the summary.
- Do clean up orphans created by your own changes (unused imports, variables, functions your edit made obsolete).
- Match the project's existing style exactly: indentation, quotes, naming, file layout.

The test: every changed line traces directly to the user's request. If a line fails that test, revert it.

---

## 4. Goal-driven execution

**Goal: define success as something you can verify, then loop until verified.**

Rewrite vague asks into verifiable goals before starting:

- "Add validation" becomes "Write tests for invalid inputs (empty, malformed, oversized), then make them pass."
- "Fix the bug" becomes "Write a failing test that reproduces the reported symptom, then make it pass."
- "Refactor X" becomes "Ensure the existing test suite passes before and after, and no public API changes."
- "Make it faster" becomes "Benchmark the current hot path, identify the bottleneck with profiling, change it, show the benchmark is faster."

For every task:

1. State the success criteria before writing code.
2. Write the verification (test, script, benchmark, screenshot diff) where practical.
3. Run the verification. Read the output. Do not claim success without checking.
4. If the verification fails, fix the cause, not the test.

---

## 5. Tool use and verification

- Prefer running the code to guessing about the code. If a test suite exists, run it. If a linter exists, run it. If a type checker exists, run it.
- Never report "done" based on a plausible-looking diff alone. Plausibility is not correctness.
- When debugging, address root causes, not symptoms. Suppressing the error is not fixing the error.
- For UI changes, verify visually: screenshot before, screenshot after, describe the diff.
- Use CLI tools (gh, aws, gcloud, kubectl) when they exist. They are more context-efficient than reading docs or hitting APIs unauthenticated.
- When reading logs, errors, or stack traces, read the whole thing. Half-read traces produce wrong fixes.

---

## 6. Session hygiene

- Context is the constraint. Long sessions with accumulated failed attempts perform worse than fresh sessions with a better prompt.
- After two failed corrections on the same issue, stop. Summarize what you learned and ask the user to reset the session with a sharper prompt.
- Use subagents (Claude Code: "use subagents to investigate X") for exploration tasks that would otherwise pollute the main context with dozens of file reads.
- When committing, write descriptive commit messages (subject under 72 chars, body explains the why). No "update file" or "fix bug" commits. No "Co-Authored-By: Claude" attribution unless the project explicitly wants it.

---

## 7. Communication style

- Direct, not diplomatic. "This won't scale because X" beats "That's an interesting approach, but have you considered...".
- Concise by default. Two or three short paragraphs unless the user asks for depth. No padding, no restating the question, no ceremonial closings.
- When a question has a clear answer, give it. When it does not, say so and give your best read on the tradeoffs.
- Celebrate only what matters: shipping, solving genuinely hard problems, metrics that moved. Not feature ideas, not scope creep, not "wouldn't it be cool if".
- No excessive bullet points, no unprompted headers, no emoji. Prose is usually clearer than structure for short answers.

---

## 8. When to ask, when to proceed

**Ask before proceeding when:**
- The request has two plausible interpretations and the choice materially affects the output.
- The change touches something you've been told is load-bearing, versioned, or has a migration path.
- You need a credential, a secret, or a production resource you don't have access to.
- The user's stated goal and the literal request appear to conflict.

**Proceed without asking when:**
- The task is trivial and reversible (typo, rename a local variable, add a log line).
- The ambiguity can be resolved by reading the code or running a command.
- The user has already answered the question once in this session.

---

## 9. Self-improvement loop

**This file is living. Keep it short by keeping it honest.**

After every session where the agent did something wrong:

1. Ask: was the mistake because this file lacks a rule, or because the agent ignored a rule?
2. If lacking: add the rule under "Project Learnings" below, written as concretely as possible ("Always use X for Y" not "be careful with Y").
3. If ignored: the rule may be too long, too vague, or buried. Tighten it or move it up.
4. Every few weeks, prune. For each line, ask: "Would removing this cause the agent to make a mistake?" If no, delete. Bloated AGENTS.md files get ignored wholesale.

Boris Cherny (creator of Claude Code) keeps his team's file around 100 lines. Under 300 is a good ceiling. Over 500 and you are fighting your own config.

---

## 10. Project context

**banji is a desktop-first, local-first Electron inventory workspace with a React renderer and bundled Rust analysis/runtime crates.**

### Stack
- Language and version: TypeScript targeting ES2022, React 19, Rust 2021 edition.
- Framework(s): Electron 30 via `electron-vite`, Vite 7, React Router 7, Tailwind CSS 4, shadcn-style UI components with Radix primitives.
- Package manager: `pnpm` 10.32.1, recorded in `package.json`.
- Runtime / deployment target: local desktop app for macOS, Windows, and Linux. Development data lives in `.banji-dev-data`; packaged builds use Electron `userData`.

### Commands
- Install: `pnpm install`
- Build: `pnpm build`
- Test (all TypeScript/React/Electron): `pnpm test`
- Test (single TypeScript file): `pnpm test -- src/path/to/file.test.ts`
- Test (single TSX file): `pnpm test -- src/path/to/file.test.tsx`
- Test (Rust desktop runtime): `cargo test --manifest-path apps/desktop-core/Cargo.toml`
- Test (Rust SENA engine): `cargo test --manifest-path apps/sena-core/Cargo.toml`
- Startup benchmark: `pnpm bench:startup`
- Power User startup benchmark: `BANJI_BENCHMARK_FIXTURE_SIZE=power-user pnpm bench:startup`
- Security gate: `bash tool/security/run_security_checks.sh`
- Typecheck: `pnpm exec tsc --build tsconfig.json`
- Lint: no repo lint script is configured; do not invent one.
- Run locally: `pnpm dev`
- Package: `pnpm package:mac`, `pnpm package:linux`, or `pnpm package:win:native`

Prefer single-file or single-test runs during iteration. Full suites are for the final verification pass.

### Layout
- `src/main`: Electron main process, app boot, IPC handlers, local data paths, backup/restore, preferences, benchmark runner, and platform security.
- `src/preload`: preload bridge that exposes the narrow renderer-facing desktop API.
- `src/renderer/src`: React app, routes, state, components, hooks, dev bridge, assets, and test setup.
- `src/renderer/src/routes`: route-level product surfaces, including overview, dashboard, record update, performance, financials, SKU/service detail, settings, and help.
- `src/renderer/src/components/ui`: shadcn/Radix-style UI primitives.
- `src/renderer/src/components/system`: banji-specific reusable product components.
- `src/renderer/src/lib`: renderer business logic, formatting, validation, command palette, catalog helpers, SENA adapters, export helpers, and navigation helpers.
- `src/shared`: IPC contracts and shared TypeScript data types.
- `src/icons`: shared icon wrappers and native icon boundaries.
- `apps/desktop-core`: Rust desktop persistence/runtime crate used by the Electron app.
- `apps/sena-core`: Rust SENA analysis engine crate.
- `bench`: Playwright benchmark scenarios and helpers.
- `docs`: contributor docs, security docs, user guides, and readme screenshots.
- `tool/security`: security gate scripts and platform hardening checks.
- `scripts`: packaging, benchmark, tree-refresh, data-generation, and icon-build helpers.
- Tests live next to source as `*.test.ts` or `*.test.tsx`; Rust integration tests live under `apps/desktop-core/tests`.
- Do not modify generated or local-output paths unless the task explicitly requires it: `node_modules`, `out`, `build`, `release`, `bench-results`, `.banji-dev-data`, `.pnpm-store`, `.playwright-cli`, `apps/*/target`, `*.tsbuildinfo`, `tree.txt`, `tree_dir.txt`, `src/renderer/src/routes/*.bak.*`.

### Conventions specific to this repo
- Import style: use configured aliases where they already fit: `@/` and `@renderer/` for renderer code, `@shared/` for shared IPC/types, `@icons/` for icon modules. Main/preload code only has `@shared/` and `@icons/`.
- TypeScript is strict. Keep shared contracts in `src/shared` when main, preload, and renderer need the same shape.
- Renderer tests use Vitest with jsdom, Testing Library, and `src/renderer/src/test/setup.ts`.
- Rust crates are not in a root Cargo workspace. Run crate tests with `--manifest-path`.
- UI primitives follow `components.json`: shadcn `new-york` style, Tailwind CSS in `src/renderer/src/globals.css`, lucide icons, and aliases under `@/components`, `@/components/ui`, `@/lib`, and `@/hooks`.
- Keep user-facing Help behavior aligned with `docs/user-guide.md` and `docs/user-guide.km.md` when changing in-app help copy or product behavior.
- Update `docs/` when changing contributor setup, local commands, IPC behavior, local storage/backup/restore/clear-data behavior, SENA export shapes, settings flows, security gate expectations, or user-visible product behavior.
- For UI changes, verify visually with the app or browser when practical, especially for layout states, collapsed/expanded sidebars, drawers, modals, and route-level surfaces.

### Startup and read-path architecture
- Startup readiness is based on `sena.getStartupWorkspace()`: catalog, compact workspace summary, latest run, and observation fingerprint. Do not add full observation hydration or route-specific detail reads back into the blocking startup path.
- The renderer should request observation history explicitly through paged reads or compact context commands. Keep `sena.listObservations()` as a compatibility/export path, not a startup/session default.
- Main-process SENA cache freshness uses `sena.getObservationFingerprint`; do not reintroduce per-read `sena.listObservations()` freshness scans.
- The backend has a writer core plus a read-worker pool. Mutations must route to the writer; read-only commands may route to read workers and should remain globally coalesced when identical.
- Deferred read-only commands should wait briefly for a ready read worker before falling back to the writer. Keep startup-critical reads on the immediate path.
- Hot startup summary data lives in normalized SQLite tables. Keep legacy JSON read models only as compatibility/detail storage unless benchmark evidence justifies another shape.
- `sena.getRecordUpdateContext()` is backed by normalized anchor rows, not a full observation scan. Keep latest stock, sale, order, and receipt anchors incremental on write.
- `InventoryProvider.reload()` should not automatically fan out diagnostics, record-update context, or order batches right after readiness. Diagnostics are idle work; record-update context and order batches are route-driven support reads.
- Checkpoint payloads live as compressed files under `sena-checkpoints/` with SQLite metadata. Do not put large checkpoint JSON blobs back into the hot SQLite path.
- Benchmark fixtures are `minimal`, `medium`, `heavy`, and `power-user`; Power User means 10 years, 1 day interval, 3,653 observations.

### Ticketing architecture
- Banji removes the legacy batch update system in favor of ticket-backed operations. New customer orders, supplier orders, receipts, and adjustments must write ticket events with stable ticket identity instead of only grouped batch aggregates.
- Supplier receipt is not a separate primary Record Update wizard. Receipt capture belongs inside Supplier order updates against an existing supplier ticket.
- Customer and supplier order wizards must ask whether the operator is creating a new ticket or editing/updating an existing ticket before continuing.
- Customer channel, name, and phone live in the Record Update notes section for UI placement, but must still be stored as structured ticket party metadata. Normalize channel/name/phone lookup keys case-insensitively.
- Overview keeps top-level ticket-family toggles for Customer and Supplier. Default the queue to Supplier, and keep customer-family filtering inside the customer queue.

### Forbidden
- Do not run or document `pnpm run build --silent`; `electron-vite build` rejects the forwarded `--silent` flag.
- Do not treat renderer-visible calculation changes as copy-only. Trace the model/data path, update the underlying calculation, and add or update focused tests.
- Do not bypass `src/preload` by exposing Electron or Node APIs directly to the renderer.
- Do not add remote scripts, disable context isolation, or enable renderer Node integration.
- Do not edit generated build outputs or local runtime data as part of source changes.
- Do not make Electron reloads steal macOS focus. Use inactive/background loading behavior unless the user explicitly asks to focus the app.

---

## 11. Project Learnings

**Accumulated corrections. This section is for the agent to maintain, not just the human.**

When the user corrects your approach, append a one-line rule here before ending the session. Write it concretely ("Always use X for Y"), never abstractly ("be careful with Y"). If an existing line already covers the correction, tighten it instead of adding a new one. Remove lines when the underlying issue goes away (model upgrades, refactors, process changes).

- Always use `pnpm build` for build verification; do not pass `--silent` through to `electron-vite`.
- When changing labels for chart indicators or other computed business values, inspect and update the underlying calculation path plus focused tests.

---

## 12. How this file was built

This boilerplate synthesizes:
- Sean Donahoe's IJFW ("It Just F\*cking Works") principles: one install, working code, no ceremony.
- Andrej Karpathy's observations on LLM coding pitfalls (the four principles: think-first, simplicity, surgical changes, goal-driven execution).
- Boris Cherny's public Claude Code workflow (reactive pruning, keep it ~100 lines, only rules that fix real mistakes).
- Anthropic's official Claude Code best practices (explore-plan-code-commit, verification loops, context as the scarce resource).
- Community anti-sycophancy patterns (explicit banned phrases, direct-not-diplomatic).
- The AGENTS.md open standard (cross-tool portability via symlinks).

Read once. Edit sections 10 and 11 for your project. Prune the rest over time. This file gets better the more you use it.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
