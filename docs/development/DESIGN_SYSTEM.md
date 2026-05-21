# Kaur Khor Design System

`src/renderer/src/globals.css` is the active source of truth for the desktop UI theme.

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

- Tokens live in [`src/renderer/src/globals.css`](../../src/renderer/src/globals.css).
- UI primitives live in [`src/renderer/src/components/ui`](../../src/renderer/src/components/ui).
- Kaur Khor-specific reusable compositions live in [`src/renderer/src/components/system`](../../src/renderer/src/components/system).

## System Structure

- Shell: workspace navigation, runtime banners, quick actions
- Workspace layer: hero, metric cards, panels, banners, empty states
- Editor layer: save header, side rails, reusable form fields
- Route surfaces:
  - `Overview`
  - `Catalog`
  - `Operations`
  - `Planning`
  - `Settings`

## Implementation Rules

- Prefer semantic theme tokens over raw color classes.
- Use the shadcn field/input-group/toggle-group patterns for forms and segmented controls.
- Keep search/filter state URL-backed in catalog surfaces.
- Favor keyboard-safe actions first; drag is progressive enhancement.
- Treat English copy as canonical for now; Khmer may fall back to English for newer strings.
