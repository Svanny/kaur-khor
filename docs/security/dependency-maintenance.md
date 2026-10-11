# Dependency maintenance

Developer docs entrypoint: [Kaur Khor developer docs](../README.md)

## October 2026 repair

The audit of main commit `eb70572333204b28468c7e00ba22e216a2050027` reported
127 findings: 2 critical, 61 high, 53 moderate, and 11 low. The repaired lockfile
reports 2 findings: 1 high and 1 low. The moderate audit threshold and strict
network requirement remain unchanged.

- `tar` moves from 7.5.13 to 7.5.22 through Electron Builder 26.17.0, clearing
  [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw).
- `proxy-addr` moves from 2.0.7 to 2.0.8, clearing
  [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
- Electron moves from 39.8.9 to 41.10.7, clearing the current runtime advisory
  ranges and replacing the vulnerable extractor with Electron's supported
  [internal extractor](https://github.com/electron/extract-zip/blob/main/SECURITY.md).
- Compatible transitive pins clear the remaining published moderate/high fixes.
  The scoped `@electron/get>global-agent` override uses 4.1.3 to remove the
  `roarr > sprintf-js` path. Six proxy smoke cases verify the actual get3
  bootstrap API, HTTP/HTTPS forwarding, legacy and standard environment
  conventions, HTTPS fallback, NO_PROXY bypass, and repeated initialization.
  TLS certificate verification remains enabled.
  Reproduce the installed graph with `node tools/security/check-electron-proxy.cjs`;
  pass `--baseline-root /path/to/baseline/checkout` for the six-case comparison.
- Electron and `@electron/get` require Node.js 22.12.0+. The manifest and developer
  prerequisites declare this minimum. Both source-build wrappers reach the shared
  early version check; old installed Node versions are rejected before dependency
  installation and are not replaced. The absent-Node bootstrap remains pinned to
  the compatible 22.21.1 release.

These critical dependency paths belong to development/build tools. Their
presence in the lockfile does not establish exploitation of the packaged app.

## Remaining findings

| Package and path | Finding | Constraint |
| --- | --- | --- |
| `shadcn > fast-glob > micromatch > braces@3.0.3` | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high, recursive pattern parsing DoS | No patched official release is published. The maintainer [disputes the advisory](https://github.com/micromatch/braces/issues/73). The strict audit still fails. Removing shadcn would also remove the stylesheet imported by the renderer. |
| `markmap-cli > markmap-lib > katex@0.16.45` | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), low, existing prototype pollution can bypass trust restrictions | Fixed in 0.18.2+. The current Markmap dependency range stays on 0.16; update its supported integration in a separate docs-tooling change. This finding is below the existing moderate gate threshold. |

Do not merge a dependency repair while the security gate fails. Prefer an
official upstream fix or a supported consumer migration, preserving shadcn's
styling and component tooling. Do not hide the finding with ignore rules,
fabricated package versions, or a higher audit threshold.

## Runtime verification limits

The local UI matrix reports 5 passed and 6 failed. Fresh desktop onboarding,
catalog/stock/ticket persistence across reload/relaunch, required phone viewport
sizes, and both browser scenarios pass. Three generated desktop cases expect a
CSS maximum height and hidden overflow, while main defines a minimum height and
visible overflow; the same chart assertion fails on baseline main. Electron
39.8.9 and 41.10.7 render identical SKU, service, and Explain timeline chart
heights and control positions in the isolated comparison.

The three mobile failure paths also reproduce on baseline main with its original
dependency installation (using a bounded 45-second test timeout): the tests
expect seeded demo products or queue/search controls in an empty workspace.
Preserve the intended blank-workspace behavior and repair the matrix fixtures
and expectations in a separate focused maintenance change. The complete UI
matrix is still red and must not be reported as passing.

## Bounded upkeep

For the next four weeks, reuse the existing daily inspection and batch compatible
dependency edits into a weekly maintenance pass: inspect current main,
open PRs, and exact-commit CI; run the network-required audit; and update only
affected dependency paths in one draft PR. Recheck the braces release/advisory
status each pass and report a continuing upstream block without duplicating PRs.

Before a merge decision, require the security gate, TypeScript checks, desktop
and web builds, all five packaging jobs, and the unit/UI matrix coverage relevant
to changed runtime dependencies. Treat Electron major upgrades as separate
reviewable changes with startup, IPC, persistence, and packaging verification.
Review temporary overrides when upstream consumers adopt the fixed versions.

Reuse any existing maintenance automation instead of creating another schedule.
Merging, auto-merge, tagging, release publication, and deployment require a
separate explicit decision.
