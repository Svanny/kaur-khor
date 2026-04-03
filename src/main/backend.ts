import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

interface CoreRequestEnvelope {
  id: number;
  command: string;
  payload?: unknown;
}

interface CoreResponseEnvelope {
  id: number;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (payload: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_CORE_TIMEOUT_MS = 15_000;

export interface ManagedCoreProcess {
  invoke: <T>(
    command: string,
    payload?: unknown,
    options?: { timeoutMs?: number },
  ) => Promise<T>;
  isStopped: () => boolean;
  stop: () => Promise<void>;
}

export interface StartManagedCoreOptions {
  projectRoot: string;
  userDataPath: string;
  resourcesPath?: string;
  isPackaged?: boolean;
}

function desktopTraceEnabled() {
  const raw = process.env.BANJI_DESKTOP_TRACE_IPC;
  if (!raw) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function summarizePayload(payload: unknown) {
  if (payload === undefined) {
    return 'undefined';
  }
  if (payload === null) {
    return 'null';
  }
  if (Array.isArray(payload)) {
    return `array(len=${payload.length})`;
  }
  if (typeof payload === 'object') {
    const keys = Object.keys(payload as Record<string, unknown>);
    return `object(keys=${keys.slice(0, 8).join(',')}${keys.length > 8 ? ',…' : ''})`;
  }
  return `${typeof payload}(${String(payload)})`;
}

function traceIpc(message: string) {
  if (!desktopTraceEnabled()) {
    return;
  }
  console.log(`[banji-desktop-ipc] ${message}`);
}

function resolveDesktopCoreBinaryName() {
  return process.platform === 'win32' ? 'banji-desktop-core.exe' : 'banji-desktop-core';
}

export function resolveManagedCoreEnv({
  dataFilePath,
}: {
  dataFilePath: string;
}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BANJI_DESKTOP_DATA_PATH: dataFilePath,
  };
}

export function resolveCoreLaunchCommand(
  projectRoot: string,
  resourcesPath?: string,
  isPackaged?: boolean,
): { command: string; args: string[] } {
  const explicitBinary = process.env.BANJI_DESKTOP_CORE_BINARY;
  if (explicitBinary) {
    return { command: explicitBinary, args: [] };
  }

  if (isPackaged && resourcesPath) {
    const packagedBinary = join(resourcesPath, 'bin', resolveDesktopCoreBinaryName());
    if (existsSync(packagedBinary)) {
      return { command: packagedBinary, args: [] };
    }
  }

  return {
    command: 'cargo',
    args: ['run', '--manifest-path', resolve(projectRoot, 'apps/desktop-core/Cargo.toml')],
  };
}

export async function startManagedCore(
  options: StartManagedCoreOptions,
): Promise<ManagedCoreProcess> {
  const env = resolveManagedCoreEnv({
    dataFilePath: join(options.userDataPath, 'desktop-sena-store.sqlite3'),
  });
  const { command, args } = resolveCoreLaunchCommand(
    options.projectRoot,
    options.resourcesPath,
    options.isPackaged,
  );

  const child = spawn(command, args, {
    cwd: options.projectRoot,
    env,
    stdio: 'pipe',
  });
  traceIpc(`spawn command=${command} args=${JSON.stringify(args)} dataPath=${env.BANJI_DESKTOP_DATA_PATH ?? 'unset'}`);
  const pending = new Map<number, PendingRequest>();
  const stderr: string[] = [];
  let nextId = 1;
  let stopped = false;

  const stdoutInterface = createInterface({ input: child.stdout });

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
  };

  stdoutInterface.on('line', (line) => {
    if (!line.trim()) {
      return;
    }

    let response: CoreResponseEnvelope;
    try {
      response = JSON.parse(line) as CoreResponseEnvelope;
    } catch {
      return;
    }

    const request = pending.get(response.id);
    if (!request) {
      return;
    }

    clearTimeout(request.timeout);
    pending.delete(response.id);
    traceIpc(
      `response id=${response.id} ok=${response.ok} pending=${pending.size} payload=${summarizePayload(response.payload)}`,
    );

    if (response.ok) {
      request.resolve(response.payload as unknown);
      return;
    }

    request.reject(new Error(response.error ?? 'desktop core command failed'));
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trimEnd();
    stderr.push(text);
    console.error(`[banji-desktop-core] ${text}`);
  });

  child.once('exit', (_code, signal) => {
    stopped = true;
    stdoutInterface.close();
    const details = stderr.join('\n').trim();
    rejectPending(
      new Error(
        details
          ? `desktop core exited unexpectedly: ${details}`
          : `desktop core exited unexpectedly${signal ? ` (${signal})` : ''}`,
      ),
    );
  });

  const invoke = async <T>(
    commandName: string,
    payload?: unknown,
    options?: { timeoutMs?: number },
  ): Promise<T> => {
    if (stopped || child.killed) {
      throw new Error('desktop core is not running');
    }

    const id = nextId++;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_CORE_TIMEOUT_MS;
    const envelope: CoreRequestEnvelope = {
      id,
      command: commandName,
      payload,
    };

    return new Promise<T>((resolvePromise, rejectPromise) => {
      const startedAt = Date.now();
      const timeout = setTimeout(() => {
        pending.delete(id);
        traceIpc(
          `timeout id=${id} command=${commandName} elapsedMs=${Date.now() - startedAt} pending=${pending.size}`,
        );
        rejectPromise(new Error(`desktop core timed out while handling ${commandName}`));
      }, timeoutMs);

      pending.set(id, {
        resolve: (payloadValue) => {
          traceIpc(
            `resolve id=${id} command=${commandName} elapsedMs=${Date.now() - startedAt} pending=${pending.size} payload=${summarizePayload(payloadValue)}`,
          );
          resolvePromise(payloadValue as T);
        },
        reject: (error) => {
          traceIpc(
            `reject id=${id} command=${commandName} elapsedMs=${Date.now() - startedAt} pending=${pending.size} error=${error.message}`,
          );
          rejectPromise(error);
        },
        timeout,
      });
      traceIpc(
        `invoke id=${id} command=${commandName} pending=${pending.size} payload=${summarizePayload(payload)}`,
      );

      child.stdin.write(`${JSON.stringify(envelope)}\n`, (error) => {
        if (!error) {
          return;
        }

        clearTimeout(timeout);
        pending.delete(id);
        traceIpc(
          `stdin-error id=${id} command=${commandName} elapsedMs=${Date.now() - startedAt} pending=${pending.size} error=${error.message}`,
        );
        rejectPromise(error);
      });
    });
  };

  try {
    await invoke('system.ping');
  } catch (error) {
    child.kill('SIGTERM');
    const details = stderr.join('\n').trim();
    throw new Error(
      details
        ? `failed to start desktop core: ${details}`
        : `failed to start desktop core: ${(error as Error).message}`,
    );
  }

  return {
    invoke,
    isStopped: () => stopped || child.killed,
    stop: async () => {
      if (stopped || child.killed) {
        return;
      }

      child.kill('SIGTERM');
      await new Promise<void>((resolvePromise) => {
        const timeout = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 3_000);

        child.once('exit', () => {
          clearTimeout(timeout);
          resolvePromise();
        });
      });
    },
  };
}
