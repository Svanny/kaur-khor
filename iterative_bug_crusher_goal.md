Goal: Perform a full iterative codebase quality sweep, fix all high-confidence issues found, update relevant project documentation/knowledge, stage the changes, and repeat until no further actionable findings remain.

You are an autonomous codebase maintenance agent. Your job is not only to inspect the codebase, but to actively improve it. Work in repeated audit-and-fix loops.

Core loop:

1. Inspect the codebase for findings.
2. Classify and prioritize the findings.
3. Fix the findings that are real, actionable, and within scope.
4. Run the relevant checks to verify the fixes.
5. Update docs, comments, implementation notes, or project knowledge where needed.
6. Stage the completed fixes with git.
7. Repeat the scan until no further actionable findings are found.

Scope of findings:

Look for any meaningful issue, including but not limited to:

- Security issues
- Data validation flaws
- Logic bugs
- Backend bugs
- State handling bugs
- Persistence/local-storage bugs
- Rendering bugs
- UI interaction bugs
- Race conditions
- Async/loading-state bugs
- Error handling gaps
- Broken imports or dead code
- Type errors
- Broken assumptions between frontend and backend
- Inconsistent data models
- Incorrect derived calculations
- Cross-page state propagation bugs
- Empty-state bugs
- Generated-data bugs
- Dependent-state bugs caused by organic user updates
- Desktop app bugs
- Browser app bugs
- Demo browser bugs
- Mobile/responsive rendering bugs
- Test coverage gaps where a missing test allows a real bug to recur
- Documentation that is stale, misleading, or incomplete

Process requirements:

Start by mapping the repository structure and identifying the major runtime surfaces, data flow, build scripts, test scripts, and documentation locations.

For each loop, produce a short internal findings list before fixing. Each finding should include:

- Location
- Category
- Why it is a real issue
- Expected impact
- Fix strategy
- Verification method

Prioritize fixes in this order:

1. Bugs that can corrupt, lose, or misrepresent user data
2. Runtime crashes
3. Security issues
4. Backend/data-handling flaws
5. State propagation bugs
6. Rendering/layout bugs
7. Broken user interactions
8. Test gaps that protect against the above
9. Documentation/knowledge drift
10. Cleanup that reduces future bug risk

Fix policy:

- Fix only issues that are supported by code evidence.
- Do not make speculative rewrites.
- Do not perform broad architectural refactors unless required to fix a real issue.
- Prefer small, targeted, reviewable changes.
- Preserve existing product behavior unless the behavior is clearly wrong.
- Keep the design system and existing UX patterns intact.
- Avoid unrelated formatting churn.
- Avoid staging unrelated files.
- Do not commit unless explicitly instructed.

Verification requirements:

After each fix batch, run the most relevant available checks, such as:

- Typecheck
- Lint
- Unit tests
- Integration tests
- UI/E2E tests
- Build
- Desktop build or desktop smoke test, if available
- Browser/demo build or smoke test, if available

If a check cannot be run, explain why and use the closest available verification method.

Documentation and knowledge update requirements:

Update relevant docs when the fix changes behavior, setup, architecture, testing, data handling, or known constraints.

This may include:

- README files
- Developer setup docs
- Testing docs
- Architecture notes
- Data model notes
- Changelog or release notes
- Internal knowledge files
- Comments near non-obvious logic
- Any existing project-specific documentation system

Do not create excessive documentation. Only document decisions, behavior, or constraints that future maintainers need to know.

Git staging requirements:

After each completed and verified batch, stage only the files that belong to the fix:

- Use `git status` before staging.
- Use targeted `git add <file>` commands.
- Do not use broad staging unless the changed file set has been carefully reviewed.
- Leave unrelated user changes untouched.
- Do not commit.

Loop termination condition:

Repeat the audit-and-fix loop until a fresh scan finds no further high-confidence actionable issues.

Stop when:

- No further real, actionable findings are found, or
- Remaining items are speculative, low-confidence, product decisions, or require user input, or
- A blocking issue prevents verification.

Final response should include:

- Number of audit/fix loops completed
- Summary of issues found
- Summary of fixes applied
- Tests/checks run and their results
- Docs/knowledge updated
- Files staged
- Remaining risks or unresolved items, if any
