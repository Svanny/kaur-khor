import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeBanjiBenchmarkSession } from './electron-app';

interface MockChildProcess extends EventEmitter {
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
}

function createMockChildProcess(
  options?: { exitCode?: number | null; killImpl?: () => void },
): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.exitCode = options?.exitCode ?? null;
  child.kill = vi.fn(() => {
    options?.killImpl?.();
    return true;
  });
  return child;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('closeBanjiBenchmarkSession', () => {
  it('force-kills when app.close hangs', async () => {
    vi.useFakeTimers();
    const process = createMockChildProcess({
      killImpl: () => {
        process.exitCode = 137;
        process.emit('exit', 137, 'SIGKILL');
      },
    });
    const app = {
      process: () => process,
      close: vi.fn(() => new Promise<void>(() => {})),
    };

    const closePromise = closeBanjiBenchmarkSession({ app } as never);
    await vi.advanceTimersByTimeAsync(10_001);
    await closePromise;

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(process.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('does not force-kill when app.close succeeds', async () => {
    vi.useFakeTimers();
    const process = createMockChildProcess();
    const app = {
      process: () => process,
      close: vi.fn(async () => undefined),
    };

    const closePromise = closeBanjiBenchmarkSession({ app } as never);
    await closePromise;

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('force-kills when app.close rejects and the child remains alive', async () => {
    vi.useFakeTimers();
    const process = createMockChildProcess({
      killImpl: () => {
        process.exitCode = 137;
        process.emit('exit', 137, 'SIGKILL');
      },
    });
    const app = {
      process: () => process,
      close: vi.fn(async () => {
        throw new Error('close failed');
      }),
    };

    await closeBanjiBenchmarkSession({ app } as never);

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(process.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
