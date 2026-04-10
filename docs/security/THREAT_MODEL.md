# Threat Model

Developer docs entrypoint: [Banji developer docs](/Users/svanny/banji/docs/README.md)

## Assets

- Inventory, service, ranking, and stock-report data.
- Desktop runtime integrity.
- Local preferences, backup snapshots, and any future local secrets.

## Trust Boundaries

- User input to renderer state and persisted desktop-core records.
- Electron main/preload contracts to renderer execution.
- Source tree to security gate scripts and tests.

## Threats

- Input abuse causing invalid state or unsafe rendering.
- Predictable IDs enabling resource enumeration or accidental collisions.
- Renderer escape through weak Electron window or preload configuration.
- Secret leakage via source, tests, or scripts.

## Mitigations

- Shared normalization and validation in the renderer.
- Opaque random ID generation for SKU and service records.
- Preload-only IPC bridge with `contextIsolation: true` and `nodeIntegration: false`.
- Secret pattern scanning and Electron hardening checks in the merge gate.

## Residual Risks

- Packaging, signing, and notarization are out of scope for the current local desktop workflow.
- Any future sync or remote-service features will require additional transport, authentication, and secret-storage controls.
