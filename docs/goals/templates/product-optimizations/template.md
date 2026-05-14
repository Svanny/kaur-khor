# Product Optimizations Template

Goal: run repeated evidence-backed optimization passes that improve speed, perceived performance, responsiveness, loading quality, visual stability, and overall product feel without weakening correctness.

Use this template as the control file for a long-horizon optimization pass. Keep the loop here, and load only the active checklist item file plus the minimum implementation context needed.

## Loop

1. Pick the next unchecked checklist item below and open its linked file.
2. Load only the relevant code, UI, benchmark, fixture, asset, or build context for that item.
3. Identify both technical performance issues and user-experience friction in that target area.
4. For each opportunity, record location, category, why it is real, expected user impact, fix strategy, verification method, and correctness or UX risk.
5. Reproduce, measure, or code-evidence the opportunity before changing behavior. Prefer measured, reproduced, or code-evidenced problems over speculative micro-optimizations.
6. Apply small, targeted improvements that preserve correctness, data consistency, design system rules, visual identity, validation, safety checks, and error handling.
7. Run correctness checks plus the most relevant performance, build, UI, smoke, benchmark, bundle, Lighthouse-like, before/after timing, screenshot, or visual verification.
8. If a check cannot be run, record why and use the closest available verification method.
9. Update docs, comments, performance notes, asset guidelines, architecture notes, or project knowledge only when behavior, setup, assumptions, data flow, or maintenance expectations changed.
10. Review `git status`; stage only files that belong to the completed optimization batch with targeted `git add` commands. Leave unrelated user changes untouched.
11. Record optimizations applied, UX/perceived-performance improvements, before/after evidence where available, correctness checks, performance or visual checks, docs/knowledge updates, staged files, and remaining risk.
12. Mark the checklist item `[x]` here when it is complete for this pass.
13. Continue until every item is checked.

After every item is `[x]`, start a fresh pass by resetting the checklist to unchecked if the goal is continuing. Repeat until a fresh pass finds no high-confidence product optimization opportunities.

Stop when remaining ideas are speculative, low-confidence, product decisions, user-input-dependent, or blocked by unavailable verification.

Prioritize user-visible desktop problems, frozen/unstable-feeling flows, organic data bottlenecks, chart flicker/layout shift/scroll jank/input lag, website and landing loading, browser/demo onboarding, large tables/logs/inventory/analysis, assets/bundle/cache, mobile usability, then developer feedback speed.

## Checklist

Open the linked file for the active checklist item. Paths are relative to the repository root so this template can be pasted elsewhere. **DO NOT** edit the files below. Edits are only allowed in this file.

- [ ] [Startup and first render](docs/goals/templates/product-optimizations/01-startup-first-render.md)
- [ ] [Route transitions](docs/goals/templates/product-optimizations/02-route-transitions.md)
- [ ] [Data query speed](docs/goals/templates/product-optimizations/03-data-query-speed.md)
- [ ] [Renders and rerenders](docs/goals/templates/product-optimizations/04-render-rerenders.md)
- [ ] [Chart stability](docs/goals/templates/product-optimizations/05-chart-stability.md)
- [ ] [Scroll and input lag](docs/goals/templates/product-optimizations/06-scroll-input-lag.md)
- [ ] [Loading, empty, and error states](docs/goals/templates/product-optimizations/07-loading-empty-error-states.md)
- [ ] [Assets, images, and bundle](docs/goals/templates/product-optimizations/08-assets-images-bundle.md)
- [ ] [Browser and demo onboarding](docs/goals/templates/product-optimizations/09-browser-demo-onboarding.md)
- [ ] [Mobile responsiveness](docs/goals/templates/product-optimizations/10-mobile-responsiveness.md)
- [ ] [Large tables, logs, and analysis views](docs/goals/templates/product-optimizations/11-large-tables-logs-analysis.md)
- [ ] [Import, export, and persistence flows](docs/goals/templates/product-optimizations/12-import-export-persistence.md)
- [ ] [Memory, listeners, timers, and subscriptions](docs/goals/templates/product-optimizations/13-memory-listeners-timers.md)
- [ ] [Developer feedback speed](docs/goals/templates/product-optimizations/14-developer-feedback-speed.md)
- [ ] [Website and landing page loading](docs/goals/templates/product-optimizations/15-website-landing-loading.md)

## Final Response

Report passes completed, optimizations applied, before/after evidence, correctness checks, performance or visual checks, docs updated, changed files, and remaining opportunities.
