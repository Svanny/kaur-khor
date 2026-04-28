# AGENTS.md - Project Learnings

## 11. Project Learnings

**Accumulated corrections. This section is for the agent to maintain, not just the human.**

When the user corrects your approach, append a one-line rule here before ending the session. Write it concretely ("Always use X for Y"), never abstractly ("be careful with Y"). If an existing line already covers the correction, tighten it instead of adding a new one. Remove lines when the underlying issue goes away (model upgrades, refactors, process changes).

- Always use `pnpm build` for build verification; do not pass `--silent` through to `electron-vite`.
- When changing labels for chart indicators or other computed business values, inspect and update the underlying calculation path plus focused tests.
- Buttons that open popups, drawers, modals, or sheets must not navigate before the user submits the popup action; keep popup state local or route-neutral until submit.
- Sheets and dialogs containing helper tooltip triggers must control initial focus so opening the surface never auto-focuses a tooltip trigger.
- Interface view preset cards must keep fixed square card tracks with even outer gutters, and their wireframes must fill the preview/title space with proportional internal density rather than leaving blank frame area.
