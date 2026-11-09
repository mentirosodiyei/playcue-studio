import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  protocol,
  shell,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import {
  probeMediaFile,
  transcodeToPlayableMp4,
  generateDemoClips,
  expandPathsToVideoFiles,
  ConvertVideoOptions,
} from './mediaTools';
import { RemoteControlServer, LiveShowTelemetry } from './osc';

// Register media:// privileged scheme before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let outputWindows: BrowserWindow[] = [];
let currentOutputDisplayId: number | null = null;
let currentMosaicMode: string = 'single';
let currentIsSpanned = false;
let currentTotalWidth = 2560;
let currentTotalHeight = 1440;
let lastOutputState: any = null;
let remoteServer: RemoteControlServer | null = null;

const STANDARD_RESOLUTIONS = new Set([
  '1920x1080',
  '1280x720',
  '2560x1440',
  '3840x2160',
  '1920x1200',
  '1366x768',
  '1600x900',
  '4096x2160',
]);

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.mkv':
      return 'video/x-matroska';
    case '.avi':
      return 'video/x-msvideo';
    case '.ogg':
    case '.ogv':
      return 'video/ogg';
    default:
      return 'application/octet-stream';
  }
}

function getAppUrl(hash = ''): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return hash ? `${devServerUrl}#${hash}` : devServerUrl;
  }
  const indexPath = path.join(__dirname, '../dist/index.html');
  const fileUrl = pathToFileURL(indexPath).toString();
  return hash ? `${fileUrl}#${hash}` : fileUrl;
}

function formatDisplays() {
  const primary = screen.getPrimaryDisplay();
  const all = screen.getAllDisplays();
  return all.map((d, idx) => {
    const scale = d.scaleFactor || 1;
    const physW = Math.round(d.bounds.width * scale);
    const physH = Math.round(d.bounds.height * scale);
    const freq = Math.round((d as any).displayFrequency || 60);
    const resKey = `${physW}x${physH}`;
    const isCustom = !STANDARD_RESOLUTIONS.has(resKey);

    const baseName = d.label || `Salida ${idx + 1}`;
    const tag = d.id === primary.id ? 'Principal' : isCustom ? 'Custom EDID' : 'Externa';

    return {
      id: d.id,
      label: `${baseName} — ${physW}×${physH} @ ${freq}Hz [${tag}]`,
      width: d.bounds.width,
      height: d.bounds.height,
      physicalWidth: physW,
      physicalHeight: physH,
      refreshRate: freq,
      colorDepth: d.colorDepth || 24,
      x: d.bounds.x,
      y: d.bounds.y,
      isPrimary: d.id === primary.id,
      scaleFactor: scale,
      isCustomFormat: isCustom,
    };
  });
}

function broadcastDisplays() {
  const displays = formatDisplays();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('displays-updated', displays);
  }
}

function createMainWindow() {
  const iconPath = path.join(__dirname, '../build/icon.ico');
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0c10',
    title: 'CuePro Studio',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(getAppUrl());

  mainWindow.on('closed', () => {
    mainWindow = null;
    closeOutputWindows();
  });
}

function closeOutputWindows() {
  for (const win of outputWindows) {
    if (win && !win.isDestroyed()) {
      try {
        win.close();
      } catch {}
    }
  }
  outputWindows = [];
  currentIsSpanned = false;
  notifyOutputStatus();
}

function spawnSingleOutputBrowserWindow(
  bounds: { x: number; y: number; width: number; height: number },
  useBorderlessSpan: boolean,
  useFullscreen: boolean,
  viewportPayload: any
): BrowserWindow {
  const isBorderlessOrFull = useBorderlessSpan || useFullscreen;

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: !isBorderlessOrFull,
    thickFrame: !isBorderlessOrFull,
    fullscreen: false, // Set after moving to target display bounds so Windows targets the right monitor
    enableLargerThanScreen: true,
    resizable: !isBorderlessOrFull,
    movable: !isBorderlessOrFull,
    backgroundColor: '#000000',
    title: `CuePro Output — ${viewportPayload.label || 'OUTPUT'}`,
    autoHideMenuBar: true,
    alwaysOnTop: isBorderlessOrFull,
    skipTaskbar: isBorderlessOrFull,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (isBorderlessOrFull) {
    // Move to exact display coordinates first
    win.setBounds(bounds);
    if (useFullscreen && !useBorderlessSpan) {
      win.setFullScreen(true);
    }
    win.setAlwaysOnTop(true, 'screen-saver');
    if (useBorderlessSpan) {
      win.setBounds(bounds);
    }
  }

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && (input.key === 'Escape' || input.key === 'F11')) {
      closeOutputWindows();
    }
  });

  const encodedViewport = encodeURIComponent(JSON.stringify(viewportPayload));
  win.loadURL(getAppUrl(`output?viewport=${encodedViewport}`));

  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) {
      if (isBorderlessOrFull) {
        if (useFullscreen && !useBorderlessSpan) {
          win.setFullScreen(true);
        } else {
          win.setBounds(bounds);
        }
      }
      if (lastOutputState) {
        win.webContents.send('output-state', lastOutputState);
      }
    }
  });

  win.on('closed', () => {
    outputWindows = outputWindows.filter((w) => w !== win && !w.isDestroyed());
    notifyOutputStatus();
  });

  return win;
}

