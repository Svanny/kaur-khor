# UI Interactions

## Audit Target

Find broken, misleading, unresponsive, or incomplete user interactions.

## Inspect

- Buttons, forms, dropdowns, tabs, drawers, modals, popovers, command actions, navigation, and back/forward behavior.
- Disabled states, submit flows, cancel flows, focus, keyboard access, and post-action feedback.

## Real Finding Criteria

The issue prevents a valid action, performs the wrong action, loses user input, navigates unexpectedly, or leaves no usable feedback.

## Fix Constraints

Keep action state local until submit where appropriate and avoid changing unrelated navigation or styling.

## Verification Required

Exercise the interaction through tests or real UI tooling. Record the action path and result in the item notes.
