/** Preload bridge for the pet window renderer. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petwhale', {
  onState: (callback: (snapshot: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: unknown): void => {
      callback(snapshot);
    };
    ipcRenderer.on('petwhale:state', listener);
    return () => {
      ipcRenderer.removeListener('petwhale:state', listener);
    };
  },
  onConfig: (callback: (config: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: unknown): void => {
      callback(config);
    };
    ipcRenderer.on('petwhale:config', listener);
    return () => {
      ipcRenderer.removeListener('petwhale:config', listener);
    };
  },
  status: (): Promise<unknown> => ipcRenderer.invoke('petwhale:status'),
  quit: (): Promise<void> => ipcRenderer.invoke('petwhale:quit'),
  showMenu: (): void => {
    ipcRenderer.send('petwhale:menu');
  },
  reportRendererError: (message: string): void => {
    ipcRenderer.send('petwhale:renderer-error', message);
  },
});
