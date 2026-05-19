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

interface QueuedRequest {
  commandName: string;
  enqueuedAt: number;
  envelope: CoreRequestEnvelope;
  payloadSummary: string;
  resolvePromise: (value: unknown) => void;
  rejectPromise: (reason?: unknown) => void;
  timeoutMs: number;
}

const DEFAULT_CORE_TIMEOUT_MS = 15_000;
const DEFERRED_READ_WORKER_READY_TIMEOUT_MS = 1_000;
const DEFAULT_COMMAND_ACTIVE_MS = 80;
const READ_WORKER_EWMA_ALPHA = 0.3;

export type CoreReadPriority = 'critical' | 'deferred' | 'background';

export interface CoreInvokeOptions {
  timeoutMs?: number;
  readPriority?: CoreReadPriority;
}

export interface ManagedCoreProcess {
  invoke: <T>(
    command: string,
    payload?: unknown,
    options?: CoreInvokeOptions,
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
type CoreReadLane = 'interactive' | 'bulk';

export interface ActiveCoreCommand {
  commandName: string;
  lane: CoreReadLane | null;
}

function readCoreResponseId(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const id = (value as { id?: unknown }).id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isCoreResponseEnvelope(value: unknown): value is CoreResponseEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const envelope = value as { error?: unknown; id?: unknown; ok?: unknown };
  if (
    typeof envelope.id !== 'number' ||
    !Number.isSafeInteger(envelope.id) ||
    envelope.id <= 0 ||
    typeof envelope.ok !== 'boolean'
  ) {
    return false;
  }

  return envelope.ok || envelope.error === undefined || typeof envelope.error === 'string';
}

export function predictWorkerFinishMs({
  averageActiveMs,
  activeCommands,
  commandAverageActiveMs,
  commandName,
  lane,
}: {
  averageActiveMs: number;
  activeCommands: ActiveCoreCommand[];
  commandAverageActiveMs: Map<string, number>;
  commandName: string;
  lane: CoreReadLane;
}) {
  const fallbackActiveMs = Number.isFinite(averageActiveMs) && averageActiveMs > 0
    ? averageActiveMs
    : DEFAULT_COMMAND_ACTIVE_MS;
  const estimateCommandMs = (name: string) => commandAverageActiveMs.get(name) ?? fallbackActiveMs;
  const queuedWorkMs = activeCommands.reduce(
    (total, entry) => total + estimateCommandMs(entry.commandName),
    0,
  );
  const laneBacklogMs = activeCommands.reduce(
    (total, entry) => total + (entry.lane === lane ? estimateCommandMs(entry.commandName) : 0),
    0,
  );
  const crossLanePenaltyMs = activeCommands.reduce(
    (total, entry) => total + (entry.lane != null && entry.lane !== lane ? estimateCommandMs(entry.commandName) : 0),
    0,
  );
  const predictedCommandMs = commandAverageActiveMs.get(commandName) ?? DEFAULT_COMMAND_ACTIVE_MS;
  return {
    crossLanePenaltyMs,
    laneBacklogMs,
    predictedFinishMs: queuedWorkMs + predictedCommandMs + crossLanePenaltyMs,
  };
}

interface CorePoolWorker {
  activeCount: number;
  activeCommands: ActiveCoreCommand[];
  activeBulkCount: number;
  activeInteractiveCount: number;
  averageActiveMs: number;
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
  const raw = process.env.KAUR_KHOR_DESKTOP_TRACE_IPC;
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

export function isReadOnlyCoreCommand(commandName: string) {
  return commandName === 'system.ping'
    || commandName.startsWith('sena.get')
    || commandName.startsWith('sena.list')
    || commandName.startsWith('inventory.load')
    || commandName.startsWith('inventory.list');
}

export function shouldWaitForReadWorker({
  commandName,
  hasReadyReadWorker,
  readPriority,
}: {
  commandName: string;
  hasReadyReadWorker: boolean;
  readPriority?: CoreReadPriority;
}) {
  return isReadOnlyCoreCommand(commandName)
    && readPriority !== 'critical'
    && !hasReadyReadWorker;
}

function isBulkReadCoreCommand(commandName: string) {
  return commandName === 'sena.listObservations'
    || commandName === 'sena.listObservationPage'
    || commandName === 'sena.getDiagnostics';
}

function resolveReadLane(commandName: string, readPriority?: CoreReadPriority): 'interactive' | 'bulk' {
  if (readPriority === 'background' || isBulkReadCoreCommand(commandName)) {
    return 'bulk';
  }
  return 'interactive';
}

function updateEwmaAverage(previous: number, sample: number, alpha = READ_WORKER_EWMA_ALPHA) {
  if (!Number.isFinite(sample) || sample <= 0) {
    return previous;
  }
  if (!Number.isFinite(previous) || previous <= 0) {
    return sample;
  }
  return alpha * sample + (1 - alpha) * previous;
}

export function coreReadCoalesceKey(
  commandName: string,
  payload: unknown,
  timeoutMs: number,
  readPriority?: CoreReadPriority,
) {
  try {
    return `${commandName}:${timeoutMs}:${readPriority ?? 'default'}:${JSON.stringify(payload ?? null)}`;
  } catch {
    return null;
  }
}

function traceIpc(message: string) {
  if (!desktopTraceEnabled()) {
    return;
  }
  console.log(`[kaur-khor-desktop-ipc] ${message}`);
}

function resolveDesktopCoreBinaryName() {
  return process.platform === 'win32' ? 'kaur-khor-desktop-core.exe' : 'kaur-khor-desktop-core';
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
    KAUR_KHOR_DESKTOP_DATA_PATH: dataFilePath,
    ...(role ? { KAUR_KHOR_CORE_WORKER_ROLE: role } : {}),
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
  const explicitBinary = process.env.KAUR_KHOR_DESKTOP_CORE_BINARY;
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
  const commandAverageActiveMs = new Map<string, number>();
  const readPoolSize = resolveReadPoolSize();
  const readWorkerReadyWaiters = new Set<() => void>();
  let stopped = false;
  let readGeneration = 0;

  const notifyReadWorkerReady = () => {
    for (const resolve of readWorkerReadyWaiters) {
      resolve();
    }
    readWorkerReadyWaiters.clear();
  };

  const hasReadyReadWorker = () =>
    readWorkers.some((worker) => !worker.process.isStopped());

  const waitForReadWorker = async (timeoutMs: number) => {
    if (hasReadyReadWorker() || stopped) {
      return hasReadyReadWorker();
    }

    const startedAt = Date.now();
    const ready = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        readWorkerReadyWaiters.delete(resolveReady);
        resolve(false);
      }, timeoutMs);
      const resolveReady = () => {
        clearTimeout(timeout);
        resolve(hasReadyReadWorker());
      };
      readWorkerReadyWaiters.add(resolveReady);
    });
    recordBenchmarkEvent({
      layer: 'main',
      category: 'core-command',
      name: 'backend.core.read-pool.ready-wait',
      phase: 'instant',
      detail: {
        ready,
        waitMs: Date.now() - startedAt,
        timeoutMs,
        poolSize: readPoolSize,
      },
    });
    return ready;
  };

  for (let index = 0; index < readPoolSize; index += 1) {
    void startManagedCoreWithFallback(options, env, launchCommands, 'read', index + 1)
      .then((process) => {
        const worker: CorePoolWorker = {
          activeCount: 0,
          activeCommands: [],
          activeBulkCount: 0,
          activeInteractiveCount: 0,
          averageActiveMs: DEFAULT_COMMAND_ACTIVE_MS,
          index: index + 1,
          process,
          role: 'read',
        };
        if (stopped) {
          void process.stop();
          return;
        }
        readWorkers.push(worker);
        notifyReadWorkerReady();
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
        console.warn(`[kaur-khor-desktop-core] read worker ${index + 1} failed to start: ${(error as Error).message}`);
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
    activeCommands: [],
    activeBulkCount: 0,
    activeInteractiveCount: 0,
    averageActiveMs: DEFAULT_COMMAND_ACTIVE_MS,
    index: 0,
    process: writer,
    role: 'writer',
  };

  const predictedWorkerFinishMs = (
    worker: CorePoolWorker,
    commandName: string,
    lane: CoreReadLane,
  ) =>
    predictWorkerFinishMs({
      averageActiveMs: worker.averageActiveMs,
      activeCommands: worker.activeCommands,
      commandAverageActiveMs,
      commandName,
      lane,
    });

  const selectReadWorker = (commandName: string, readPriority?: CoreReadPriority) => {
    const available = readWorkers.filter((worker) => !worker.process.isStopped());
    if (available.length === 0) {
      return {
        lane: null,
        predictedFinishMs: null,
        worker: writerWorker,
      } as const;
    }
    const lane = resolveReadLane(commandName, readPriority);
    const laneScopedWorkers = lane === 'interactive'
      ? available.filter((worker) => worker.activeBulkCount === 0)
      : available.filter((worker) => worker.activeInteractiveCount === 0);
    const candidates = laneScopedWorkers.length > 0 ? laneScopedWorkers : available;
    const rankedWorkers = candidates
      .map((worker) => ({ worker, ...predictedWorkerFinishMs(worker, commandName, lane) }))
      .sort((left, right) =>
        left.predictedFinishMs - right.predictedFinishMs
        || left.laneBacklogMs - right.laneBacklogMs
        || left.crossLanePenaltyMs - right.crossLanePenaltyMs
        || left.worker.index - right.worker.index);
    const selected = rankedWorkers[0];
    return {
      lane,
      predictedFinishMs: selected?.predictedFinishMs ?? null,
      worker: selected?.worker ?? writerWorker,
    } as const;
  };

  const invokeOnWorker = async <T>(
    worker: CorePoolWorker,
    commandName: string,
    payload?: unknown,
    invokeOptions?: CoreInvokeOptions,
    readLane?: CoreReadLane | null,
    predictedFinishMs?: number | null,
  ) => {
    const isReadWorker = worker.role === 'read';
    const lane = isReadWorker ? readLane ?? 'interactive' : null;
    worker.activeCount += 1;
    worker.activeCommands.push({
      commandName,
      lane,
    });
    if (isReadWorker && lane === 'interactive') {
      worker.activeInteractiveCount += 1;
    }
    if (isReadWorker && lane === 'bulk') {
      worker.activeBulkCount += 1;
    }
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
        activeBulkCount: worker.activeBulkCount,
        activeInteractiveCount: worker.activeInteractiveCount,
        activeCommands: worker.activeCommands.map((entry) => `${entry.commandName}:${entry.lane ?? 'writer'}`),
        averageActiveMs: worker.averageActiveMs,
        readLane: lane,
        predictedFinishMs: predictedFinishMs ?? null,
      },
    });
    const startedAt = Date.now();
    try {
      return await worker.process.invoke<T>(commandName, payload, invokeOptions);
    } finally {
      worker.activeCount = Math.max(0, worker.activeCount - 1);
      const activeCommandIndex = worker.activeCommands.findIndex((entry) =>
        entry.commandName === commandName && entry.lane === lane);
      if (activeCommandIndex >= 0) {
        worker.activeCommands.splice(activeCommandIndex, 1);
      }
      if (isReadWorker && lane === 'interactive') {
        worker.activeInteractiveCount = Math.max(0, worker.activeInteractiveCount - 1);
      }
      if (isReadWorker && lane === 'bulk') {
        worker.activeBulkCount = Math.max(0, worker.activeBulkCount - 1);
      }
      const activeMs = Date.now() - startedAt;
      worker.averageActiveMs = updateEwmaAverage(worker.averageActiveMs, activeMs);
      commandAverageActiveMs.set(
        commandName,
        updateEwmaAverage(commandAverageActiveMs.get(commandName) ?? DEFAULT_COMMAND_ACTIVE_MS, activeMs),
      );
    }
  };

  const invoke = async <T>(
    commandName: string,
    payload?: unknown,
    invokeOptions?: CoreInvokeOptions,
  ): Promise<T> => {
    if (stopped || writer.isStopped()) {
      throw new Error('desktop core is not running');
    }

    const timeoutMs = invokeOptions?.timeoutMs ?? DEFAULT_CORE_TIMEOUT_MS;
    const readOnly = isReadOnlyCoreCommand(commandName);
    const coalesceKey = readOnly ? coreReadCoalesceKey(commandName, payload, timeoutMs, invokeOptions?.readPriority) : null;
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
        if (shouldWaitForReadWorker({
          commandName,
          hasReadyReadWorker: hasReadyReadWorker(),
          readPriority: invokeOptions?.readPriority,
        })) {
          await waitForReadWorker(DEFERRED_READ_WORKER_READY_TIMEOUT_MS);
        }
        const selectedWorker = selectReadWorker(commandName, invokeOptions?.readPriority);
        const result = await invokeOnWorker<T>(
          selectedWorker.worker,
          commandName,
          payload,
          invokeOptions,
          selectedWorker.lane,
          selectedWorker.predictedFinishMs,
        );
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
      notifyReadWorkerReady();
      await Promise.allSettled([
        writer.stop(),
        ...readWorkers.map((worker) => worker.process.stop()),
      ]);
    },
  };
}

