# Drawers, Modals, and Popovers

## Audit Target

Test layered UI surfaces and focus behavior.

## Inspect

- Sheets, dialogs, popovers, tooltips, dropdowns, nested panels, submit/cancel flows, focus trapping, and route-neutral opening behavior.

## Real Finding Criteria

A layer opens with wrong focus, navigates before submit, traps the user, clips content, loses input, or overlaps incoherently.

## Fix Constraints

Keep popup state local until submit and preserve accessibility patterns.

## Verification Required

Exercise open, interact, submit, cancel, and close paths. Record interaction evidence in the item notes.
