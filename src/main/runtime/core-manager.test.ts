// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createManagedCoreController } from './core-manager';
import type { ManagedCoreProcess } from './backend';

function createInvokeMock() {
  return vi.fn() as unknown as ManagedCoreProcess['invoke'] & ReturnType<typeof vi.fn>;
}

function createCoreStub(options?: {
  invoke?: ManagedCoreProcess['invoke'];
  isStopped?: () => boolean;
  stop?: () => Promise<void>;
}): ManagedCoreProcess {
  return {
    invoke: options?.invoke ?? (async <T>() => undefined as T),
    isStopped: options?.isStopped ?? (() => false),
    stop: options?.stop ?? vi.fn(async () => undefined),
  };
}

describe('managed core controller', () => {
  it('reuses the same core after a command-level error', async () => {
    const invoke = createInvokeMock()
      .mockRejectedValueOnce(new Error('validation failed'))
      .mockResolvedValueOnce({ ok: true });
    const core = createCoreStub({ invoke, isStopped: () => false });
    const start = vi.fn(async () => core);
    const controller = createManagedCoreController(
      {
        projectRoot: '/tmp/project',
        userDataPath: '/tmp/user-data',
      },
      start,
    );

    await expect(controller.invoke('sena.upsertCatalog')).rejects.toThrow('validation failed');
    await expect(controller.invoke('sena.getCatalog')).resolves.toEqual({ ok: true });

    expect(start).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('starts a replacement core after the previous process stops', async () => {
    const firstCore = createCoreStub({
      invoke: createInvokeMock().mockRejectedValue(new Error('core exited')),
      isStopped: () => true,
    });
    const secondCore = createCoreStub({
      invoke: createInvokeMock().mockResolvedValue({ ok: true }),
      isStopped: () => false,
    });
    const start = vi
      .fn(async () => firstCore)
      .mockResolvedValueOnce(firstCore)
      .mockResolvedValueOnce(secondCore);
    const controller = createManagedCoreController(
      {
        projectRoot: '/tmp/project',
        userDataPath: '/tmp/user-data',
      },
      start,
    );

    await expect(controller.invoke('sena.getCatalog')).rejects.toThrow('core exited');
    await expect(controller.invoke('sena.getCatalog')).resolves.toEqual({ ok: true });

    expect(start).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent startup so only one core process launches', async () => {
    let resolveStart: ((core: ManagedCoreProcess) => void) | null = null;
    const core = createCoreStub({
      invoke: createInvokeMock().mockResolvedValue({ ok: true }),
      isStopped: () => false,
    });
    const start = vi.fn(
      () =>
        new Promise<ManagedCoreProcess>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const controller = createManagedCoreController(
      {
        projectRoot: '/tmp/project',
        userDataPath: '/tmp/user-data',
      },
      start,
    );

    const firstInvoke = controller.invoke('sena.getCatalog');
    const secondInvoke = controller.invoke('sena.getWorkspaceSummary');

    expect(start).toHaveBeenCalledTimes(1);

    expect(resolveStart).not.toBeNull();
    resolveStart!(core);

    await expect(firstInvoke).resolves.toEqual({ ok: true });
    await expect(secondInvoke).resolves.toEqual({ ok: true });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('stops a core process that resolves after startup was canceled', async () => {
    let resolveFirstStart: ((core: ManagedCoreProcess) => void) | null = null;
    const firstCore = createCoreStub({
      invoke: createInvokeMock().mockResolvedValue({ ok: false }),
      isStopped: () => false,
      stop: vi.fn(async () => undefined),
    });
    const secondCore = createCoreStub({
      invoke: createInvokeMock().mockResolvedValue({ ok: true }),
      isStopped: () => false,
    });
    const start = vi.fn()
      .mockImplementationOnce(
        () =>
          new Promise<ManagedCoreProcess>((resolve) => {
            resolveFirstStart = resolve;
          }),
      )
      .mockResolvedValueOnce(secondCore);
    const controller = createManagedCoreController(
      {
        projectRoot: '/tmp/project',
        userDataPath: '/tmp/user-data',
      },
      start,
    );

    const firstInvoke = controller.invoke('sena.getCatalog');
    await controller.stop();

    expect(resolveFirstStart).not.toBeNull();
    resolveFirstStart!(firstCore);

    await expect(firstInvoke).rejects.toThrow('desktop core startup was canceled');
    expect(firstCore.stop).toHaveBeenCalledTimes(1);
    await expect(controller.invoke('sena.getCatalog')).resolves.toEqual({ ok: true });
    expect(start).toHaveBeenCalledTimes(2);
  });
});
