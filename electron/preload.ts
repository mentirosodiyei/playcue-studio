import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getOutputStatus: () => ipcRenderer.invoke('get-output-status'),
  setOutputWindow: (payload: {
    open: boolean;
    displayId?: number;
    windowed?: boolean;
    mosaicConfig?: any;
  }) => ipcRenderer.invoke('set-output-window', payload),
  syncOutputState: (state: any) => ipcRenderer.send('sync-output-state', state),
  updateTelemetry: (telemetry: any) => ipcRenderer.send('update-telemetry', telemetry),
  getRemoteInfo: () => ipcRenderer.invoke('get-remote-info'),
  installCompanionModule: () => ipcRenderer.invoke('install-companion-module'),
  selectVideoFiles: () => ipcRenderer.invoke('select-video-files'),
  selectVideoFolder: () => ipcRenderer.invoke('select-video-folder'),
  expandDroppedPaths: (paths: string[]) => ipcRenderer.invoke('expand-dropped-paths', paths),
  locateFileInFolder: (filePath: string) => ipcRenderer.invoke('locate-file-in-folder', filePath),
  relinkVideoFile: (oldName: string) => ipcRenderer.invoke('relink-video-file', oldName),
  probeMedia: (filePath: string) => ipcRenderer.invoke('probe-media', filePath),
  transcodeProxy: (payload: {
    cueId: string;
    filePath: string;
    duration: number;
    options?: any;
  }) => ipcRenderer.invoke('transcode-proxy', payload),
  generateDemoClips: () => ipcRenderer.invoke('generate-demo-clips'),
  getFirstRunDemoClips: () => ipcRenderer.invoke('get-first-run-demo-clips'),
  saveShowFile: (json: string, defaultName: string) =>
    ipcRenderer.invoke('save-show-file', json, defaultName),
  openShowFile: () => ipcRenderer.invoke('open-show-file'),
  autosaveShow: (json: string) => ipcRenderer.invoke('autosave-show', json),
  loadAutosaveShow: () => ipcRenderer.invoke('load-autosave-show'),
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return (file as any).path || '';
    }
  },
  onDisplaysUpdated: (cb: (displays: any[]) => void) => {
    const handler = (_e: any, data: any) => cb(data);
    ipcRenderer.on('displays-updated', handler);
    return () => ipcRenderer.removeListener('displays-updated', handler);
  },
  onOutputWindowStatus: (cb: (status: any) => void) => {
    const handler = (_e: any, data: any) => cb(data);
    ipcRenderer.on('output-window-status', handler);
    return () => ipcRenderer.removeListener('output-window-status', handler);
  },
  onOutputState: (cb: (state: any) => void) => {
    const handler = (_e: any, data: any) => cb(data);
    ipcRenderer.on('output-state', handler);
    return () => ipcRenderer.removeListener('output-state', handler);
  },
  onProxyProgress: (cb: (data: { cueId: string; percent: number }) => void) => {
    const handler = (_e: any, data: any) => cb(data);
    ipcRenderer.on('proxy-progress', handler);
    return () => ipcRenderer.removeListener('proxy-progress', handler);
  },
  onRemoteCommand: (cb: (cmd: any) => void) => {
    const handler = (_e: any, data: any) => cb(data);
    ipcRenderer.on('remote-command', handler);
    return () => ipcRenderer.removeListener('remote-command', handler);
  },
});
