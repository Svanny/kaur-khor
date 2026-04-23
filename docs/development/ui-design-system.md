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

Timeframe and date-range toggles are the exception. Pills such as `H`, `1D`, `7D`, `30D`, `1M`, `YTD`, `1Y`, `Recent`, `All`, and `Custom` may stay text-only when they are part of a timeframe or date-range selector.

Scope pills, filter pills, status pills, confidence pills, and workbench pills are still not exempt. Use the shared icon modules under `src/icons` and keep the icon inside the toggle pill content before the text.

If a toggle uses custom tile content, the tile still needs a visible icon adjacent to the text treatment. Do not ship text-only toggle pills.

The regression gate is `src/renderer/src/lib/design-rules.test.ts`. It scans renderer source and fails when a visible-label `button`, shared `Button`, or non-timeframe visible-label `ToggleGroupItem` lacks an icon descendant, and when a destructive button lacks destructive treatment. Do not add allowlists for new debt.

## Page State Memory Rule

Every top-level page control must use URL-backed state, and top-level navigation must restore the last remembered URL state for that page. If the user leaves a page and comes back through the sidebar or command palette, filters, toggle pills, search text, selected page section, and date/timeframe controls should match where they left off.

Persist only safe page-level controls. Do not persist selected rows, open drawers, popups, destructive dialogs, detail-page actions, or in-progress wizard form data as page state.

Use `src/renderer/src/lib/page-state-memory.ts` for page-state persistence and remembered href builders. The memory is local-first and reload-safe via `localStorage`; resetting a page to its canonical default state must clear that page's remembered entry.
