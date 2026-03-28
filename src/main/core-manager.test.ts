// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createManagedCoreController } from './core-manager';
import type { ManagedCoreProcess } from './backend';

function createCoreStub(options?: {
  invoke?: ManagedCoreProcess['invoke'];
  isStopped?: () => boolean;
  stop?: () => Promise<void>;
}): ManagedCoreProcess {
  return {
    invoke: options?.invoke ?? vi.fn(),
    isStopped: options?.isStopped ?? (() => false),
    stop: options?.stop ?? vi.fn(async () => undefined),
  };
}

describe('managed core controller', () => {
  it('reuses the same core after a command-level error', async () => {
    const invoke = vi
      .fn<ManagedCoreProcess['invoke']>()
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

    await expect(controller.invoke('inventory.saveSku')).rejects.toThrow('validation failed');
    await expect(controller.invoke('inventory.getSnapshot')).resolves.toEqual({ ok: true });

    expect(start).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('starts a replacement core after the previous process stops', async () => {
    const firstCore = createCoreStub({
      invoke: vi.fn<ManagedCoreProcess['invoke']>().mockRejectedValue(new Error('core exited')),
      isStopped: () => true,
    });
    const secondCore = createCoreStub({
      invoke: vi.fn<ManagedCoreProcess['invoke']>().mockResolvedValue({ ok: true }),
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

    await expect(controller.invoke('inventory.getSnapshot')).rejects.toThrow('core exited');
    await expect(controller.invoke('inventory.getSnapshot')).resolves.toEqual({ ok: true });

    expect(start).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent startup so only one core process launches', async () => {
    let resolveStart: ((core: ManagedCoreProcess) => void) | null = null;
    const core = createCoreStub({
      invoke: vi.fn<ManagedCoreProcess['invoke']>().mockResolvedValue({ ok: true }),
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

    const firstInvoke = controller.invoke('inventory.getSnapshot');
    const secondInvoke = controller.invoke('inventory.listStockReports');

    expect(start).toHaveBeenCalledTimes(1);

    resolveStart?.(core);

    await expect(firstInvoke).resolves.toEqual({ ok: true });
    await expect(secondInvoke).resolves.toEqual({ ok: true });
    expect(start).toHaveBeenCalledTimes(1);
  });
});
