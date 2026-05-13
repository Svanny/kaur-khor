# UI Design System

Back to the docs index: [Kaur Khor developer docs](../README.md)

## Brand Button Rule

Every visible-label button must include a corresponding icon next to the label. This is a brand guideline, not a recommendation.

Use the shared icon modules under `src/icons` and mark inline button icons with `data-icon="inline-start"` or `data-icon="inline-end"`. The icon should describe the action, destination, or object the button acts on. Examples:

- destructive or cancel actions use close/delete style icons
- save/apply/confirm actions use confirm or save style icons
- navigation actions use navigation icons
- item actions use SKU, service, customer, ticket, package, or receipt icons

Icon-only and graphical controls are allowed only when the control has no visible text label and provides an accessible label such as `aria-label`. Do not use icon-only controls to avoid this rule for normal action buttons.

Pagination endpoint buttons labeled First and Last are the only visible-label button exception. Keep the adjacent Previous and Next pagination controls icon-only with accessible labels, but do not add inline icons to the First and Last text buttons.

## Destructive Button Rule

Every destructive button must use destructive UI treatment. If the action deletes, removes, discards, destroys, erases, or clears current data, the button must render with a destructive variant instead of neutral `default`, `outline`, or `ghost` treatment.

For shared `Button` usage, use `variant="destructive"` or `variant="destructive-outline"`. Prefer `destructive-outline` for secondary destructive actions inside mixed action rows, and `destructive` for primary danger-zone actions. For custom native `button` controls, the styling must include destructive tokens such as destructive border, text, or background treatment.

The logs `Delete report` button is the reference behavior. Treat that styling as the minimum standard for destructive actions elsewhere in the product.

## Toggle Pill Icon Rule

Every visible-label toggle pill must include a corresponding icon next to the label. This applies to shared `ToggleGroupItem` usage and any pill-shaped toggle controls that render visible text.

Timeframe and date-range toggles are the exception. Pills such as `H`, `1D`, `7D`, `30D`, `1M`, `YTD`, `1Y`, `Recent`, `All`, and `Custom` may stay text-only when they are part of a timeframe or date-range selector. This applies to both `ToggleGroupItem` pills and native `button` controls inside chart duration or timeframe containers (e.g. `aria-label="Chart duration"` or `aria-label="Chart timeframe"`).

Scope pills, filter pills, status pills, confidence pills, and workbench pills are still not exempt. Use the shared icon modules under `src/icons` and keep the icon inside the toggle pill content before the text.

If a toggle uses custom tile content, the tile still needs a visible icon adjacent to the text treatment. Do not ship text-only toggle pills.

The regression gate is `src/renderer/src/lib/design-rules.test.ts`. It scans renderer source and fails when a visible-label `button`, shared `Button`, or non-timeframe visible-label `ToggleGroupItem` lacks an icon descendant, except for First and Last pagination endpoint buttons, and when a destructive button lacks destructive treatment. Do not add allowlists for new debt.

## Centered Command Tile Grid Rule

Use `CenteredTileGrid` for route surfaces that present a small fixed set of large command tiles, such as Home primary actions and the Capture hub. The component owns the shared row/column metadata, tile-size CSS variables, and centered inner grid so embedded browser surfaces can override the same contract without page-specific math. It keeps the grid centered by default and exposes stable `data-slot` markers for route-level tests and embedded layout rules.

Do not re-create page-specific viewport math for these command grids. If a new surface needs a 2x2 or compact command-tile launcher, reuse the shared component so card gaps, centering, and no-scroll behavior stay consistent.

## Liquid Grid Card Rule

Use `LiquidGridCard` or `liquidGridCardBaseClassName` plus `LiquidGridCardLayer` for large square hub tiles that share the glass-like command-card treatment. Work, Insights, and Capture hub cards should use this shared surface instead of duplicating local border, shadow, hover, and overlay classes.

Keep card colors supplied by `gridCardSurfaceClassName()`. New hub tones belong in `src/renderer/src/lib/grid-card-colors.ts`, not as one-off route classes. Tests may assert the color token classes for route-specific semantics, but route code should stay tied to the shared color map.

## Interface View Presets

Interface visibility uses four modes from `src/shared/interface-view.ts`: Default, Minimal, Maximal, and Custom. Default is the first-run baseline; Minimal hides optional layers; Maximal turns every optional layer on; Custom stores the operator's manual switch combination.

Use `InterfaceViewModeCards` for preset selection in onboarding and Settings / Interface. The component renders centered fixed-card tracks with responsive 1/2/3/4-column layouts, a 1.2:1 preview area, and denser wireframe content. It accepts a `language` prop for localized labels and descriptions (English and Khmer).

Onboarding intentionally offers only Default, Minimal, and Maximal. Settings / Interface shows all four modes. Manual switch changes should resolve back to a named preset only when the full visibility set exactly matches that preset; otherwise they should persist as Custom. The cards are backed by the same visibility model that the settings switches use.

## Page State Memory Rule

Every top-level page control must use URL-backed state, and top-level navigation must restore the last remembered URL state for that page. If the user leaves a page and comes back through the sidebar or command palette, filters, toggle pills, search text, selected page section, and date/timeframe controls should match where they left off.

Persist only safe page-level controls. Do not persist selected rows, open drawers, popups, destructive dialogs, detail-page actions, or in-progress wizard form data as page state.

Use `src/renderer/src/lib/page-state-memory.ts` for page-state persistence and remembered href builders. The memory is local-first and reload-safe via `localStorage`; resetting a page to its canonical default state must clear that page's remembered entry.

Page memory can also store small scoped values such as chart layout preferences through `readRememberedPageValue()` and `writeRememberedPageValue()`. Use validators for these values and clear default values from storage so the remembered record remains small and route-focused. Chart pane heights are only restorable when they are marked as manual user resizes; passive chart measurements should not become persisted layout preferences.

## Floating Action Measurement Rule

Floating title actions and adjacent floating control islands must coalesce scroll, resize, and observer-driven geometry reads through `requestAnimationFrame`. Keep the first measurement immediate so the island appears without a delayed frame, but do not run repeated `getBoundingClientRect()` reads directly inside scroll or resize handlers.

## Cross-Runtime Auto-Zoom Rule

Use `src/shared/responsive-zoom.ts` as the single threshold model for desktop, web demo, and browser app responsive zoom. The model must consider available width, height, and viewport area, with width as the primary design signal and height/area allowed to tighten the resulting scale. Treat `1600x900` as the normal full-density product viewport; step down around the common `1440`, `1280`, and `1120` width tiers, the `900`, `800`, `720`, and `640` height tiers, and their paired areas. Desktop must apply that model through Electron `webContents.setZoomLevel()` so the whole app scales consistently and must keep resizable windows landscape-first. The web demo and browser app must apply it only inside the embedded product wrapper, not on the public landing page.

For public phone portrait browser views, show the rotate prompt instead of exposing the desktop shell in a cramped upright frame. The normal browser app and demo should use the phone-landscape wrapper for the prompt state, with the wrapper owning the rotated scroll area, viewport CSS variables, and embedded shell attributes. Normal component-level responsive swaps, container queries, and measured controls still belong inside their local components; do not duplicate app-wide threshold math in route code.
