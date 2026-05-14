# Data Models and Calculations

## Audit Target

Find inconsistent data models, broken assumptions between frontend/backend, incorrect derived calculations, and misleading metrics.

## Inspect

- Shared schemas, catalog models, ticket models, chart display models, analysis summaries, projections, totals, sorting/filtering, and formatted values.

## Real Finding Criteria

The issue makes different surfaces disagree, calculates a wrong value, drops required fields, or displays misleading derived state.

## Fix Constraints

Update the source model/calculation and focused tests. Do not fix only copy, labels, or formatting unless the model is already correct.

## Verification Required

Run tests that prove the model and at least one consumer agree. Record the scenario, expected value, and passing command in the item notes.
