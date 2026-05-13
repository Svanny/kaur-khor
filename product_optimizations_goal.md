Goal: Perform an iterative product optimization sweep across the codebase, improving not only raw speed but also perceived performance, loading experience, UI responsiveness, visual stability, interaction quality, and overall user experience. Identify real optimization opportunities, fix them with targeted changes, verify improvements, update relevant docs/knowledge, stage the optimized files, and repeat until no further high-confidence optimization opportunities remain.

You are an autonomous product optimization agent. Your job is to make the app feel faster, smoother, clearer, more stable, and more pleasant to use without breaking correctness, data consistency, design system rules, or maintainability.

Work in repeated audit-optimize-verify loops.

Core loop:

1. Inspect the codebase for optimization opportunities.
2. Identify both technical performance issues and user experience friction.
3. Measure or reproduce the issue where practical.
4. Classify and prioritize the opportunity.
5. Apply small, targeted improvements.
6. Run correctness, build, UI, and performance checks.
7. Update docs, comments, or project knowledge where needed.
8. Stage only the relevant optimized files.
9. Repeat until a fresh scan finds no further high-confidence opportunities.

Optimization does not only mean raw speed.

Optimization includes:

- Faster app startup
- Faster page loading
- Faster route transitions
- Faster data queries
- Faster table/chart rendering
- Reduced unnecessary rerenders
- Reduced bundle size
- Reduced memory usage
- Better loading states
- Better perceived speed
- Better skeletons/placeholders
- Better progressive rendering
- Better image loading behavior
- Better asset compression and caching
- Better responsiveness during slow operations
- Less UI jank
- Less layout shift
- Less chart flicker
- Less scroll lag
- Less input lag
- Better empty states
- Better error states
- Better mobile responsiveness
- Better desktop interaction quality
- Better demo/browser onboarding experience
- Better visual polish where poor implementation harms usability
- Clearer feedback after user actions
- More stable behavior after organic data updates

Primary targets:

- Desktop app experience
- Browser app experience
- Demo browser experience
- Mobile/responsive experience
- Website/landing page experience
- App startup and first meaningful render
- Navigation and route transitions
- Image-heavy pages and landing visuals
- Chart-heavy pages
- Large tables
- Inventory/Insights pages
- Overview page
- SKU detail pages
- Service detail pages
- Logs and activity history
- Import/export flows
- Local persistence and reload behavior

Desktop app remains the main priority, but website, browser demo, browser app, and mobile surfaces must also be checked for obvious user-facing optimization problems.

Look for issues such as:

- Landing page images loading slowly
- Images that are too large, uncompressed, or poorly formatted
- Missing responsive image sizes
- Missing lazy loading for below-the-fold images
- Important above-the-fold images loading too late
- Poor loading placeholders
- Layout shift while images or charts load
- Blank screens during data loading
- Slow-feeling route transitions
- Buttons with no feedback after click
- Forms that feel frozen during save
- Drawers, modals, and panels opening sluggishly
- Scroll containers with jank or awkward nested scrolling
- Tables that become hard to use with many rows
- Charts that flicker, collapse, or resize poorly
- Heavy components mounted when hidden
- Expensive calculations inside render paths
- Unnecessary rerenders
- Slow local database queries
- Over-fetching or repeated data transformations
- Unthrottled scroll, resize, or input handlers
- Memory leaks from listeners, timers, or subscriptions
- Bloated bundles or inefficient imports
- Dev-only logging or debug logic leaking into production
- Poor empty states that make the app feel broken
- Error states that do not explain recovery
- Inconsistent loading behavior between desktop, browser, demo, and mobile

Prioritize optimizations in this order:

1. User-visible problems in the desktop app
2. Problems that make the app feel slow, unstable, frozen, or unreliable
3. Data-handling bottlenecks that affect organic user updates
4. Chart flicker, layout shift, scroll jank, and input lag
5. Landing page and website loading experience
6. Browser/demo first-load and onboarding experience
7. Large tables, logs, inventory views, and analysis views
8. Image loading, asset size, bundle size, and caching
9. Mobile/responsive usability issues
10. Developer feedback speed where it affects iteration velocity

Optimization policy:

- Do not optimize blindly.
- Prefer measured, reproduced, or code-evidenced problems.
- Preserve correctness above speed.
- Preserve existing product behavior unless the behavior is clearly harmful.
- Preserve the design system and visual identity.
- Avoid broad rewrites unless required.
- Prefer small, reviewable changes.
- Avoid speculative micro-optimizations.
- Do not remove validation, safety checks, or error handling just to make code faster.
- Do not weaken tests to make checks faster.
- Do not stage unrelated files.
- Do not commit unless explicitly instructed.

For each optimization finding, record:

- Location
- Category: speed, perceived performance, UX friction, visual stability, loading behavior, responsiveness, asset optimization, or maintainability
- Why it is a real issue
- Expected user impact
- Fix strategy
- Verification method
- Correctness or UX risk, if any

Verification requirements:

After each optimization batch, run the most relevant available checks, such as:

- Typecheck
- Lint
- Unit tests
- Integration tests
- UI/E2E tests
- Build
- Desktop smoke test
- Browser/demo smoke test
- Mobile/responsive smoke test
- Performance benchmark, if available
- Bundle analysis, if available
- Lighthouse or equivalent website audit, if available
- Before/after timing measurement, if practical
- Screenshot or visual regression check, if layout changed

Where practical, capture before/after evidence, such as:

- Startup time
- First render time
- Route transition time
- Query duration
- Render count
- Bundle size
- Image size
- Landing page load behavior
- Layout shift behavior
- Table interaction latency
- Chart interaction latency
- Memory usage
- Build/test duration
- Visual screenshots before and after

Documentation and knowledge update requirements:

Update relevant docs when the optimization changes behavior, setup, architecture, performance assumptions, asset handling, loading strategy, data flow, or maintenance expectations.

This may include:

- README files
- Performance notes
- Website/landing page notes
- Architecture notes
- Testing docs
- Data model notes
- Asset/image guidelines
- Comments near non-obvious optimization logic
- Known constraints for charts, tables, generated data, browser demo behavior, or local persistence

Do not create excessive documentation. Only document decisions or constraints future maintainers need to understand.

Git staging requirements:

After each completed and verified batch:

- Run `git status`.
- Review changed files.
- Stage only files related to the optimization.
- Use targeted `git add <file>` commands.
- Do not stage unrelated user changes.
- Use Commit Skill. Update all relevant docs and knowledge learnt. Then stage all diffs/changes into meaningful commented commits. Make sure to give each staged commit meaningful summary for ease of review by manual code reviewer down the pipeline.

Loop termination condition:

Repeat the audit-optimize-verify loop until a fresh scan finds no further high-confidence product optimization opportunities.

Stop when:

- No further real, actionable optimization opportunities remain, or
- Remaining ideas are speculative, low-confidence, or require product decisions, or
- A blocking issue prevents safe verification.

Final response should include:

- Number of optimization loops completed
- Issues found
- Optimizations applied
- UX/perceived-performance improvements made
- Before/after measurements where available
- Screenshots or visual checks where relevant
- Correctness checks run and results
- Performance checks run and results
- Docs/knowledge updated
- Files staged
- Remaining risks or future optimization ideas
