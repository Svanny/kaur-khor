# Banji Desktop Design System

`desktop/src/renderer/src/globals.css` is the active source of truth for the desktop UI theme.

## Visual Direction

- Mood: warm editorial operations desk
- Core palette:
  - ink `#1b0f07`
  - paper `#fbf5f1`
  - copper `#bd7c51`
  - sage `#d4de9d`
  - accent green `#9ecd6a`
- Typography:
  - primary UI/display: `Helvetica Neue`
  - locale fallbacks: `Noto Sans Khmer`, `Noto Sans Oriya`

## Token Sources

- Desktop tokens live in [`desktop/src/renderer/src/globals.css`](/Users/svanny/banji/desktop/src/renderer/src/globals.css).
- Desktop UI primitives live in [`desktop/src/renderer/src/components/ui`](/Users/svanny/banji/desktop/src/renderer/src/components/ui).
- Banji-specific reusable compositions live in [`desktop/src/renderer/src/components/system`](/Users/svanny/banji/desktop/src/renderer/src/components/system).

## System Structure

- Shell: workspace navigation, runtime status, quick actions
- Workspace layer: hero, metric cards, panels, banners, empty states
- Editor layer: save header, side rails, reusable form fields
- Route surfaces:
  - `Overview`
  - `Catalog`
  - `Stock Room`
  - `Merchandising`
  - `Preferences`

## Implementation Rules

- Prefer semantic theme tokens over raw color classes.
- Use the shadcn field/input-group/toggle-group patterns for forms and segmented controls.
- Keep search/filter state URL-backed in catalog surfaces.
- Favor keyboard-safe actions first; drag is progressive enhancement.
- Treat English copy as canonical for now; Khmer may fall back to English for newer strings.

## Legacy Note

- [`lib/theme/app_theme.dart`](/Users/svanny/banji/lib/theme/app_theme.dart) and `tool/sync_design_tokens.sh` remain Flutter migration references.
- They are not the active desktop token pipeline anymore.
