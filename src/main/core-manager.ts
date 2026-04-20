import {
  startManagedCore,
  type CoreInvokeOptions,
  type ManagedCoreProcess,
  type StartManagedCoreOptions,
} from './backend';

export interface ManagedCoreController {
  invoke: <T>(
    command: string,
    payload?: unknown,
    options?: CoreInvokeOptions,
  ) => Promise<T>;
  stop: () => Promise<void>;
}

export function createManagedCoreController(
  options: StartManagedCoreOptions,
  start = startManagedCore,
): ManagedCoreController {
  let managedCore: ManagedCoreProcess | null = null;
  let startingCore: Promise<ManagedCoreProcess> | null = null;

  async function ensureManagedCore() {
    if (managedCore) {
      return managedCore;
    }
    if (startingCore) {
      return startingCore;
    }

    startingCore = start(options)
      .then((core) => {
        managedCore = core;
        return core;
      })
      .finally(() => {
        startingCore = null;
      });
    return startingCore;
  }

  return {
    invoke: async <T>(
      command: string,
      payload?: unknown,
      options?: CoreInvokeOptions,
    ): Promise<T> => {
      const core = await ensureManagedCore();

      try {
        return await core.invoke<T>(command, payload, options);
      } catch (error) {
        if (core.isStopped()) {
          managedCore = null;
        }
        throw error;
      }
    },
    stop: async () => {
      startingCore = null;
      const core = managedCore;
      managedCore = null;
      await core?.stop();
    },
  };
}
