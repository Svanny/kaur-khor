# GitHub Pages

The Pages workflow is `.github/workflows/pages.yml`.

## Build

The web build uses:

```bash
pnpm run pages:build
```

The build output is `out/web`. `pages:build` copies `out/web/index.html` to `out/web/404.html` so direct visits to `/kaur-khor/demo` and `/kaur-khor/app` can fall back to the React router.

## Deployment

The workflow runs on pushes to `main` and manual `workflow_dispatch`. It installs dependencies with the frozen lockfile, runs `pnpm test`, builds the web app, configures Pages with workflow-based deployment enabled, uploads the Pages artifact, and deploys it to the `github-pages` environment.

GitHub Pages availability depends on the repository plan and settings. When GitHub rejects Pages configuration, the workflow keeps the test and web-build gates green and skips the artifact upload/deploy steps until Pages is available for the repository.

## Route contract

The Vite base path is `/kaur-khor/`, matching the repository Pages path. Do not change the base path unless the Pages repository or custom domain changes.
