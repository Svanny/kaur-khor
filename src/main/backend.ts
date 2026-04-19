import { existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  recordBenchmarkEvent,
  snapshotProcessMemory,
  startBenchmarkSpan,
} from './benchmark';

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
  startedAt: number;
  reject: (error: Error) => void;
  resolve: (payload: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface QueuedRequest<T> {
  commandName: string;
  enqueuedAt: number;
  envelope: CoreRequestEnvelope;
  payloadSummary: string;
  resolvePromise: (value: T | PromiseLike<T>) => void;
  rejectPromise: (reason?: unknown) => void;
  timeoutMs: number;
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

interface CoreLaunchCommand {
  command: string;
  args: string[];
}

type CoreWorkerRole = 'writer' | 'read';

interface CorePoolWorker {
  activeCount: number;
  index: number;
  process: ManagedCoreProcess;
  role: CoreWorkerRole;
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals) {
  process.kill(-pid, signal);
}

function isIgnorableProcessSignalError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && ['ESRCH', 'EPERM'].includes(String((error as NodeJS.ErrnoException).code));
}

export function terminateManagedChildProcess(
  child: Pick<ChildProcessWithoutNullStreams, 'kill' | 'pid'>,
  signal: NodeJS.Signals,
) {
  if (process.platform !== 'win32' && typeof child.pid === 'number') {
    try {
      signalProcessGroup(child.pid, signal);
      return;
    } catch (error) {
      if (!isIgnorableProcessSignalError(error)) {
        throw error;
      }
    }
  }

  try {
    child.kill(signal);
  } catch (error) {
    if (!isIgnorableProcessSignalError(error)) {
      throw error;
    }
  }
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

function isReadOnlyCoreCommand(commandName: string) {
  return commandName === 'system.ping'
    || commandName.startsWith('sena.get')
    || commandName.startsWith('sena.list')
    || commandName.startsWith('inventory.load')
    || commandName.startsWith('inventory.list');
}

function coreReadCoalesceKey(commandName: string, payload: unknown, timeoutMs: number) {
  try {
    return `${commandName}:${timeoutMs}:${JSON.stringify(payload ?? null)}`;
  } catch {
    return null;
  }
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

function isPathLikeCommand(command: string) {
  return command.includes('/') || command.includes('\\');
}

function isValidExecutablePath(command: string) {
  if (!isPathLikeCommand(command)) {
    return true;
  }

  try {
    return statSync(command).isFile();
  } catch {
    return false;
  }
}

function isDirectoryPath(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function resolveManagedCoreEnv({
  dataFilePath,
  role,
}: {
  dataFilePath: string;
  role?: CoreWorkerRole;
}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BANJI_DESKTOP_DATA_PATH: dataFilePath,
    ...(role ? { BANJI_CORE_WORKER_ROLE: role } : {}),
  };
}

export function resolveCoreLaunchCommand(
  projectRoot: string,
  resourcesPath?: string,
  isPackaged?: boolean,
): CoreLaunchCommand {
  return resolveCoreLaunchCommands(projectRoot, resourcesPath, isPackaged)[0];
}

export function resolveCoreWorkingDirectory({
  projectRoot,
  resourcesPath,
  isPackaged,
}: StartManagedCoreOptions) {
  if (isPackaged && resourcesPath && isDirectoryPath(resourcesPath)) {
    return resourcesPath;
  }

  if (isDirectoryPath(projectRoot)) {
    return projectRoot;
  }

  const parentDirectory = resolve(projectRoot, '..');
  if (isDirectoryPath(parentDirectory)) {
    return parentDirectory;
  }

  return undefined;
}

export function resolveCoreLaunchCommands(
  projectRoot: string,
  resourcesPath?: string,
  isPackaged?: boolean,
): CoreLaunchCommand[] {
  const commands: CoreLaunchCommand[] = [];
  const explicitBinary = process.env.BANJI_DESKTOP_CORE_BINARY;
  if (explicitBinary && isValidExecutablePath(explicitBinary)) {
    commands.push({ command: explicitBinary, args: [] });
  }

  if (isPackaged && resourcesPath) {
    const packagedBinary = join(resourcesPath, 'bin', resolveDesktopCoreBinaryName());
    if (existsSync(packagedBinary) && isValidExecutablePath(packagedBinary)) {
      commands.push({ command: packagedBinary, args: [] });
    }
  }

  commands.push({
    command: 'cargo',
    args: ['run', '--manifest-path', resolve(projectRoot, 'apps/desktop-core/Cargo.toml')],
  });

  return commands;
}

function isRecoverableSpawnError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && ['EACCES', 'ENOENT', 'ENOTDIR'].includes(String((error as NodeJS.ErrnoException).code));
}

export async function startManagedCore(
  options: StartManagedCoreOptions,
): Promise<ManagedCoreProcess> {
  const env = resolveManagedCoreEnv({
    dataFilePath: join(options.userDataPath, 'desktop-sena-store.sqlite3'),
  });
  const launchCommands = resolveCoreLaunchCommands(
    options.projectRoot,
    options.resourcesPath,
    options.isPackaged,
  );
  const writer = await startManagedCoreWithFallback(options, env, launchCommands, 'writer', 0);
  const readWorkers: CorePoolWorker[] = [];
  const coalescedReadRequests = new Map<string, Promise<unknown>>();
  const readPoolSize = resolveReadPoolSize();
  let stopped = false;
  let readGeneration = 0;

  for (let index = 0; index < readPoolSize; index += 1) {
    void startManagedCoreWithFallback(options, env, launchCommands, 'read', index + 1)
      .then((process) => {
        const worker: CorePoolWorker = {
          activeCount: 0,
          index: index + 1,
          process,
          role: 'read',
        };
        if (stopped) {
          void process.stop();
          return;
        }
        readWorkers.push(worker);
        recordBenchmarkEvent({
          layer: 'main',
          category: 'startup',
          name: 'backend.core.read-worker.ready',
          phase: 'instant',
          detail: {
            workerIndex: worker.index,
            poolSize: readPoolSize,
          },
        });
      })
      .catch((error) => {
        console.warn(`[banji-desktop-core] read worker ${index + 1} failed to start: ${(error as Error).message}`);
        recordBenchmarkEvent({
          layer: 'main',
          category: 'startup',
          name: 'backend.core.read-worker.error',
          phase: 'instant',
          detail: {
            workerIndex: index + 1,
            error: (error as Error).message,
          },
        });
      });
  }

  const writerWorker: CorePoolWorker = {
    activeCount: 0,
    index: 0,
    process: writer,
    role: 'writer',
  };

  const selectReadWorker = () => {
    const available = readWorkers.filter((worker) => !worker.process.isStopped());
    if (available.length === 0) {
      return writerWorker;
    }
    return available.sort((left, right) => left.activeCount - right.activeCount || left.index - right.index)[0] ?? writerWorker;
  };

  const invokeOnWorker = async <T>(
    worker: CorePoolWorker,
    commandName: string,
    payload?: unknown,
    invokeOptions?: { timeoutMs?: number },
  ) => {
    worker.activeCount += 1;
    recordBenchmarkEvent({
      layer: 'main',
      category: 'core-command',
      name: 'backend.core.pool.route',
      phase: 'instant',
      command: commandName,
      detail: {
        role: worker.role,
        workerIndex: worker.index,
        activeCount: worker.activeCount,
      },
    });
    try {
      return await worker.process.invoke<T>(commandName, payload, invokeOptions);
    } finally {
      worker.activeCount = Math.max(0, worker.activeCount - 1);
    }
  };

  const invoke = async <T>(
    commandName: string,
    payload?: unknown,
    invokeOptions?: { timeoutMs?: number },
  ): Promise<T> => {
    if (stopped || writer.isStopped()) {
      throw new Error('desktop core is not running');
    }

    const timeoutMs = invokeOptions?.timeoutMs ?? DEFAULT_CORE_TIMEOUT_MS;
    const readOnly = isReadOnlyCoreCommand(commandName);
    const coalesceKey = readOnly ? coreReadCoalesceKey(commandName, payload, timeoutMs) : null;
    const coalesced = coalesceKey ? coalescedReadRequests.get(coalesceKey) : null;
    if (coalesced) {
      recordBenchmarkEvent({
        layer: 'main',
        category: 'core-command',
        name: 'backend.core.request.coalesced',
        phase: 'instant',
        command: commandName,
        detail: {
          timeoutMs,
          payload: summarizePayload(payload),
        },
      });
      return (await coalesced) as T;
    }

    const request = (async () => {
      if (readOnly) {
        const generationAtDispatch = readGeneration;
        const worker = selectReadWorker();
        const result = await invokeOnWorker<T>(worker, commandName, payload, invokeOptions);
        if (generationAtDispatch !== readGeneration) {
          recordBenchmarkEvent({
            layer: 'main',
            category: 'core-command',
            name: 'backend.core.read-result.stale',
            phase: 'instant',
            command: commandName,
            detail: {
              dispatchedGeneration: generationAtDispatch,
              currentGeneration: readGeneration,
            },
          });
          return await invokeOnWorker<T>(writerWorker, commandName, payload, invokeOptions);
        }
        return result;
      }

      const result = await invokeOnWorker<T>(writerWorker, commandName, payload, invokeOptions);
      readGeneration += 1;
      recordBenchmarkEvent({
        layer: 'main',
        category: 'core-command',
        name: 'backend.core.read-generation.bump',
        phase: 'instant',
        command: commandName,
        detail: {
          generation: readGeneration,
        },
      });
      return result;
    })();

    if (coalesceKey) {
      coalescedReadRequests.set(coalesceKey, request);
      const clearCoalescedRequest = () => {
        if (coalescedReadRequests.get(coalesceKey) === request) {
          coalescedReadRequests.delete(coalesceKey);
        }
      };
      request.then(clearCoalescedRequest, clearCoalescedRequest);
    }
    return request;
  };

  return {
    invoke,
    isStopped: () => stopped || writer.isStopped(),
    stop: async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      await Promise.allSettled([
        writer.stop(),
        ...readWorkers.map((worker) => worker.process.stop()),
      ]);
    },
  };
}

function resolveReadPoolSize() {
  const raw = Number.parseInt(process.env.BANJI_READ_CORE_POOL_SIZE ?? '3', 10);
  if (!Number.isFinite(raw)) {
    return 3;
  }
  return Math.min(8, Math.max(1, raw));
}

async function startManagedCoreWithFallback(
  options: StartManagedCoreOptions,
  env: NodeJS.ProcessEnv,
  launchCommands: CoreLaunchCommand[],
  role: CoreWorkerRole,
  workerIndex: number,
) {
  const workerEnv = {
    ...env,
    BANJI_CORE_WORKER_ROLE: role,
    BANJI_CORE_WORKER_INDEX: String(workerIndex),
  };
  let lastRecoverableError: Error | null = null;

  for (const { command, args } of launchCommands) {
    try {
      return await startManagedCoreAttempt(options, workerEnv, { command, args }, role, workerIndex);
    } catch (error) {
      if (!isRecoverableSpawnError(error)) {
        throw error;
      }
      lastRecoverableError = error as Error;
    }
  }

  throw lastRecoverableError ?? new Error('failed to start desktop core');
}

async function startManagedCoreAttempt(
  options: StartManagedCoreOptions,
  env: NodeJS.ProcessEnv,
  launchCommand: CoreLaunchCommand,
  role: CoreWorkerRole = 'writer',
  workerIndex = 0,
): Promise<ManagedCoreProcess> {
  const { command, args } = launchCommand;
  const cwd = resolveCoreWorkingDirectory(options);
  const endSpawn = startBenchmarkSpan({
    category: 'startup',
    name: 'backend.core.spawn',
    detail: {
      command,
      args,
      cwd,
      role,
      workerIndex,
    },
  });
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== 'win32',
    env,
    stdio: 'pipe',
  });
  endSpawn({
    ok: true,
    pid: child.pid ?? null,
  });
  traceIpc(`spawn command=${command} args=${JSON.stringify(args)} dataPath=${env.BANJI_DESKTOP_DATA_PATH ?? 'unset'}`);
  recordBenchmarkEvent({
    layer: 'main',
    category: 'startup',
    name: 'backend.core.spawn.end',
    phase: 'instant',
    detail: {
      command,
      pid: child.pid ?? null,
      role,
      workerIndex,
    },
  });
  const pending = new Map<number, PendingRequest>();
  const queuedRequests: QueuedRequest<unknown>[] = [];
  const coalescedReadRequests = new Map<string, Promise<unknown>>();
  const stderr: string[] = [];
  let nextId = 1;
  let stopped = false;
  let activeRequestId: number | null = null;
  let launchError: Error | null = null;

  const stdoutInterface = createInterface({ input: child.stdout });

  const rejectQueued = (error: Error) => {
    while (queuedRequests.length > 0) {
      queuedRequests.shift()?.rejectPromise(error);
    }
  };

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
    activeRequestId = null;
    rejectQueued(error);
  };

  const dispatchNext = () => {
    if (stopped || child.killed || activeRequestId != null) {
      return;
    }

    const next = queuedRequests.shift();
    if (!next) {
      return;
    }

    const id = next.envelope.id;
    const startedAt = Date.now();
    const queueWaitMs = startedAt - next.enqueuedAt;
    recordBenchmarkEvent({
      layer: 'main',
      category: 'core-command',
      name: 'backend.core.request.dispatch',
      phase: 'instant',
      command: next.commandName,
      detail: {
        id,
        queueWaitMs,
        queued: queuedRequests.length,
        timeoutMs: next.timeoutMs,
        payload: next.payloadSummary,
        role,
        workerIndex,
      },
    });
    const timeout = setTimeout(() => {
      pending.delete(id);
      activeRequestId = null;
      traceIpc(`timeout id=${id} command=${next.commandName} elapsedMs=${Date.now() - startedAt} pending=${pending.size}`);
      recordBenchmarkEvent({
        layer: 'main',
        category: 'core-command',
        name: 'backend.core.request.timeout',
        phase: 'end',
        command: next.commandName,
        durationMs: Date.now() - next.enqueuedAt,
        detail: {
          id,
          queueWaitMs,
          activeMs: Date.now() - startedAt,
          timeoutMs: next.timeoutMs,
          role,
          workerIndex,
        },
      });
      next.rejectPromise(new Error(`desktop core timed out while handling ${next.commandName}`));
      dispatchNext();
    }, next.timeoutMs);

    pending.set(id, {
      startedAt,
      resolve: (payloadValue) => {
        const activeMs = Date.now() - startedAt;
        traceIpc(
          `resolve id=${id} command=${next.commandName} elapsedMs=${activeMs} pending=${pending.size} payload=${summarizePayload(payloadValue)}`,
        );
        recordBenchmarkEvent({
          layer: 'main',
          category: 'core-command',
          name: 'backend.core.request.resolve',
          phase: 'end',
          command: next.commandName,
          durationMs: Date.now() - next.enqueuedAt,
          detail: {
            id,
            queueWaitMs,
            activeMs,
            result: summarizePayload(payloadValue),
            role,
            workerIndex,
          },
        });
        next.resolvePromise(payloadValue as never);
      },
      reject: (error) => {
        const activeMs = Date.now() - startedAt;
        traceIpc(
          `reject id=${id} command=${next.commandName} elapsedMs=${activeMs} pending=${pending.size} error=${error.message}`,
        );
        recordBenchmarkEvent({
          layer: 'main',
          category: 'core-command',
          name: 'backend.core.request.reject',
          phase: 'end',
          command: next.commandName,
          durationMs: Date.now() - next.enqueuedAt,
          detail: {
            id,
            queueWaitMs,
            activeMs,
            error: error.message,
            role,
            workerIndex,
          },
        });
        next.rejectPromise(error);
      },
      timeout,
    });
    activeRequestId = id;
    traceIpc(
      `invoke id=${id} command=${next.commandName} pending=${pending.size} queued=${queuedRequests.length} payload=${next.payloadSummary}`,
    );

    child.stdin.write(`${JSON.stringify(next.envelope)}\n`, (error) => {
      if (!error) {
        return;
      }

      clearTimeout(timeout);
      pending.delete(id);
      activeRequestId = null;
      traceIpc(
        `stdin-error id=${id} command=${next.commandName} elapsedMs=${Date.now() - startedAt} pending=${pending.size} error=${error.message}`,
      );
      recordBenchmarkEvent({
        layer: 'main',
        category: 'core-command',
        name: 'backend.core.request.stdin-error',
        phase: 'end',
        command: next.commandName,
        durationMs: Date.now() - next.enqueuedAt,
        detail: {
          id,
          queueWaitMs,
          activeMs: Date.now() - startedAt,
          error: error.message,
          role,
          workerIndex,
        },
      });
      next.rejectPromise(error);
      dispatchNext();
    });
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
    if (activeRequestId === response.id) {
      activeRequestId = null;
    }
    traceIpc(
      `response id=${response.id} ok=${response.ok} elapsedMs=${Date.now() - request.startedAt} pending=${pending.size} payload=${summarizePayload(response.payload)}`,
    );
    recordBenchmarkEvent({
      layer: 'main',
      category: 'core-command',
      name: 'backend.core.response.received',
      phase: 'instant',
      durationMs: Date.now() - request.startedAt,
      detail: {
        id: response.id,
        ok: response.ok,
        result: summarizePayload(response.payload),
        role,
        workerIndex,
      },
    });

    if (response.ok) {
      request.resolve(response.payload as unknown);
      dispatchNext();
      return;
    }

    request.reject(new Error(response.error ?? 'desktop core command failed'));
    dispatchNext();
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trimEnd();
    stderr.push(text);
    console.error(`[banji-desktop-core] ${text}`);
  });

  child.once('error', (error) => {
    launchError = error;
    stopped = true;
    recordBenchmarkEvent({
      layer: 'main',
      category: 'startup',
      name: 'backend.core.child.error',
      phase: 'instant',
      detail: {
        error: error.message,
      },
    });
    stdoutInterface.close();
    rejectPending(error);
  });

  child.once('exit', (_code, signal) => {
    stopped = true;
    recordBenchmarkEvent({
      layer: 'main',
      category: 'startup',
      name: 'backend.core.child.exit',
      phase: 'instant',
      detail: {
        signal,
      },
    });
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

    const timeoutMs = options?.timeoutMs ?? DEFAULT_CORE_TIMEOUT_MS;
    const coalesceKey = isReadOnlyCoreCommand(commandName)
      ? coreReadCoalesceKey(commandName, payload, timeoutMs)
      : null;
    const coalesced = coalesceKey ? coalescedReadRequests.get(coalesceKey) : null;
    if (coalesced) {
      recordBenchmarkEvent({
        layer: 'main',
        category: 'core-command',
        name: 'backend.core.request.coalesced',
        phase: 'instant',
        command: commandName,
        detail: {
          timeoutMs,
          payload: summarizePayload(payload),
          role,
          workerIndex,
        },
      });
      return (await coalesced) as T;
    }

    const id = nextId++;
    const envelope: CoreRequestEnvelope = {
      id,
      command: commandName,
      payload,
    };

    const request = new Promise<T>((resolvePromise, rejectPromise) => {
      queuedRequests.push({
        commandName,
        enqueuedAt: Date.now(),
        envelope,
        payloadSummary: summarizePayload(payload),
        resolvePromise,
        rejectPromise,
        timeoutMs,
      });
      traceIpc(`queue id=${id} command=${commandName} queued=${queuedRequests.length}`);
      recordBenchmarkEvent({
        layer: 'main',
        category: 'core-command',
        name: 'backend.core.request.queued',
        phase: 'start',
        command: commandName,
        detail: {
          id,
          queued: queuedRequests.length,
          timeoutMs,
          payload: summarizePayload(payload),
          role,
          workerIndex,
        },
      });
      dispatchNext();
    });
    if (coalesceKey) {
      coalescedReadRequests.set(coalesceKey, request);
      const clearCoalescedRequest = () => {
        if (coalescedReadRequests.get(coalesceKey) === request) {
          coalescedReadRequests.delete(coalesceKey);
        }
      };
      request.then(clearCoalescedRequest, clearCoalescedRequest);
    }
    return request;
  };

  try {
    const endPing = startBenchmarkSpan({
      category: 'startup',
      name: 'backend.core.system-ping',
      command: 'system.ping',
      layer: 'main',
    });
    await invoke('system.ping');
    endPing({ ok: true });
    snapshotProcessMemory('backend.core.ready');
  } catch (error) {
    if (!launchError && !child.killed && typeof child.pid === 'number') {
      terminateManagedChildProcess(child, 'SIGTERM');
    }
    const details = stderr.join('\n').trim();
    throw new Error(
      details
        ? `failed to start desktop core: ${details}`
        : launchError?.message
          ? `failed to start desktop core: ${launchError.message}`
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

      const endStop = startBenchmarkSpan({
        category: 'startup',
        name: 'backend.core.stop',
      });
      terminateManagedChildProcess(child, 'SIGTERM');
      await new Promise<void>((resolvePromise) => {
        const timeout = setTimeout(() => {
          if (!child.killed) {
            terminateManagedChildProcess(child, 'SIGKILL');
          }
        }, 3_000);

        child.once('exit', () => {
          clearTimeout(timeout);
          resolvePromise();
        });
      });
      endStop({ ok: true });
    },
  };
}
