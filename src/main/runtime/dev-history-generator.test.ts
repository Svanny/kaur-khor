// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BENCHMARK_WORKSPACE_HISTORY_SIZES,
  buildGenerateDevHistoryArgs,
  detectDevWorkspaceSeedState,
  markDevWorkspaceBlank,
  shouldPrepareGeneratedWorkspace,
  shouldSeedGeneratedDevWorkspace,
} from './dev-history-generator';

describe('dev history generator helpers', () => {
  it('builds the power-user startup fixture command against the shared generator', () => {
    expect(buildGenerateDevHistoryArgs({
      repoRoot: '/tmp/kaur-khor',
      dataDirectory: '/tmp/kaur-khor/.kaur-khor-dev-data',
      size: 'power-user',
    })).toEqual([
      './tools/scripts/generate_dev_history.py',
      '--repo-root',
      '/tmp/kaur-khor',
      '--sena-db',
      '/tmp/kaur-khor/.kaur-khor-dev-data/desktop-sena-store.sqlite3',
      '--seed-marker',
      '/tmp/kaur-khor/.kaur-khor-dev-data/desktop-sena-dev-history.json',
      '--years',
      '10',
      '--interval-days',
      '1',
      '--startup-only-read-model',
    ]);
  });

  it('does not regenerate an existing generated-history workspace on dev boot', () => {
    expect(shouldPrepareGeneratedWorkspace({
      hasBlankWorkspaceMarker: false,
      hasGeneratedHistoryMarker: true,
      hasWorkspaceStore: true,
    })).toBe(false);
    expect(shouldPrepareGeneratedWorkspace({
      hasBlankWorkspaceMarker: false,
      hasGeneratedHistoryMarker: true,
      hasWorkspaceStore: false,
    })).toBe(true);
    expect(shouldPrepareGeneratedWorkspace({
      hasBlankWorkspaceMarker: false,
      hasGeneratedHistoryMarker: false,
      hasWorkspaceStore: false,
    })).toBe(true);
    expect(shouldPrepareGeneratedWorkspace({
      hasBlankWorkspaceMarker: true,
      hasGeneratedHistoryMarker: false,
      hasWorkspaceStore: false,
    })).toBe(false);
    expect(shouldPrepareGeneratedWorkspace({
      hasBlankWorkspaceMarker: true,
      hasGeneratedHistoryMarker: false,
      hasWorkspaceStore: false,
    }, { allowBlankWorkspaceSeed: true })).toBe(true);
  });

  it('requires an explicit environment flag before dev startup may seed generated data', () => {
    expect(shouldSeedGeneratedDevWorkspace({})).toBe(false);
    expect(shouldSeedGeneratedDevWorkspace({ KAUR_KHOR_DEV_SEED: '0' })).toBe(false);
    expect(shouldSeedGeneratedDevWorkspace({ KAUR_KHOR_DEV_SEED: 'true' })).toBe(false);
    expect(shouldSeedGeneratedDevWorkspace({ KAUR_KHOR_DEV_SEED: '1' })).toBe(true);
  });

  it('marks explicitly cleared dev workspaces so startup keeps them blank', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'kaur-khor-dev-blank-'));

    await markDevWorkspaceBlank(dataDirectory);

    expect(await detectDevWorkspaceSeedState(dataDirectory)).toEqual({
      hasBlankWorkspaceMarker: true,
      hasGeneratedHistoryMarker: false,
      hasWorkspaceStore: false,
      mode: 'generated-history',
    });
  });

  it('still detects generated history workspaces when the store exists', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'kaur-khor-dev-generated-'));
    await writeFile(join(dataDirectory, 'desktop-sena-dev-history.json'), '{}\n', 'utf8');
    await writeFile(join(dataDirectory, 'desktop-sena-store.sqlite3'), 'sqlite', 'utf8');

    expect(await detectDevWorkspaceSeedState(dataDirectory)).toEqual({
      hasBlankWorkspaceMarker: false,
      hasGeneratedHistoryMarker: true,
      hasWorkspaceStore: true,
      mode: 'generated-history',
    });
  });

  it('documents which fixture sizes use the compact startup-only read model', () => {
    expect(BENCHMARK_WORKSPACE_HISTORY_SIZES['power-user']?.startupOnlyReadModel).toBe(true);
    expect(BENCHMARK_WORKSPACE_HISTORY_SIZES.medium?.startupOnlyReadModel).toBe(false);
  });
});
