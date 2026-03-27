// @vitest-environment node

import { join } from 'node:path';
import {
  resolveCoreLaunchCommand,
  resolveManagedCoreEnv,
} from './backend';

describe('desktop core host helpers', () => {
  it('only injects the local data path for the desktop core runtime', () => {
    const env = resolveManagedCoreEnv({
      dataFilePath: '/tmp/banji-store.json',
    });

    expect(env.BANJI_DESKTOP_DATA_PATH).toBe('/tmp/banji-store.json');
    expect(env.API_BIND_ADDR).toBeUndefined();
    expect(env.EDGE_CORS_ALLOWED_ORIGINS).toBeUndefined();
  });

  it('falls back to cargo when a packaged core binary is unavailable', () => {
    const command = resolveCoreLaunchCommand('/Users/svanny/banji', '/tmp/resources', true);

    expect(command.command).toBe('cargo');
    expect(command.args).toEqual([
      'run',
      '--manifest-path',
      join('/Users/svanny/banji', 'apps/desktop-core/Cargo.toml'),
    ]);
  });
});
