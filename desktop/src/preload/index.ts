import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DesktopAppContext } from '@shared/ipc';

const desktopBridge = {
  getAppContext: (): Promise<DesktopAppContext> =>
    ipcRenderer.invoke(IPC_CHANNELS.getAppContext),
  restartBackend: (): Promise<DesktopAppContext> =>
    ipcRenderer.invoke(IPC_CHANNELS.restartBackend),
  onBackendStatus: (listener: (context: DesktopAppContext) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, context: DesktopAppContext) => {
      listener(context);
    };
    ipcRenderer.on(IPC_CHANNELS.backendStatus, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.backendStatus, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge);
