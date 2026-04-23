// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  isReadOnlyCoreCommand,
  resolveCoreLaunchCommand,
  resolveCoreLaunchCommands,
  resolveCoreWorkingDirectory,
  resolveManagedCoreEnv,
  shouldWaitForReadWorker,
  terminateManagedChildProcess,
} from './backend';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('desktop core host helpers', () => {
  it('only injects the local data path for the desktop core runtime', () => {
    const env = resolveManagedCoreEnv({
      dataFilePath: '/tmp/desktop-sena-store.sqlite3',
    });

    expect(env.BANJI_DESKTOP_DATA_PATH).toBe('/tmp/desktop-sena-store.sqlite3');
    expect(env.API_BIND_ADDR).toBeUndefined();
    expect(env.EDGE_CORS_ALLOWED_ORIGINS).toBeUndefined();
  });

  it('falls back to cargo when a packaged core binary is unavailable', () => {
    const command = resolveCoreLaunchCommand(projectRoot, join(tmpdir(), 'resources'), true);

    expect(command.command).toBe('cargo');
    expect(command.args).toEqual([
      'run',
      '--manifest-path',
      join(projectRoot, 'apps', 'desktop-core', 'Cargo.toml'),
    ]);
  });

  it('prefers a bundled packaged core binary when present', () => {
    const resourcesPath = mkdtempSync(join(tmpdir(), 'banji-packaged-core-'));
    const binaryName = process.platform === 'win32' ? 'banji-desktop-core.exe' : 'banji-desktop-core';
    const packagedBinary = join(resourcesPath, 'bin', binaryName);

    mkdirSync(join(resourcesPath, 'bin'), { recursive: true });
    writeFileSync(packagedBinary, 'stub');

    try {
      const command = resolveCoreLaunchCommand(projectRoot, resourcesPath, true);

      expect(command.command).toBe(packagedBinary);
      expect(command.args).toEqual([]);
    } finally {
      rmSync(resourcesPath, { recursive: true, force: true });
    }
  });

  it('ignores an invalid explicit core binary path and falls back to cargo', () => {
    vi.stubEnv('BANJI_DESKTOP_CORE_BINARY', join(projectRoot, 'apps', 'desktop-core', 'Cargo.toml', 'missing'));

    try {
      const commands = resolveCoreLaunchCommands(projectRoot);

      expect(commands[0]).toEqual({
        command: 'cargo',
        args: ['run', '--manifest-path', join(projectRoot, 'apps', 'desktop-core', 'Cargo.toml')],
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('prefers a valid explicit core binary path', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'banji-explicit-core-'));
    const explicitBinary = join(tmpDir, 'banji-desktop-core');
    writeFileSync(explicitBinary, 'stub');
    vi.stubEnv('BANJI_DESKTOP_CORE_BINARY', explicitBinary);

    try {
      const command = resolveCoreLaunchCommand(projectRoot);

      expect(command).toEqual({
        command: explicitBinary,
        args: [],
      });
    } finally {
      vi.unstubAllEnvs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses the resources directory as the working directory in packaged builds', () => {
    const resourcesPath = mkdtempSync(join(tmpdir(), 'banji-packaged-resources-'));

    try {
      expect(
        resolveCoreWorkingDirectory({
          projectRoot: join(resourcesPath, 'app.asar'),
          resourcesPath,
          userDataPath: '/tmp/user-data',
          isPackaged: true,
        }),
      ).toBe(resourcesPath);
    } finally {
      rmSync(resourcesPath, { recursive: true, force: true });
    }
  });

  it('falls back to the parent directory when projectRoot points to a file', () => {
    const root = mkdtempSync(join(tmpdir(), 'banji-project-root-'));
    const projectRootFile = join(root, 'app.asar');
    writeFileSync(projectRootFile, 'stub');

    try {
      expect(
        resolveCoreWorkingDirectory({
          projectRoot: projectRootFile,
          userDataPath: '/tmp/user-data',
        }),
      ).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('kills the whole process group on posix so spawned grandchildren do not linger', () => {
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const child = {
      kill: vi.fn(() => true),
      pid: 43210,
    };

    try {
      terminateManagedChildProcess(child as never, 'SIGTERM');

      if (process.platform === 'win32') {
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        expect(processKill).not.toHaveBeenCalled();
      } else {
        expect(processKill).toHaveBeenCalledWith(-43210, 'SIGTERM');
        expect(child.kill).not.toHaveBeenCalled();
      }
    } finally {
      processKill.mockRestore();
    }
  });

  it('falls back to child.kill when signaling the posix process group is not permitted', () => {
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('operation not permitted') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      throw error;
    });
    const child = {
      kill: vi.fn(() => true),
      pid: 43210,
    };

    try {
      terminateManagedChildProcess(child as never, 'SIGTERM');

      expect(processKill).toHaveBeenCalledWith(-43210, 'SIGTERM');
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      processKill.mockRestore();
    }
  });

  it('swallows missing child errors during direct child.kill fallback', () => {
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('missing') as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    });
    const child = {
      kill: vi.fn(() => {
        const error = new Error('missing child') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }),
      pid: 43210,
    };

    try {
      expect(() => terminateManagedChildProcess(child as never, 'SIGTERM')).not.toThrow();
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      processKill.mockRestore();
    }
  });

  it('classifies read-only commands for read-pool dispatch', () => {
    expect(isReadOnlyCoreCommand('sena.getRecordUpdateContext')).toBe(true);
    expect(isReadOnlyCoreCommand('sena.listOrderBatches')).toBe(true);
    expect(isReadOnlyCoreCommand('sena.ingestObservation')).toBe(false);
    expect(isReadOnlyCoreCommand('sena.updateOrderBatch')).toBe(false);
  });

  it('waits for read workers only for deferred read-only commands', () => {
    expect(shouldWaitForReadWorker({
      commandName: 'sena.getRecordUpdateContext',
      hasReadyReadWorker: false,
      readPriority: 'deferred',
    })).toBe(true);
    expect(shouldWaitForReadWorker({
      commandName: 'sena.getStartupWorkspace',
      hasReadyReadWorker: false,
      readPriority: 'critical',
    })).toBe(false);
    expect(shouldWaitForReadWorker({
      commandName: 'sena.getRecordUpdateContext',
      hasReadyReadWorker: true,
      readPriority: 'deferred',
    })).toBe(false);
    expect(shouldWaitForReadWorker({
      commandName: 'sena.ingestObservation',
      hasReadyReadWorker: false,
      readPriority: 'deferred',
    })).toBe(false);
  });
});