function openOutputWindows(
  displayId?: number,
  windowedMode = false,
  mosaicConfig?: {
    mode: 'single' | 'horizontal_2x1' | 'vertical_1x2' | 'mirror_2x';
    display1Id: number | null;
    display2Id: number | null;
    preferSpannedWindow: boolean;
    overlapPx: number;
  }
) {
  closeOutputWindows();

  const displays = formatDisplays();
  const primary = displays.find((d) => d.isPrimary) || displays[0];
  const mode = mosaicConfig?.mode || 'single';
  const overlapPx = Math.max(0, mosaicConfig?.overlapPx || 0);
  currentMosaicMode = mode;

  // 1. SINGLE MONITOR MODE
  if (mode === 'single' || displays.length === 1 || windowedMode) {
    const requestedId = displayId ?? mosaicConfig?.display1Id;
    const target =
      displays.find((d) => d.id === requestedId) ||
      displays.find((d) => !d.isPrimary) ||
      primary;

    currentOutputDisplayId = target.id;
    currentTotalWidth = target.physicalWidth;
    currentTotalHeight = target.physicalHeight;
    currentIsSpanned = false;

    const useFullscreen = !windowedMode;

    let winBounds = {
      x: useFullscreen ? target.x : target.x + 80,
      y: useFullscreen ? target.y : target.y + 80,
      width: useFullscreen ? target.width : 960,
      height: useFullscreen ? target.height : 540,
    };

    const win = spawnSingleOutputBrowserWindow(winBounds, false, useFullscreen, {
      mode,
      role: 'full',
      canvasWidth: currentTotalWidth,
      canvasHeight: currentTotalHeight,
      sliceX: 0,
      sliceY: 0,
      sliceWidth: currentTotalWidth,
      sliceHeight: currentTotalHeight,
      label: `OUTPUT (${currentTotalWidth}×${currentTotalHeight})`,
    });
    outputWindows.push(win);
    notifyOutputStatus();
    return;
  }

  // 2. MULTI-MONITOR MOSAIC (2x1 Horizontal, 1x2 Vertical, or 2x Mirror)
  const d1 =
    displays.find((d) => d.id === mosaicConfig?.display1Id) ||
    displays.find((d) => !d.isPrimary) ||
    displays[0];
  const d2 =
    displays.find((d) => d.id === mosaicConfig?.display2Id && d.id !== d1.id) ||
    displays.find((d) => d.id !== d1.id) ||
    d1;

  currentOutputDisplayId = d1.id;

  if (mode === 'mirror_2x') {
    currentTotalWidth = d1.physicalWidth;
    currentTotalHeight = d1.physicalHeight;
    currentIsSpanned = false;

    const w1 = spawnSingleOutputBrowserWindow(
      { x: d1.x, y: d1.y, width: d1.width, height: d1.height },
      false,
      true,
      {
        mode: 'mirror_2x',
        role: 'full',
        canvasWidth: d1.physicalWidth,
        canvasHeight: d1.physicalHeight,
        sliceX: 0,
        sliceY: 0,
        sliceWidth: d1.physicalWidth,
        sliceHeight: d1.physicalHeight,
        label: `MIRROR OUT 1 (${d1.physicalWidth}×${d1.physicalHeight})`,
      }
    );
    outputWindows.push(w1);

    if (d2.id !== d1.id) {
      const w2 = spawnSingleOutputBrowserWindow(
        { x: d2.x, y: d2.y, width: d2.width, height: d2.height },
        false,
        true,
        {
          mode: 'mirror_2x',
          role: 'full',
          canvasWidth: d2.physicalWidth,
          canvasHeight: d2.physicalHeight,
          sliceX: 0,
          sliceY: 0,
          sliceWidth: d2.physicalWidth,
          sliceHeight: d2.physicalHeight,
          label: `MIRROR OUT 2 (${d2.physicalWidth}×${d2.physicalHeight})`,
        }
      );
      outputWindows.push(w2);
    }
    notifyOutputStatus();
    return;
  }

  // Compute Virtual Canvas dimensions for Horizontal 2x1 or Vertical 1x2 Mosaic
  const isHorizontal = mode === 'horizontal_2x1';
  const totalPhysW = isHorizontal
    ? d1.physicalWidth + d2.physicalWidth - overlapPx
    : Math.max(d1.physicalWidth, d2.physicalWidth);
  const totalPhysH = isHorizontal
    ? Math.max(d1.physicalHeight, d2.physicalHeight)
    : d1.physicalHeight + d2.physicalHeight - overlapPx;

  currentTotalWidth = totalPhysW;
  currentTotalHeight = totalPhysH;

  const areHorizontallyContiguous =
    isHorizontal &&
    Math.abs(d1.x + d1.width - d2.x) <= 4 &&
    Math.abs(d1.y - d2.y) <= 4 &&
    overlapPx === 0;

  const areVerticallyContiguous =
    !isHorizontal &&
    Math.abs(d1.y + d1.height - d2.y) <= 4 &&
    Math.abs(d1.x - d2.x) <= 4 &&
    overlapPx === 0;

  const useSingleSpannedSurface =
    (mosaicConfig?.preferSpannedWindow ?? true) &&
    (areHorizontallyContiguous || areVerticallyContiguous);

  if (useSingleSpannedSurface && d1.id !== d2.id) {
    currentIsSpanned = true;
    const minX = Math.min(d1.x, d2.x);
    const minY = Math.min(d1.y, d2.y);
    const maxX = Math.max(d1.x + d1.width, d2.x + d2.width);
    const maxY = Math.max(d1.y + d1.height, d2.y + d2.height);

    const spannedWin = spawnSingleOutputBrowserWindow(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      true,
      false,
      {
        mode,
        role: 'full',
        canvasWidth: totalPhysW,
        canvasHeight: totalPhysH,
        sliceX: 0,
        sliceY: 0,
        sliceWidth: totalPhysW,
        sliceHeight: totalPhysH,
        label: `MOSAICO SPANNED (${totalPhysW}×${totalPhysH})`,
      }
    );
    outputWindows.push(spannedWin);
  } else {
    currentIsSpanned = false;

    const slice1 = isHorizontal
      ? {
          sliceX: 0,
          sliceY: 0,
          sliceWidth: d1.physicalWidth,
          sliceHeight: totalPhysH,
        }
      : {
          sliceX: 0,
          sliceY: 0,
          sliceWidth: totalPhysW,
          sliceHeight: d1.physicalHeight,
        };

    const slice2 = isHorizontal
      ? {
          sliceX: d1.physicalWidth - overlapPx,
          sliceY: 0,
          sliceWidth: d2.physicalWidth,
          sliceHeight: totalPhysH,
        }
      : {
          sliceX: 0,
          sliceY: d1.physicalHeight - overlapPx,
          sliceWidth: totalPhysW,
          sliceHeight: d2.physicalHeight,
        };

    const w1 = spawnSingleOutputBrowserWindow(
      { x: d1.x, y: d1.y, width: d1.width, height: d1.height },
      false,
      true,
      {
        mode,
        role: 'slot1',
        canvasWidth: totalPhysW,
        canvasHeight: totalPhysH,
        ...slice1,
        label: `MOSAICO SALIDA 1 (${d1.physicalWidth}×${d1.physicalHeight})`,
      }
    );
    outputWindows.push(w1);

    if (d2.id !== d1.id) {
      const w2 = spawnSingleOutputBrowserWindow(
        { x: d2.x, y: d2.y, width: d2.width, height: d2.height },
        false,
        true,
        {
          mode,
          role: 'slot2',
          canvasWidth: totalPhysW,
          canvasHeight: totalPhysH,
          ...slice2,
          label: `MOSAICO SALIDA 2 (${d2.physicalWidth}×${d2.physicalHeight})`,
        }
      );
      outputWindows.push(w2);
    }
  }

  notifyOutputStatus();
}

