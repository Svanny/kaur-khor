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

## Package-manager repair

The follow-up tooling repair pins pnpm 10.34.5 in the manifest, CI, and source-build
helper. It clears the pre-existing package-manager advisories affecting 10.32.1,
including [proxy-setting secret exfiltration](https://github.com/advisories/GHSA-vx52-2968-3vc6)
and [virtual-store path traversal](https://github.com/advisories/GHSA-c59q-g84q-2gj5).
CI also pins setup action [v6.0.10](https://github.com/pnpm/action-setup/releases/tag/v6.0.10)
at `0977fd99725f1db4007ccb2928dbb4e90d06cc86`: its integrity-locked bootstrap uses
pnpm 11.19.0 instead of vulnerable 11.1.1. Merely changing the requested pnpm
version would leave that earlier bootstrap exposed. The current npm advisory
service returns no findings for either selected pnpm version or the standalone
11.19.0 bootstrap. This is separate from the application lockfile audit below.

Source builds invoke `corepack pnpm@10.34.5` or
`npm exec --yes --package=pnpm@10.34.5 -- pnpm`, preserving the global installation.
When neither wrapper is available, an installed pnpm must report the exact pinned
version before dependency installation starts. No Corepack global enable/activate
step is used; `COREPACK_DEFAULT_TO_LATEST=0` also prevents updating its global
known-good default. The application lockfile remains byte-for-byte unchanged and all
installations use `--frozen-lockfile`.

## Markdown parser repair

The October 21 follow-up moves the `markdown-it` override from 14.3.2 to 14.3.3
and regenerates the lockfile with pnpm 10.34.5. This patch clears
[GHSA-gfr2-rv44-r23c](https://github.com/advisories/GHSA-gfr2-rv44-r23c) (high,
quadratic parsing of unclosed reference definitions) and
[GHSA-vfgh-jcmw-g37q](https://github.com/advisories/GHSA-vfgh-jcmw-g37q) (low,
quadratic parsing of unterminated inline HTML with HTML enabled).

The installed path is `markmap-cli > markmap-lib > markdown-it`, used to generate
developer documentation. Markmap 0.18.12 accepts `^14.1.0`, so the patch stays
within its supported range. No application imports of this parser were found;
these findings do not establish an exploit impact on the packaged app.

`tools/scripts/markdown-it-maintenance.test.mjs` exercises Markmap's resolved
parser with ordinary reference links and inline HTML, unclosed reference labels
and titles, and all four affected inline HTML constructs. Pathological inputs
run in child processes with a ten-second deadline so a vulnerable parser cannot
block the test runner. The reference-title and inline-comment cases time out on
14.3.2; all seven tests pass on 14.3.3. The completed network audit now reports
only the unchanged low KaTeX finding, and the existing moderate threshold passes.
Reproduce the coverage with `pnpm test -- tools/scripts/markdown-it-maintenance.test.mjs`.
Also smoke-test the real documentation source with
`pnpm exec markmap docs/development/user-decision-tree.markmap.md --offline --no-open -o out/markmap-maintenance-smoke.html`
after building, keeping the tracked generated HTML untouched.

## Vitest mocker repair

The October 22 follow-up moves Vitest from 4.1.11 to the compatible 4.1.12 patch,
including its matching `@vitest/mocker` dependency. This clears
[GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) (manual
mock code injection) and
[GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp) (Windows
backslash traversal in redirect mocks). The project uses Node/jsdom Vitest runs;
no public `mockerPlugin` or `interceptorPlugin` integration was found. Existing
mock-heavy tests and the full unit suite verify compatibility without adding
these unused development-server plugins to the application.

The October 22 audit initially also reported a new moderate Electron finding.
The October 21 passing security-gate result predates that advisory's publication
to the npm audit service. The runtime follow-up below addresses it separately
from the test-tooling patch; audit thresholds and network requirements stay intact.

## Electron permission-origin repair

The runtime follow-up moves Electron 41.10.7 to 43.8.3 to clear
[GHSA-fw47-9c62-h3vw](https://github.com/advisories/GHSA-fw47-9c62-h3vw). The fix
starts at 42.11.3 (and 43.7.0 on the 43 line). On October 22, Electron 45 is
current stable; 43.8.3 is the latest patch on the oldest supported line under its
[three-major support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines#version-support-policy).
The installer still requires Node.js 22.12.0+. No `setPermissionCheckHandler`,
HID/USB device-selection handlers, or HID/USB iframe delegation were found in
the app, so the advisory's stated exploit preconditions were not established.

Compatibility review covered the 42/43 API changes. The app does not use
offscreen rendering, native bitmap buffers, Linux frameless window controls,
or the removed Linux hidden-file dialog option. Native benchmark notifications
are development-only; the newer macOS signing requirement does not add a
production notification path or require signing/access changes for this repair.
The existing isolated preload, IPC contracts, storage formats, and application
code stay unchanged. Native dialogs retain their explicit paths where provided;
an unspecified initial directory follows Electron's newer Downloads default.

Electron 42+ downloads its binary on first use. The project `postinstall` helper
explicitly invokes the installed package's supported installer before parallel
tests, preserving the previous ready-after-install behavior. It retains the
source-build `ELECTRON_SKIP_BINARY_DOWNLOAD=1` opt-out and propagates installer
errors, exit codes, and signal failures. Regression coverage exercises those
lifecycle boundaries without network access. Source packaging continues to
skip the unnecessary development binary download.

The real Windows 43.8.3 runtime (embedded Node.js 24.22.0) passed an isolated
startup/IPC smoke: context isolation stayed enabled, renderer Node integration
stayed disabled, the Rust startup read succeeded, and preference writes survived
both renderer reload and application restart without renderer exceptions.
The existing UI matrix supplies ticket/SQLite persistence and resize coverage;
the five packaging jobs exercise every shipped platform/architecture.

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

## October 23 Node certificate maintenance

The [October Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
blocks compromised eMudhra intermediates and fixes other Node vulnerabilities.
Source builds now require patched 22.23.4, 24.22.1, or 26.12.1 release lines.
Both absent-Node wrappers pin 22.23.4 with the official archive SHA-256 digests
for their supported platforms. Installed older Node versions remain untouched
and are rejected before build work. CI pins 24.22.1 explicitly: the previous
floating major resolved to cached 24.21.0 in the October 22 Pages test job.

Electron 43.8.3 already carries the certificate mitigation even though
process.versions.node reports 24.22.0. The [Electron advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)
lists 43.8.1 as patched and covers Chromium plus Node tls, https, and fetch.
An isolated Windows runtime probe rejected both public eMudhra test endpoints
with CERT_REVOKED through Node fetch and ERR_CERT_REVOKED through net.fetch.
The optional Telegram integration uses net.fetch in Electron, with global fetch
as its fallback. No TLS flags, trust-store overrides, or security settings change.

Neither Rust manifest or lockfile includes webpki-roots, webpki-root-certs,
rustls-webpki, rustls-native-certs, or a Rust HTTP/TLS client. No Rust CA update
applies to the current graph. This review establishes no Render deployment or
exploitation, and the separate PHP advisory has no demonstrated application path.
The package audit still has the documented low KaTeX/Markmap limitation; runtime
certificate trust is checked separately from that package audit.

## October 24 network dependency maintenance

The npm advisory refresh reports new findings in the installed build and docs
tools. Pin Undici 6.29.1 and 7.30.1 within their existing major lines and move
the fast-uri override from 3.1.8 to 3.1.9. Regenerate the lockfile with pnpm
10.34.5; keep the existing moderate threshold and required network audit.

- Undici clears [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)
  (process termination after an excessive content-encoding response closes
  early), [GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685)
  (unbounded EventSource parser state), and
  [GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472)
  (mixed-case integrity tokens bypass verification on the 7.x path).
  The installed consumers are Electron's downloader, native rebuild tooling,
  and Markmap's HTML importer. Their supported ranges accept these patches.
- fast-uri clears [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg)
  (percent-decoded scheme spoofing) and
  [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr)
  (ambiguous domain hosts). It is used by Electron Builder's Ajv schema
  validator, not by application URL policy.

`tools/scripts/network-dependency-maintenance.test.mjs` follows the installed
consumer paths. Bounded loopback child processes reproduce the early-close
crash without terminating the test runner. Coverage also rejects mismatched
mixed-case integrity metadata and ambiguous URIs while preserving valid
integrity checks, ordinary URI resolution, and Ajv reference validation.
The old dependencies fail seven of these eight tests. Markmap's actual offline
documentation command and the five platform packaging jobs check consumers.
The completed package audit now reports one low finding and no moderate, high,
or critical findings; the existing KaTeX limitation remains unchanged.

Package overrides do not update Electron's embedded Node dependencies.
Source-build Node 22.23.4 reports patched Undici 6.29.1, but the Windows Electron
43.8.3 binary reports Node 24.22.0 and affected Undici 7.29.1. As of October 24,
the published stable 43.8.3, 44.9.3, and 45.0.0 releases do not include the
[Node 24.22.1 update](https://github.com/electron/electron/pull/55164); it appears
in 46.0.0-alpha.1. Keep the supported stable runtime and track its upstream fix
separately rather than claiming the npm overrides repair its built-in fetch.
An isolated Windows `ELECTRON_RUN_AS_NODE` child reproduces the early-close
crash through that binary's global fetch against a loopback fixture. This is
component-level evidence, not a production application exploit demonstration.

No application EventSource or fetch integrity usage was found. Telegram's
normal Electron path uses Chromium `net.fetch`; its global-fetch fallback
targets the fixed Telegram API origin. This review does not establish an
attacker-controlled response path in the packaged application. It also does
not assert that the embedded Undici is patched. The earlier certificate
mitigation is a separate fix and does not establish coverage of these CVEs.
