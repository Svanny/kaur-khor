# Dependency maintenance

Developer docs entrypoint: [Kaur Khor developer docs](../README.md)

## October 2026 repair

The audit of main commit `eb70572333204b28468c7e00ba22e216a2050027` reported
127 findings: 2 critical, 61 high, 53 moderate, and 11 low. The repaired lockfile
reports 1 low finding and no critical, high, or moderate findings. The unchanged
moderate audit threshold passes; the strict network requirement remains enabled.

- `tar` moves from 7.5.13 to 7.5.22 through Electron Builder 26.17.0, clearing
  [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw).
- The vulnerable `proxy-addr` path is removed with the unused installed shadcn
  CLI, clearing [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
  The only application import was its Tailwind stylesheet. That exact 3.8.5
  stylesheet and full MIT notice are retained in `globals.css`; compiled CSS is
  identical after removing comments, and the notice survives compilation.
  Existing component source stays local. The supported on-demand CLI remains
  available with a root TypeScript discovery shim and a verified dry-run command.
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
| `markmap-cli > markmap-lib > katex@0.16.45` | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), low, existing prototype pollution can bypass trust restrictions | Fixed in 0.18.2+. The current Markmap dependency range stays on 0.16; update its supported integration in a separate docs-tooling change. This finding is below the existing moderate gate threshold. |

The old `shadcn > fast-glob > micromatch > braces@3.0.3` finding is absent from the
application/build dependency graph after removing the unnecessary installed CLI.
The optional CLI still has the upstream [disputed, unpatched advisory](https://github.com/micromatch/braces/issues/73);
on-demand invocation does not patch it. No ignore rules, fabricated versions, or
threshold changes are used.

## Runtime verification

The local complete UI matrix passes all 11 desktop, browser, and mobile cases.
The initial six failures reproduced on main and came from stale expectations:
chart tests expected a maximum height/hidden overflow despite the existing
minimum-height contract, and mobile tests expected seeded products or queue
controls in intentionally blank workspaces.

Populated scenarios now explicitly import synthetic fixtures through the public
backup UI. Fresh/reset scenarios assert zero counts and correct creation links.
The chart tests retain rendered geometry, internal-scroll, offscreen-flag, and
unclipped-control checks; additional checks prove the complete control row can
scroll into view and capture it. No application behavior was changed to make
these assertions pass. The PR UI workflow reruns the full matrix and saves its
screenshots so drift is caught before merge.

Fixed chart geometry uses a measured 1760x1000 content viewport, retaining the
original ledger upper bound independently of the host display. Additional SKU,
service, and Explain checks at native 1280x800 and 1600x1000 retain the chart and
minimum-height checks, verify header/chart/control containment and every control
button, and scroll the full control row into view. The minimum-height ledger
may grow when controls wrap; that responsive state is captured explicitly.

Native resize assertions poll the requested outer/content size first, then
compare renderer CSS dimensions with native content size divided by the actual
zoom factor, allowing one CSS pixel for Chromium rounding. Diagnostics retain
native/content sizes, zoom, rem size, and element rectangles. Both resize stages
and dependent-workspace reload/relaunch checks remain covered.

The proxy/TLS test requires OpenSSL on PATH, including native Windows test runs;
Windows packaging results alone do not establish that unit-test prerequisite.
It generates temporary certificates and keeps TLS verification enabled.

## Bounded upkeep

For the next four weeks, reuse the existing daily inspection and batch compatible
dependency edits into a weekly maintenance pass: inspect current main,
open PRs, and exact-commit CI; run the network-required audit; and update only
affected dependency paths in one draft PR. Review the remaining Markmap/KaTeX integration and optional CLI advisory status
each pass, without duplicating PRs.

Before a merge decision, require the security gate, TypeScript checks, desktop
and web builds, all five packaging jobs, and the unit/UI matrix coverage relevant
to changed runtime dependencies. Treat Electron major upgrades as separate
reviewable changes with startup, IPC, persistence, and packaging verification.
Review temporary overrides when upstream consumers adopt the fixed versions.

Reuse any existing maintenance automation instead of creating another schedule.
Merging, auto-merge, tagging, release publication, and deployment require a
separate explicit decision.
