import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { benchmarkChildEnv, clickWithBrowserStartTime, closeKaurKhorBenchmarkSession } from './electron-app';

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
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('closeKaurKhorBenchmarkSession', () => {
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

    const closePromise = closeKaurKhorBenchmarkSession({ app } as never);
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

    const closePromise = closeKaurKhorBenchmarkSession({ app } as never);
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

    await closeKaurKhorBenchmarkSession({ app } as never);

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(process.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('stops Electron context tracing before closing when trace capture is enabled', async () => {
    const process = createMockChildProcess();
    const tracing = {
      stop: vi.fn(async () => undefined),
    };
    const app = {
      context: () => ({ tracing }),
      process: () => process,
      close: vi.fn(async () => undefined),
    };

    await closeKaurKhorBenchmarkSession({ app, tracePath: '/tmp/kaur-khor-trace.zip' } as never);

    expect(tracing.stop).toHaveBeenCalledWith({ path: '/tmp/kaur-khor-trace.zip' });
    expect(app.close).toHaveBeenCalledTimes(1);
  });
});

describe('benchmarkChildEnv', () => {
  it('removes NO_COLOR from benchmark child processes', () => {
    const previousNoColor = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';

    try {
      const env = benchmarkChildEnv({ KAUR_KHOR_BENCHMARK: '1' });

      expect(env.NO_COLOR).toBeUndefined();
      expect(env.KAUR_KHOR_BENCHMARK).toBe('1');
    } finally {
      if (previousNoColor == null) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = previousNoColor;
      }
    }
  });

  it('does not inherit unrelated shell environment into the launched app', () => {
    const previousValue = process.env.KAUR_KHOR_BENCHMARK_FIXTURE_SIZE;
    process.env.KAUR_KHOR_BENCHMARK_FIXTURE_SIZE = 'power-user';

    try {
      const env = benchmarkChildEnv({ KAUR_KHOR_BENCHMARK: '1' });

      expect(env.KAUR_KHOR_BENCHMARK_FIXTURE_SIZE).toBeUndefined();
      expect(env.KAUR_KHOR_BENCHMARK).toBe('1');
    } finally {
      if (previousValue == null) {
        delete process.env.KAUR_KHOR_BENCHMARK_FIXTURE_SIZE;
      } else {
        process.env.KAUR_KHOR_BENCHMARK_FIXTURE_SIZE = previousValue;
      }
    }
  });
});

describe('clickWithBrowserStartTime', () => {
  it('uses the browser pointer timestamp when the click listener records one', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const page = {
      evaluate: vi.fn(async () => 125),
    };
    const locator = {
      evaluate: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      page: vi.fn(() => page),
    };

    await expect(clickWithBrowserStartTime(locator as never)).resolves.toBe(125);

    expect(locator.evaluate).toHaveBeenCalledTimes(1);
    expect(locator.click).toHaveBeenCalledTimes(1);
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 200);
  });

  it('falls back to the harness timestamp when no browser timestamp is recorded', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(300);
    const page = {
      evaluate: vi.fn(async (_callback: unknown, fallback: number) => fallback),
    };
    const locator = {
      evaluate: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      page: vi.fn(() => page),
    };

    await expect(clickWithBrowserStartTime(locator as never)).resolves.toBe(300);
  });
});