function notifyOutputStatus() {
  const isOpen = outputWindows.some((w) => w && !w.isDestroyed());
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('output-window-status', {
      isOpen,
      displayId: currentOutputDisplayId,
      mosaicMode: currentMosaicMode,
      isSpanned: currentIsSpanned,
      totalWidth: currentTotalWidth,
      totalHeight: currentTotalHeight,
    });
  }
  remoteServer?.updateTelemetry({ outputOpen: isOpen });
}

app.whenReady().then(() => {
  protocol.registerStreamProtocol('media', (request, callback) => {
    try {
      const urlObj = new URL(request.url);
      let filePath = urlObj.searchParams.get('path') || '';
      if (!filePath) {
        filePath = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ''));
      }

      if (!fs.existsSync(filePath)) {
        callback({ statusCode: 404 });
        return;
      }

      const stat = fs.statSync(filePath);
      const totalSize = stat.size;
      const mimeType = getMimeType(filePath);
      const rangeHeader = request.headers.Range || request.headers.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunksize = end - start + 1;

        callback({
          statusCode: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunksize),
            'Content-Type': mimeType,
          },
          data: fs.createReadStream(filePath, { start, end }),
        });
      } else {
        callback({
          statusCode: 200,
          headers: {
            'Content-Length': String(totalSize),
            'Accept-Ranges': 'bytes',
            'Content-Type': mimeType,
          },
          data: fs.createReadStream(filePath),
        });
      }
    } catch {
      callback({ statusCode: 500 });
    }
  });

  createMainWindow();

  remoteServer = new RemoteControlServer((cmd) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('remote-command', cmd);
    }
  });
  remoteServer.start();

  screen.on('display-added', broadcastDisplays);
  screen.on('display-removed', broadcastDisplays);
  screen.on('display-metrics-changed', broadcastDisplays);
});

