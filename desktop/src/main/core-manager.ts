import {
  startManagedCore,
  type ManagedCoreProcess,
  type StartManagedCoreOptions,
} from './backend';

export interface ManagedCoreController {
  invoke: <T>(command: string, payload?: unknown) => Promise<T>;
  stop: () => Promise<void>;
}

export function createManagedCoreController(
  options: StartManagedCoreOptions,
  start = startManagedCore,
): ManagedCoreController {
  let managedCore: ManagedCoreProcess | null = null;

  async function ensureManagedCore() {
    if (managedCore) {
      return managedCore;
    }

    managedCore = await start(options);
    return managedCore;
  }

  return {
    invoke: async <T>(command: string, payload?: unknown): Promise<T> => {
      const core = await ensureManagedCore();

      try {
        return await core.invoke<T>(command, payload);
      } catch (error) {
        if (core.isStopped()) {
          managedCore = null;
        }
        throw error;
      }
    },
    stop: async () => {
      const core = managedCore;
      managedCore = null;
      await core?.stop();
    },
  };
}
