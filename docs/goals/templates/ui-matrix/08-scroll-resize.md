# Scroll and Resize

## Audit Target

Test scroll containers, nested scrolling, window resizing, and layout stability.

## Inspect

- Long pages, tables, charts, right rails, collapsed sidebars, drawers, Electron window resize, and browser responsive resize.

## Real Finding Criteria

Scrolling becomes trapped, content is unreachable, layout jumps, panes collapse, or measurements become stale after resize.

## Fix Constraints

Use stable dimensions and coalesced geometry reads where needed.

## Verification Required

Verify before/after resize and scroll behavior with screenshots or UI automation. Record dimensions in the item notes.