// IPC Handlers
ipcMain.handle('get-displays', () => {
  return formatDisplays();
});

ipcMain.handle('get-output-status', () => {
  return {
    isOpen: outputWindows.some((w) => w && !w.isDestroyed()),
    displayId: currentOutputDisplayId,
    mosaicMode: currentMosaicMode,
    isSpanned: currentIsSpanned,
    totalWidth: currentTotalWidth,
    totalHeight: currentTotalHeight,
  };
});

ipcMain.handle(
  'set-output-window',
  (
    _event,
    payload: {
      open: boolean;
      displayId?: number;
      windowed?: boolean;
      mosaicConfig?: any;
    }
  ) => {
    if (payload.open) {
      openOutputWindows(payload.displayId, payload.windowed, payload.mosaicConfig);
    } else {
      closeOutputWindows();
    }
    return {
      isOpen: outputWindows.some((w) => w && !w.isDestroyed()),
      displayId: currentOutputDisplayId,
      mosaicMode: currentMosaicMode,
      isSpanned: currentIsSpanned,
      totalWidth: currentTotalWidth,
      totalHeight: currentTotalHeight,
    };
  }
);

ipcMain.on('sync-output-state', (_event, state) => {
  lastOutputState = state;
  for (const win of outputWindows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('output-state', state);
    }
  }
});

ipcMain.on('update-telemetry', (_event, telemetry: Partial<LiveShowTelemetry>) => {
  remoteServer?.updateTelemetry(telemetry);
});

ipcMain.handle('get-remote-info', () => {
  return remoteServer?.getServerInfo() || { oscPort: 51000, httpPort: 51080, ips: ['127.0.0.1'] };
});

ipcMain.handle('install-companion-module', () => {
  try {
    const appData = process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming');
    const targetDir = path.join(appData, 'companion', 'modules', 'cuepro-studio-1.4.0');

    let srcDir = path.join(__dirname, '../companion-module/dist-module');
    if (!fs.existsSync(srcDir)) {
      srcDir = srcDir.replace('app.asar', 'app.asar.unpacked');
    }

    if (!fs.existsSync(srcDir)) {
      return { ok: false, error: 'No se encontró el paquete del módulo Companion.' };
    }

    fs.mkdirSync(path.join(targetDir, 'companion'), { recursive: true });
    fs.copyFileSync(path.join(srcDir, 'main.js'), path.join(targetDir, 'main.js'));
    fs.copyFileSync(path.join(srcDir, 'package.json'), path.join(targetDir, 'package.json'));
    fs.copyFileSync(
      path.join(srcDir, 'companion', 'manifest.json'),
      path.join(targetDir, 'companion', 'manifest.json')
    );
    fs.copyFileSync(
      path.join(srcDir, 'companion', 'HELP.md'),
      path.join(targetDir, 'companion', 'HELP.md')
    );

    return { ok: true, targetDir };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('select-video-files', async () => {
  if (!mainWindow) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Añadir Archivos de Vídeo al Cue List',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Archivos de Vídeo',
        extensions: [
          'mp4',
          'mov',
          'mkv',
          'webm',
          'avi',
          'mxf',
          'm4v',
          'wmv',
          'mpg',
          'mpeg',
          'ts',
          'flv',
          'ogv',
        ],
      },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  });
  if (res.canceled) return [];
  return res.filePaths;
});

