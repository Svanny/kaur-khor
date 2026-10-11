// @vitest-environment node
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('electron-builder'));
const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const { load } = appBuilderRequire('js-yaml');
const workflow = load(readFileSync(resolve('.github/workflows/release.yml'), 'utf8'));

function enabled(condition, eventName, refType, platform = '') {
  if (!condition) return true;
  const expression = condition
    .replace(/github\.event_name/g, JSON.stringify(eventName))
    .replace(/github\.ref_type/g, JSON.stringify(refType))
    .replace(/matrix\.platform/g, JSON.stringify(platform));
  // Only the workflow's simple event/platform comparisons are supported here.
  if (!/^[\s\w'"=!&|.()-]+$/.test(expression) || /\b(?:github|matrix)\./.test(expression)) {
    throw new Error(`Unsupported workflow condition: ${condition}`);
  }
  return Function(`"use strict"; return (${expression});`)();
}

function containsSecret(value) {
  return (JSON.stringify(value) ?? '').includes('secrets.');
}

describe('maintenance workflow security boundaries', () => {
  test('all CI jobs select the repository pin through the patched setup bootstrap', () => {
    const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    expect(manifest.packageManager).toBe('pnpm@10.34.5');
    for (const path of ['release.yml', 'pages.yml', 'ui-matrix.yml']) {
      const config = load(readFileSync(resolve('.github/workflows', path), 'utf8'));
      for (const job of Object.values(config.jobs)) {
        const setup = job.steps.filter((step) => step.uses?.startsWith('pnpm/action-setup@'));
        for (const step of setup) {
          expect(step.uses).toBe('pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86');
          expect(step.with.version).toBe(manifest.packageManager.slice('pnpm@'.length));
        }
      }
    }
  });

  test('the complete UI matrix runs on PRs/main with read-only access and no secrets', () => {
    const ui = load(readFileSync(resolve('.github/workflows/ui-matrix.yml'), 'utf8'));
    expect(ui.on.pull_request.branches).toContain('main');
    expect(ui.on.push.branches).toContain('main');
    expect(ui.permissions).toEqual({ contents: 'read' });
    expect(containsSecret(ui)).toBe(false);
    const job = ui.jobs['ui-matrix'];
    expect(job.steps.some((step) => step.run === 'pnpm ui:matrix')).toBe(true);
    expect(job.steps.find((step) => step.name === 'Checkout').with['persist-credentials']).toBe(false);
  });

  test.each(['mac', 'win', 'linux'])('pull request packaging on %s is read-only and receives no signing secrets', (platform) => {
    expect(workflow.on.pull_request.branches).toContain('main');
    for (const job of Object.values(workflow.jobs)) {
      if (!enabled(job.if, 'pull_request', 'branch', platform)) continue;
      expect((job.permissions ?? workflow.permissions).contents).toBe('read');
      expect(containsSecret(job.env)).toBe(false);
      for (const step of job.steps.filter((step) => enabled(step.if, 'pull_request', 'branch', platform))) {
        expect(containsSecret(step), step.name).toBe(false);
      }
    }
    const packaging = workflow.jobs.build.steps.filter((step) => step.name.startsWith('Package') && enabled(step.if, 'pull_request', 'branch', platform));
    expect(packaging).toHaveLength(1);
    if (platform !== 'linux') expect(packaging[0].env.ALLOW_UNSIGNED_PACKAGING).toBe('1');
  });

  test.each(['mac', 'win'])('tag packaging on %s preserves the existing signing environment', (platform) => {
    const packaging = workflow.jobs.build.steps.filter((step) => step.name.startsWith('Package') && enabled(step.if, 'push', 'tag', platform));
    expect(packaging).toHaveLength(1);
    expect(containsSecret(packaging[0].env)).toBe(true);
  });

  test('only tag publication can write contents or publish release artifacts', () => {
    const release = workflow.jobs.release;
    expect(release.permissions.contents).toBe('write');
    expect(enabled(release.if, 'pull_request', 'branch')).toBe(false);
    expect(enabled(release.if, 'push', 'branch')).toBe(false);
    expect(enabled(release.if, 'push', 'tag')).toBe(true);
    expect(release.needs).toEqual(expect.arrayContaining(['security-gate', 'build']));
    for (const step of workflow.jobs.build.steps.filter((step) => /(?:Collect packaged|Upload release)/.test(step.name))) {
      expect(enabled(step.if, 'pull_request', 'branch')).toBe(false);
      expect(enabled(step.if, 'push', 'branch')).toBe(false);
      expect(enabled(step.if, 'push', 'tag')).toBe(true);
    }
  });
});

test('the installed Electron Builder proxy graph forwards HTTP/TLS and honors bypass/environment conventions', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['tools/security/check-electron-proxy.cjs'], { timeout: 30_000 });
  expect(stdout.match(/proxy routing and both NO_PROXY calls verified/g)).toHaveLength(3);
}, 35_000);
