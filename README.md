# Banji

Banji is a Flutter inventory dashboard prototype with SKU/service management workflows, stock update tooling, product ranking, localization, and built-in security guardrails.

## What Is Implemented

- Dashboard shell with key metrics, performance, and recent activity sections.
- Inventory domain model with seeded SKU and Service data.
- View All inventory page with filtering, search, and add/edit flows.
- SKU detail and Service detail editors with validation, unsaved-change handling, and SKU linking for services.
- Guided stock update flow with card deck navigation, increment presets, and confirmation/save flow.
- Product ranking page with reorder interactions and save/discard confirmation.
- App settings for language (English, Khmer) and currency (USD, KHR).
- Security utilities for input normalization/validation and opaque ID generation.

## Tech Stack

- Flutter (Material)
- Dart SDK `^3.9.0`
- `flutter_svg`
- `flutter_card_swiper`
- `google_fonts`

## Project Structure

- `lib/main.dart`: app bootstrap, top-level scopes, and routing entry.
- `lib/views/home_view.dart`: dashboard home surface.
- `lib/views/inventory_views.dart`: inventory library and feature parts.
- `lib/views/inventory/`: inventory flows (view all, details, stock update, ranking).
- `lib/views/settings_view.dart`: app settings surface.
- `lib/security/`: shared validation, limits, and ID generation.
- `lib/localization/` and `lib/l10n/`: locale controller and generated/localized strings.
- `test/`: widget, logic, and security tests.
- `tool/security/`: merge-gate security checks.

## State and Architecture Notes

- App-level state uses `ValueNotifier` + `InheritedNotifier` scopes:
  - `LocaleController`
  - `CurrencyController`
  - `InventoryController`
- Inventory features are split with `part` files under `lib/views/inventory/` for modular UI + logic.
- Domain entities:
  - `SkuItem`
  - `ServiceItem`

## Localization and Currency

- Locales: English (`en`) and Khmer (`km`).
- Currency switch: `USD` / `KHR`.
- Text resources:
  - `lib/l10n/app_en.arb`
  - `lib/l10n/app_km.arb`

## Security Baseline

Banji enforces a secure-by-default baseline for this prototype:

- Shared validators for text and numeric inputs.
- Hard limits for inventory and monetary values.
- Opaque non-timestamp IDs via secure randomness.
- Secret scanning and platform hardening checks in the security gate.

Primary references:

- `SECURITY.md`
- `docs/security/SECURITY_STANDARDS.md`
- `docs/security/THREAT_MODEL.md`
- `docs/security/SECURITY_TEST_MATRIX.md`

## Getting Started

### Prerequisites

- Flutter SDK installed and on `PATH`
- A supported Flutter target (macOS, iOS, Android, web, Linux, or Windows)

### Install Dependencies

```bash
flutter pub get
```

### Run

```bash
flutter run
```

Example target run:

```bash
flutter run -d macos
```

## Testing

Run all tests:

```bash
flutter test
```

Run inventory-focused tests:

```bash
flutter test test/inventory_pages_test.dart
flutter test test/update_stock_page_test.dart
```

Run security tests only:

```bash
flutter test test/security
```

## Security Gate (Pre-Merge)

```bash
bash tool/security/run_security_checks.sh
```

This gate runs:

1. `flutter analyze`
2. `flutter test test/security`
3. Secret pattern checks
4. Platform hardening checks

## Design Token Sync

If you update `lib/theme/app_theme.dart`, sync exported tokens for references:

```bash
bash tool/sync_design_tokens.sh
```

## Current Status

This repository is an actively evolving prototype. Some actions in the UI (for example backup/export/logout backends) are intentionally placeholder stubs pending integration design.
