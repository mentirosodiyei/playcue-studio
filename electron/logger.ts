import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Per-project logs: <userData>/logs/<project>/<YYYY-MM-DD>.log
 * One folder per project (show name), one file per day. Day files older than RETENTION_DAYS are
 * deleted at startup and once every 6 hours (empty project folders are removed too).
 */
const RETENTION_DAYS = 30;
let currentProject = 'General';
let lastPurge = 0;

export function getLogsRoot(): string {
  return path.join(app.getPath('userData'), 'logs');
}

function safeName(name: string): string {
  const cleaned = (name || 'General')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || 'General';
}

function dayStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function timeStamp(d = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function purgeOldLogs(): void {
  try {
    const root = getLogsRoot();
    if (!fs.existsSync(root)) return;
    const limit = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const projectDir = path.join(root, dir.name);
      for (const file of fs.readdirSync(projectDir)) {
        const full = path.join(projectDir, file);
        try {
          if (fs.statSync(full).mtimeMs < limit) fs.unlinkSync(full);
        } catch {}
      }
      try {
        if (fs.readdirSync(projectDir).length === 0) fs.rmdirSync(projectDir);
      } catch {}
    }
  } catch {}
}

export function setLogProject(name: string): void {
  const next = safeName(name);
  if (next === currentProject) return;
  writeLog('INFO', 'app', `Proyecto activo: "${currentProject}" -> "${next}"`);
  currentProject = next;
  writeLog('INFO', 'app', `Proyecto activo: "${next}"`);
}

export function writeLog(level: string, source: string, message: string): void {
  try {
    const now = Date.now();
    if (now - lastPurge > 6 * 60 * 60 * 1000) {
      lastPurge = now;
      purgeOldLogs();
    }
    const dir = path.join(getLogsRoot(), currentProject);
    fs.mkdirSync(dir, { recursive: true });
    const line = `${dayStamp()} ${timeStamp()} [${level}] [${source}] ${String(message).slice(0, 4000).replace(/\r?\n/g, ' | ')}\n`;
    fs.appendFileSync(path.join(dir, `${dayStamp()}.log`), line, 'utf-8');
  } catch {
    // logging must never break the app
  }
}

export function initLogger(): void {
  purgeOldLogs();
  lastPurge = Date.now();
  writeLog(
    'INFO',
    'app',
    `Inicio PlayCue Studio v${app.getVersion()} | Electron ${process.versions.electron} | ${process.platform} ${process.arch} | pid ${process.pid}`
  );
  process.on('uncaughtException', (err) => {
    writeLog('ERROR', 'main', `uncaughtException: ${err?.stack || err}`);
  });
  process.on('unhandledRejection', (reason) => {
    writeLog('ERROR', 'main', `unhandledRejection: ${(reason as any)?.stack || reason}`);
  });
  app.on('render-process-gone', (_e, _wc, details) => {
    writeLog('ERROR', 'main', `render-process-gone: ${details.reason} (code ${details.exitCode})`);
  });
  app.on('child-process-gone', (_e, details) => {
    writeLog('ERROR', 'main', `child-process-gone: ${details.type} ${details.reason} (code ${details.exitCode})`);
  });
  app.on('before-quit', () => writeLog('INFO', 'app', 'Cierre de la aplicación'));
}