ipcMain.handle('select-video-folder', async () => {
  if (!mainWindow) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar Carpeta con Vídeos',
    properties: ['openDirectory', 'multiSelections'],
  });
  if (res.canceled || res.filePaths.length === 0) return [];
  return expandPathsToVideoFiles(res.filePaths);
});

ipcMain.handle('expand-dropped-paths', (_event, rawPaths: string[]) => {
  return expandPathsToVideoFiles(rawPaths || []);
});

ipcMain.handle('locate-file-in-folder', (_event, filePath: string) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
});

ipcMain.handle('relink-video-file', async (_event, oldName: string) => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: `Relinkear archivo: ${oldName}`,
    properties: ['openFile'],
    filters: [
      {
        name: 'Vídeo',
        extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mxf', 'm4v', 'wmv', 'mpg', 'ts'],
      },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  return res.filePaths[0];
});

ipcMain.handle('probe-media', async (_event, filePath: string) => {
  return await probeMediaFile(filePath);
});

ipcMain.handle(
  'transcode-proxy',
  async (
    _event,
    payload: {
      cueId: string;
      filePath: string;
      duration: number;
      options?: ConvertVideoOptions;
    }
  ) => {
    const cacheDir = path.join(app.getPath('userData'), 'proxy_cache');
    const proxyPath = await transcodeToPlayableMp4(
      payload.filePath,
      cacheDir,
      payload.duration || 10,
      (percent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('proxy-progress', {
            cueId: payload.cueId,
            percent,
          });
        }
      },
      payload.options
    );
    return proxyPath;
  }
);

ipcMain.handle('generate-demo-clips', async () => {
  const demoDir = path.join(app.getPath('userData'), 'demo_media');
  const paths = await generateDemoClips(demoDir);
  const results = [];
  for (const p of paths) {
    results.push(await probeMediaFile(p));
  }
  return results;
});

// Returns the 3 bundled demo videos ONLY on the very first run of the app
ipcMain.handle('get-first-run-demo-clips', async () => {
  try {
    const userDataDir = app.getPath('userData');
    const flagPath = path.join(userDataDir, 'first_run_demos_initialized.flag');
    const autosavePath = path.join(userDataDir, 'autosave_show.cueshow');

    if (fs.existsSync(flagPath) || fs.existsSync(autosavePath)) {
      return [];
    }

    fs.writeFileSync(flagPath, new Date().toISOString(), 'utf-8');

    const demoDir = path.join(userDataDir, 'demo_media');
    fs.mkdirSync(demoDir, { recursive: true });

    // Check if pre-built demo videos exist in bundled resources
    const bundledCandidates = [
      path.join(process.resourcesPath || '', 'demo_media'),
      path.join(__dirname, '../build/demo_media'),
    ];
    let copiedPaths: string[] = [];

    for (const candidateDir of bundledCandidates) {
      if (fs.existsSync(candidateDir)) {
        const files = fs.readdirSync(candidateDir).filter((f) => f.endsWith('.mp4'));
        if (files.length >= 3) {
          for (const f of files) {
            const dest = path.join(demoDir, f);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(candidateDir, f), dest);
            }
            copiedPaths.push(dest);
          }
          break;
        }
      }
    }

    if (copiedPaths.length === 0) {
      copiedPaths = await generateDemoClips(demoDir);
    }

    const results = [];
    for (const p of copiedPaths) {
      results.push(await probeMediaFile(p));
    }
    return results;
  } catch {
    return [];
  }
});

ipcMain.handle('save-show-file', async (_event, showDataJson: string, defaultName: string) => {
  if (!mainWindow) return null;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar Proyecto',
    defaultPath: defaultName.endsWith('.cueshow') ? defaultName : `${defaultName}.cueshow`,
    filters: [{ name: 'CuePro Show (*.cueshow)', extensions: ['cueshow', 'json'] }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, showDataJson, 'utf-8');
  return res.filePath;
});

ipcMain.handle('open-show-file', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir Proyecto',
    properties: ['openFile'],
    filters: [{ name: 'CuePro Show (*.cueshow, *.json)', extensions: ['cueshow', 'json'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const filePath = res.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { filePath, content };
});

ipcMain.handle('autosave-show', (_event, showDataJson: string) => {
  try {
    const p = path.join(app.getPath('userData'), 'autosave_show.cueshow');
    fs.writeFileSync(p, showDataJson, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('load-autosave-show', () => {
  try {
    const p = path.join(app.getPath('userData'), 'autosave_show.cueshow');
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
    return null;
  } catch {
    return null;
  }
});

app.on('window-all-closed', () => {
  remoteServer?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
