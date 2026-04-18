# Banji

Banji is a desktop inventory workspace for small teams that want a local-first tool with built-in analysis.

It is not trying to be a full ERP or a hosted SaaS product. It is a desktop app for keeping a catalog, recording stock changes and real-world signals, and letting Banji's local analysis layer turn those updates into practical next actions.

[Download latest release](https://github.com/Svanny/banji/releases/latest) · [Browse releases](https://github.com/Svanny/banji/releases) · [Report an issue](https://github.com/Svanny/banji/issues)

## User Guide

Detailed end-user help lives in:

- English: [docs/user-guide.md](docs/user-guide.md)
- Khmer: [docs/user-guide.km.md](docs/user-guide.km.md)

The guides explain Banji's current workspaces, lane-based update flows, important buttons and controls, glossary terms, and troubleshooting FAQ. The in-app `Help` page mirrors these docs.

## Screenshots

| Overview | Record update |
| --- | --- |
| ![Banji overview workspace](docs/readme/overview-fullscreen.png) | ![Banji record update workspace](docs/readme/record-update-fullscreen.png) |

| Performance | Financials |
| --- | --- |
| ![Banji performance workspace](docs/readme/performance-fullscreen.png) | ![Banji financials workspace](docs/readme/financials-fullscreen.png) |

| Catalog | Analysis |
| --- | --- |
| ![Banji catalog workspace](docs/readme/catalog-fullscreen.png) | ![Banji analysis workspace](docs/readme/analysis-fullscreen.png) |

## What To Expect

- A desktop app with downloadable releases for macOS, Windows, and Linux.
- A bundled local runtime and local workspace storage inside the app.
- A workflow centered on catalog management, lane-based update capture, operational follow-up, money views, and analysis.
- A product that is opinionated about Banji's current inventory model rather than a blank-slate platform.
- A repository where the README is the top-level overview and the deeper developer docs live in `docs/`.

## What's Included

- Catalog management for SKUs and services.
- A lane-based record-update hub for stock counts, customer orders, supplier orders, receipts, and custom combined capture flows.
- Overview and performance surfaces that turn updates into concrete follow-up tasks.
- A financial workspace that turns the same inventory state into money-in, money-tied-up, and money-leaking views.
- An operations workspace for saved update history, heatmap inspection, report editing, and report deletion.
- Analysis and Help views that explain what the current inventory picture seems to be and how Banji works.
- Local settings for language and currency, including English and Khmer plus USD and KHR support.

## Current Limits

- Banji is desktop-first.
- Banji is local-first.
- It is not marketed here as a multi-user cloud suite, marketplace tool, or full back-office system.
- It still reflects one specific operating model, so some teams will find it immediately useful and others will find it too opinionated.

## SENA

Banji uses **SENA** as its local analysis engine. SENA is what turns saved observations into reorder pressure, timing risk, blocker detection, and explanation surfaces inside the app.

If you want the reference document, see [References/SENA/SENA.pdf](References/SENA/SENA.pdf).

## Downloads

Releases are published through GitHub Releases:

- macOS: DMG builds for Intel and Apple Silicon
- Windows: x64 installer
- Linux: x64 AppImage and `.deb`

Depending on the platform and release signing status, your OS may show extra trust warnings during install. The release page is the source of truth for the latest downloadable artifacts. Release assets follow the repo packaging template `Banji-<version>-<os>-<arch>.<ext>`, matching `electron-builder.yml`.

### Running Unsigned Builds On macOS

If macOS blocks Banji because the app is unsigned:

1. Try opening the app with `Control` + click, then choose `Open`.
2. If macOS still blocks it, go to `System Settings` -> `Privacy & Security`, find the Banji warning near the bottom, and click `Open Anyway`.
3. Re-open the app and confirm the final prompt.

This allows Banji to run without disabling Gatekeeper globally.

### Running Unsigned Builds On Windows

To install Banji on Windows:

1. Download the `.exe` installer from the `v0.1.5` GitHub release.
2. Double-click the installer to start setup.

If Windows shows a SmartScreen warning because the build is unsigned:

1. Click `More info` in the warning dialog.
2. Click `Run anyway`.
3. Continue through the installer prompts.

This allows Banji to install without changing SmartScreen system-wide.

### Installing And Running Builds On Linux

If you downloaded the `.deb` package on Ubuntu or Debian:

```bash
sudo apt install ./Banji-0.1.5-linux-x64.deb
```

Example:

- `0.1.5` is the current release version in this repo
- `x64` is the x64 Linux build artifact name
- ARM Linux builds use `arm64`, for example `Banji-0.1.5-linux-arm64.deb`

If you downloaded the AppImage:

```bash
chmod +x Banji-0.1.5-linux-x64.AppImage
./Banji-0.1.5-linux-x64.AppImage
```

Example:

- `Banji-0.1.5-linux-x64.AppImage` is for x64 Linux
- `Banji-0.1.5-linux-arm64.AppImage` is for ARM64 Linux

If Linux blocks the AppImage or warns that it is untrusted:

1. Make the AppImage executable with `chmod +x`.
2. Open the file from a terminal instead of double-clicking it first.
3. If your desktop asks for confirmation, approve the launch for this file.

Banji does not require disabling Linux security features globally. Most install friction comes from the file not being marked executable yet.

## Development

### Prerequisites

- Node.js 20+
- `pnpm`
- Rust toolchain

Install Node.js 20+ from [nodejs.org](https://nodejs.org/).

Install Rust from [rust-lang.org/tools/install](https://rust-lang.org/tools/install/).

### Install

```bash
pnpm install
```

### Run

```bash
pnpm dev
```

### Tests

```bash
pnpm test
cargo test --manifest-path apps/desktop-core/Cargo.toml
```

### Repo Shape

The current local app is organized around these paths:

- `src/main`: Electron main process, app boot, IPC handlers, local data paths, backup and restore behavior
- `src/preload`: preload bridge that exposes `window.banjiDesktop`
- `src/renderer`: React routes, settings flows, workspace UI, and command palette behavior
- `src/shared`: shared IPC contracts and TypeScript types
- `apps/desktop-core`: Rust desktop runtime used for local persistence and core workflows
- `apps/sena-core`: Rust SENA analysis engine
- `tool/security`: desktop security gate scripts
- `tool/sync_design_tokens.sh`: design-token sync helper

For contributor-oriented documentation, see [docs/README.md](docs/README.md).

### Packaging

```bash
pnpm package:mac
pnpm package:linux
pnpm package:win:native
```
