// @vitest-environment node

import { join } from 'node:path';
import {
  parseTrackedEnv,
  resolveApiLaunchCommand,
  resolveManagedApiEnv,
} from './backend';

describe('backend helpers', () => {
  it('drops placeholder values from the tracked env template', () => {
    const parsed = parseTrackedEnv(`
      AUTH_ENABLED=false
      DATABASE_RUNTIME_URL=__SET_IN_PLATFORM_SECRET__
      EDGE_CORS_ALLOWED_ORIGINS=http://localhost:3000
    `);

    expect(parsed).toEqual({
      AUTH_ENABLED: 'false',
      EDGE_CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    });
  });

  it('overrides the local desktop runtime contract for Electron', () => {
    const env = resolveManagedApiEnv(
      { AUTH_ENABLED: 'true', EDGE_CORS_ALLOWED_ORIGINS: 'https://example.com' },
      {
        port: 8787,
        dataFilePath: '/tmp/banji-store.json',
        rendererOrigin: 'http://localhost:5173',
      },
    );

    expect(env.AUTH_ENABLED).toBe('false');
    expect(env.API_BIND_ADDR).toBe('127.0.0.1:8787');
    expect(env.BANJI_DESKTOP_DATA_PATH).toBe('/tmp/banji-store.json');
    expect(env.EDGE_CORS_ALLOWED_ORIGINS).toContain('http://localhost:5173');
    expect(env.EDGE_CORS_ALLOWED_ORIGINS).toContain('null');
  });

  it('falls back to cargo when a packaged binary is unavailable', () => {
    const command = resolveApiLaunchCommand('/Users/svanny/banji', '/tmp/resources', true);

    expect(command.command).toBe('cargo');
    expect(command.args).toEqual([
      'run',
      '--manifest-path',
      join('/Users/svanny/banji', 'apps/api/Cargo.toml'),
    ]);
  });
});
