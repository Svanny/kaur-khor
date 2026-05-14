# Browser Parity

## Audit Target

Test the browser app for parity with critical desktop workflows and local-first constraints.

## Inspect

- Navigation, storage fallback behavior, bridge differences, import/export, settings, and major populated/fresh views.

## Real Finding Criteria

Browser mode diverges from expected behavior, loses local state, shows desktop-only controls incorrectly, or breaks key workflows.

## Fix Constraints

Respect browser runtime boundaries and do not expose desktop-only APIs.

## Verification Required

Use browser UI tests or manual browser checks at the correct route. Record parity gaps and evidence in the item notes.
