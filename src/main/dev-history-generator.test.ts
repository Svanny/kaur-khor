// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_WORKSPACE_HISTORY_SIZES,
  buildGenerateDevHistoryArgs,
  shouldPrepareGeneratedWorkspace,
} from './dev-history-generator';

describe('dev history generator helpers', () => {
  it('builds the power-user startup fixture command against the shared generator', () => {
    expect(buildGenerateDevHistoryArgs({
      repoRoot: '/tmp/kaur-khor',
      dataDirectory: '/tmp/kaur-khor/.kaur-khor-dev-data',
      size: 'power-user',
    })).toEqual([
      './scripts/generate_dev_history.py',
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
      hasGeneratedHistoryMarker: true,
      hasWorkspaceStore: true,
    })).toBe(false);
    expect(shouldPrepareGeneratedWorkspace({
      hasGeneratedHistoryMarker: true,
      hasWorkspaceStore: false,
    })).toBe(true);
    expect(shouldPrepareGeneratedWorkspace({
      hasGeneratedHistoryMarker: false,
      hasWorkspaceStore: false,
    })).toBe(true);
  });

  it('documents which fixture sizes use the compact startup-only read model', () => {
    expect(BENCHMARK_WORKSPACE_HISTORY_SIZES['power-user']?.startupOnlyReadModel).toBe(true);
    expect(BENCHMARK_WORKSPACE_HISTORY_SIZES.medium?.startupOnlyReadModel).toBe(false);
  });
});
