# Iterative Bug Crusher Template

Goal: perform repeated audit/fix/verify passes until no high-confidence actionable bugs remain.

Use this template as the control file for a long-horizon maintenance pass. Keep the main loop here, and load only the active checklist item file unless more context is required.

## Loop

Before the first pass, map the repository structure, major runtime surfaces, data flow, build scripts, test scripts, and documentation locations.

1. Pick the next unchecked checklist item below and open its linked file.
2. Load only the minimum repo context needed for that item.
3. Inspect for findings in that issue class.
4. For each candidate finding, record location, category, why it is real, expected impact, fix strategy, and verification method.
5. Fix only real, actionable, code-evidenced findings that are in scope.
6. Run the most relevant checks for the changed path, such as typecheck, unit tests, integration tests, UI/E2E tests, build, desktop smoke, or browser/demo smoke.
7. If a check cannot be run, record why and use the closest available verification method.
8. Update docs, comments, implementation notes, or project knowledge only when behavior, setup, architecture, testing, data handling, or known constraints changed.
9. Review `git status`; stage only files that belong to the completed fix batch with targeted `git add` commands. Leave unrelated user changes untouched.
10. Record fixes, verification, docs/knowledge updates, staged files, and remaining risk.
11. Mark the checklist item `[x]` here when it is complete for this pass.
12. Continue until every item is checked.

After every item is `[x]`, start a fresh pass by resetting the checklist to unchecked if the goal is continuing. Repeat until a fresh pass finds no high-confidence actionable issues.

Stop when no further real findings are found, remaining items are speculative/low-confidence/product decisions/user-input-dependent, or a blocking issue prevents verification.

Prioritize data corruption/loss, runtime crashes, security, backend/data handling, state propagation, rendering/layout, broken interactions, protective tests, documentation drift, then cleanup that reduces future bug risk.

## Checklist

Open the linked file for the active checklist item. Paths are relative to the repository root so this template can be pasted elsewhere. **DO NOT** edit the files below. Edits are only allowed in this file.

- [ ] [Security issues](docs/goals/templates/iterative-bug-crusher/01-security.md)
- [ ] [Data validation](docs/goals/templates/iterative-bug-crusher/02-data-validation.md)
- [ ] [Logic bugs](docs/goals/templates/iterative-bug-crusher/03-logic-bugs.md)
- [ ] [State propagation](docs/goals/templates/iterative-bug-crusher/04-state-propagation.md)
- [ ] [Race conditions](docs/goals/templates/iterative-bug-crusher/05-race-conditions.md)
- [ ] [Persistence](docs/goals/templates/iterative-bug-crusher/06-persistence.md)
- [ ] [Rendering](docs/goals/templates/iterative-bug-crusher/07-rendering.md)
- [ ] [UI interactions](docs/goals/templates/iterative-bug-crusher/08-ui-interactions.md)
- [ ] [Error handling](docs/goals/templates/iterative-bug-crusher/09-error-handling.md)
- [ ] [Documentation drift](docs/goals/templates/iterative-bug-crusher/10-doc-drift.md)
- [ ] [Backend and data handling](docs/goals/templates/iterative-bug-crusher/11-backend-data-handling.md)
- [ ] [Imports, types, and dead code](docs/goals/templates/iterative-bug-crusher/12-imports-types-dead-code.md)
- [ ] [Data models and calculations](docs/goals/templates/iterative-bug-crusher/13-data-models-calculations.md)
- [ ] [Empty, generated, and dependent data states](docs/goals/templates/iterative-bug-crusher/14-empty-generated-dependent-states.md)
- [ ] [Regression test coverage](docs/goals/templates/iterative-bug-crusher/15-regression-test-coverage.md)

## Final Response

Report the number of passes completed, findings fixed, checks run, docs or knowledge updated, files staged or changed, and any unresolved risks.