function resolveReadPoolSize() {
  const raw = Number.parseInt(process.env.KAUR_KHOR_READ_CORE_POOL_SIZE ?? '3', 10);
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
    KAUR_KHOR_CORE_WORKER_ROLE: role,
    KAUR_KHOR_CORE_WORKER_INDEX: String(workerIndex),
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
  traceIpc(`spawn command=${command} args=${JSON.stringify(args)} dataPath=${env.KAUR_KHOR_DESKTOP_DATA_PATH ?? 'unset'}`);
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
  const queuedRequests: QueuedRequest[] = [];
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      return;
    }

    const responseId = readCoreResponseId(parsed);
    if (responseId == null) {
      return;
    }

    const request = pending.get(responseId);
    if (!request) {
      return;
    }

    clearTimeout(request.timeout);
    pending.delete(responseId);
    if (activeRequestId === responseId) {
      activeRequestId = null;
    }

    if (!isCoreResponseEnvelope(parsed)) {
      traceIpc(
        `malformed-response id=${responseId} elapsedMs=${Date.now() - request.startedAt} pending=${pending.size}`,
      );
      request.reject(new Error('desktop core returned a malformed response'));
      dispatchNext();
      return;
    }

    const response = parsed;
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
    console.error(`[kaur-khor-desktop-core] ${text}`);
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
    options?: CoreInvokeOptions,
  ): Promise<T> => {
    if (stopped || child.killed) {
      throw new Error('desktop core is not running');
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_CORE_TIMEOUT_MS;
    const coalesceKey = isReadOnlyCoreCommand(commandName)
      ? coreReadCoalesceKey(commandName, payload, timeoutMs, options?.readPriority)
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
        resolvePromise: (value) => resolvePromise(value as T),
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
    const launchErrorMessage = (launchError as Error | null)?.message ?? null;
    throw new Error(
      details
        ? `failed to start desktop core: ${details}`
        : launchErrorMessage
          ? `failed to start desktop core: ${launchErrorMessage}`
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
        let exited = false;
        const timeout = setTimeout(() => {
          if (!exited) {
            terminateManagedChildProcess(child, 'SIGKILL');
          }
        }, 3_000);

        child.once('exit', () => {
          exited = true;
          clearTimeout(timeout);
          resolvePromise();
        });
      });
      endStop({ ok: true });
    },
  };
}
