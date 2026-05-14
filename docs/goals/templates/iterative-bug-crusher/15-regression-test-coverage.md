# Regression Test Coverage

## Audit Target

Find missing tests where an existing or newly fixed bug could recur.

## Inspect

- Adjacent unit tests, integration tests, UI tests, benchmark checks, fixtures, and helper coverage for each real finding fixed in this pass.

## Real Finding Criteria

The behavior is important enough that a future regression would affect data correctness, runtime stability, security, UI usability, persistence, or release confidence.

## Fix Constraints

Add focused coverage for the bug class. Do not weaken assertions or add broad brittle tests just to raise coverage count.

## Verification Required

Run the new or updated tests plus any minimal related checks. Record the regression scenario and command output in the item notes.
