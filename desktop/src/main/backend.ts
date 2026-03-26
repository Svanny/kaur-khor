import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';

export interface ManagedApiProcess {
  apiBaseUrl: string;
  child: ChildProcessWithoutNullStreams;
  port: number;
}

export interface StartManagedApiOptions {
  projectRoot: string;
  userDataPath: string;
  rendererOrigin?: string;
  preferredPort?: number;
  resourcesPath?: string;
  isPackaged?: boolean;
}

const TRACKED_SECRET_PLACEHOLDER = '__SET_IN_PLATFORM_SECRET__';

export function parseTrackedEnv(raw: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || !value || value === TRACKED_SECRET_PLACEHOLDER) {
      continue;
    }
    values[key] = value;
  }

  return values;
}

export function resolveManagedApiEnv(
  trackedTemplate: Record<string, string>,
  {
    port,
    dataFilePath,
    rendererOrigin,
  }: {
    port: number;
    dataFilePath: string;
    rendererOrigin?: string;
  },
): NodeJS.ProcessEnv {
  const corsOrigins = new Set(['null']);
  if (rendererOrigin) {
    corsOrigins.add(rendererOrigin);
  }
  corsOrigins.add('http://localhost:5173');
  corsOrigins.add('http://127.0.0.1:5173');

  return {
    ...process.env,
    ...trackedTemplate,
    APP_ROLE: 'api',
    BANJI_ENV: 'dev',
    AUTH_ENABLED: 'false',
    EDGE_ENFORCEMENT_ENABLED: 'false',
    API_BIND_ADDR: `127.0.0.1:${port}`,
    BANJI_DESKTOP_DATA_PATH: dataFilePath,
    EDGE_CORS_ALLOWED_ORIGINS: Array.from(corsOrigins).join(','),
    OTEL_ENABLED: 'false',
  };
}

export async function findAvailablePort(startingPort = 8787): Promise<number> {
  let candidate = startingPort;
  while (candidate < startingPort + 50) {
    // eslint-disable-next-line no-await-in-loop
    const available = await checkPort(candidate);
    if (available) {
      return candidate;
    }
    candidate += 1;
  }
  throw new Error('unable to find an available local Banji API port');
}

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.once('listening', () => {
      server.close(() => resolvePromise(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function waitForHealth(apiBaseUrl: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore until deadline.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Banji API did not become healthy within ${timeoutMs}ms`);
}

export function resolveApiLaunchCommand(
  projectRoot: string,
  resourcesPath?: string,
  isPackaged?: boolean,
): { command: string; args: string[] } {
  const explicitBinary = process.env.BANJI_API_BINARY;
  if (explicitBinary) {
    return { command: explicitBinary, args: [] };
  }

  if (isPackaged && resourcesPath) {
    const packagedBinary = join(resourcesPath, 'bin', 'banji-api');
    if (existsSync(packagedBinary)) {
      return { command: packagedBinary, args: [] };
    }
  }

  return {
    command: 'cargo',
    args: ['run', '--manifest-path', resolve(projectRoot, 'apps/api/Cargo.toml')],
  };
}

export async function startManagedApi(
  options: StartManagedApiOptions,
): Promise<ManagedApiProcess> {
  const port = await findAvailablePort(options.preferredPort);
  const apiBaseUrl = `http://127.0.0.1:${port}`;
  const trackedTemplate = parseTrackedEnv(
    readFileSync(resolve(options.projectRoot, 'config/env/dev.env'), 'utf8'),
  );
  const env = resolveManagedApiEnv(trackedTemplate, {
    port,
    dataFilePath: join(options.userDataPath, 'desktop-inventory-store.json'),
    rendererOrigin: options.rendererOrigin,
  });
  const { command, args } = resolveApiLaunchCommand(
    options.projectRoot,
    options.resourcesPath,
    options.isPackaged,
  );

  const child = spawn(command, args, {
    cwd: options.projectRoot,
    env,
    stdio: 'pipe',
  });

  const stderr: string[] = [];
  child.stderr.on('data', (chunk) => {
    stderr.push(chunk.toString());
  });

  child.stdout.on('data', (chunk) => {
    console.log(`[banji-api] ${chunk.toString().trimEnd()}`);
  });
  child.stderr.on('data', (chunk) => {
    console.error(`[banji-api] ${chunk.toString().trimEnd()}`);
  });

  try {
    await waitForHealth(apiBaseUrl);
  } catch (error) {
    child.kill('SIGTERM');
    const details = stderr.join('').trim();
    throw new Error(
      details
        ? `failed to start Banji API: ${details}`
        : `failed to start Banji API: ${(error as Error).message}`,
    );
  }

  return {
    apiBaseUrl,
    child,
    port,
  };
}

export async function stopManagedApi(processRef: ManagedApiProcess | null): Promise<void> {
  if (!processRef || processRef.child.killed) {
    return;
  }

  processRef.child.kill('SIGTERM');
  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (!processRef.child.killed) {
        processRef.child.kill('SIGKILL');
      }
    }, 3_000);

    processRef.child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}
