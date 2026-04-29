# UI Design System

Back to the docs index: [banji developer docs](/Users/svanny/banji/docs/README.md)

## Brand Button Rule

Every visible-label button must include a corresponding icon next to the label. This is a brand guideline, not a recommendation.

Use the shared icon modules under `src/icons` and mark inline button icons with `data-icon="inline-start"` or `data-icon="inline-end"`. The icon should describe the action, destination, or object the button acts on. Examples:

- destructive or cancel actions use close/delete style icons
- save/apply/confirm actions use confirm or save style icons
- navigation actions use navigation icons
- item actions use SKU, service, customer, ticket, package, or receipt icons

Icon-only and graphical controls are allowed only when the control has no visible text label and provides an accessible label such as `aria-label`. Do not use icon-only controls to avoid this rule for normal action buttons.

## Destructive Button Rule

Every destructive button must use destructive UI treatment. If the action deletes, removes, discards, destroys, erases, or clears current data, the button must render with a destructive variant instead of neutral `default`, `outline`, or `ghost` treatment.

For shared `Button` usage, use `variant="destructive"` or `variant="destructive-outline"`. Prefer `destructive-outline` for secondary destructive actions inside mixed action rows, and `destructive` for primary danger-zone actions. For custom native `button` controls, the styling must include destructive tokens such as destructive border, text, or background treatment.

The logs `Delete report` button is the reference behavior. Treat that styling as the minimum standard for destructive actions elsewhere in the product.

## Toggle Pill Icon Rule

Every visible-label toggle pill must include a corresponding icon next to the label. This applies to shared `ToggleGroupItem` usage and any pill-shaped toggle controls that render visible text.

Timeframe and date-range toggles are the exception. Pills such as `H`, `1D`, `7D`, `30D`, `1M`, `YTD`, `1Y`, `Recent`, `All`, and `Custom` may stay text-only when they are part of a timeframe or date-range selector. This applies to both `ToggleGroupItem` pills and native `button` controls inside chart duration or timeframe containers (e.g. `aria-label="Chart duration"` or `aria-label="Chart timeframe"`).

Scope pills, filter pills, status pills, confidence pills, and workbench pills are still not exempt. Use the shared icon modules under `src/icons` and keep the icon inside the toggle pill content before the text.

If a toggle uses custom tile content, the tile still needs a visible icon adjacent to the text treatment. Do not ship text-only toggle pills.

The regression gate is `src/renderer/src/lib/design-rules.test.ts`. It scans renderer source and fails when a visible-label `button`, shared `Button`, or non-timeframe visible-label `ToggleGroupItem` lacks an icon descendant, and when a destructive button lacks destructive treatment. Do not add allowlists for new debt.

## Centered Command Tile Grid Rule

Use `CenteredTileGrid` for route surfaces that present a small fixed set of large command tiles, such as Home primary actions and the Capture hub. The component measures the remaining workspace area, sizes square tiles from the available width and height, centers the grid's center of gravity in that area, and keeps the horizontal and vertical gaps identical.

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

Page memory can also store small scoped values such as chart layout preferences through `readRememberedPageValue()` and `writeRememberedPageValue()`. Use validators for these values and clear default values from storage so the remembered record remains small and route-focused.
