import { app, dialog, shell, BrowserWindow } from 'electron';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { trm } from './i18n';
import { writeLog } from './logger';

/**
 * Update checker. Looks at the latest GitHub release every few hours and, if it is newer, asks the
 * user. Windows (installed build): downloads the installer and runs it over the current install.
 * Portable build / macOS: opens the release page so the new version is downloaded by hand.
 * The user can always decline ("Later") or skip a version. Nothing is shown while a clip is playing.
 */
const REPO = 'mentirosodiyei/playcue-studio';
const RELEASE_PAGE_PREFIX = `https://github.com/${REPO}/`;
const TEST = process.env.PLAYCUE_UPDATE_TEST === '1'; // local test hooks (never set in normal use)
const API_URL =
  TEST && process.env.PLAYCUE_UPDATE_API
    ? process.env.PLAYCUE_UPDATE_API
    : `https://api.github.com/repos/${REPO}/releases/latest`;
const FIRST_CHECK_DELAY_MS = 30 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BUSY_RETRY_MS = 10 * 60 * 1000;
const ALLOWED_HOSTS = [/(^|\.)github\.com$/, /(^|\.)githubusercontent\.com$/];

export interface UpdateDeps {
  getWindow: () => BrowserWindow | null;
  isPlaying: () => boolean;
  setQuitting: () => void;
}

export interface UpdateResult {
  status: 'uptodate' | 'available' | 'deferred' | 'skipped' | 'error' | 'busy';
  current: string;
  latest?: string;
  error?: string;
}

interface UpdateSettings {
  auto: boolean;
  skipVersion: string;
}

let deps: UpdateDeps | null = null;
let checking = false;
let timer: NodeJS.Timeout | null = null;
let retryTimer: NodeJS.Timeout | null = null;
let pendingInstaller: string | null = null;
const promptedThisSession = new Set<string>();

const settingsPath = () => path.join(app.getPath('userData'), 'update-settings.json');

export function getUpdateSettings(): UpdateSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
    return { auto: raw.auto !== false, skipVersion: typeof raw.skipVersion === 'string' ? raw.skipVersion : '' };
  } catch {
    return { auto: true, skipVersion: '' };
  }
}

function saveUpdateSettings(s: UpdateSettings): void {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(s), 'utf-8');
  } catch {}
}

export function setAutoCheck(auto: boolean): void {
  saveUpdateSettings({ ...getUpdateSettings(), auto: !!auto });
}

/** Compare "1.6.1" style versions; returns >0 when a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (v.replace(/^v/i, '').match(/\d+/g) || []).slice(0, 3).map(Number);
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function hostAllowed(u: URL): boolean {
  if (TEST && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')) return true;
  return u.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
}

function request(url: string, headers: Record<string, string>): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (!hostAllowed(u)) return reject(new Error(`Host not allowed: ${u.hostname}`));
    const mod = u.protocol === 'http:' ? http : https;
    const req = mod.get(url, { headers: { 'User-Agent': 'PlayCue-Studio-Updater', ...headers }, timeout: 20000 }, resolve);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}

async function fetchJson(url: string): Promise<any> {
  const res = await request(url, { Accept: 'application/vnd.github+json' });
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`HTTP ${res.statusCode}`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of res) {
    size += (c as Buffer).length;
    if (size > 2 * 1024 * 1024) throw new Error('Response too large');
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

async function downloadFile(
  url: string,
  dest: string,
  expectedSize: number,
  expectedSha256: string | null,
  onProgress: (fraction: number) => void
): Promise<void> {
  let current = url;
  let res: http.IncomingMessage | null = null;
  for (let hop = 0; hop < 6; hop++) {
    res = await request(current, { Accept: 'application/octet-stream' });
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      current = new URL(res.headers.location, current).toString();
      continue;
    }
    break;
  }
  if (!res || res.statusCode !== 200) throw new Error(`HTTP ${res?.statusCode}`);
  const total = Number(res.headers['content-length']) || expectedSize || 0;
  const part = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const out = fs.createWriteStream(part);
  const hash = crypto.createHash('sha256');
  let received = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      res!.on('data', (chunk: Buffer) => {
        received += chunk.length;
        hash.update(chunk);
        if (total) onProgress(Math.min(1, received / total));
      });
      res!.on('error', reject);
      res!.on('aborted', () => reject(new Error('Download aborted')));
      out.on('error', reject);
      out.on('finish', () => resolve());
      res!.pipe(out);
    });
    if (expectedSize && received !== expectedSize) throw new Error(`Size mismatch (${received} != ${expectedSize})`);
    const digest = hash.digest('hex');
    if (expectedSha256 && digest.toLowerCase() !== expectedSha256.toLowerCase()) throw new Error('Checksum mismatch');
    fs.renameSync(part, dest);
  } catch (e) {
    try {
      out.destroy();
      fs.rmSync(part, { force: true });
    } catch {}
    throw e;
  }
}

function launchInstallerAndQuit(installer: string): void {
  writeLog('INFO', 'update', `Launching installer: ${installer}`);
  const child = spawn(installer, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' });
  child.unref();
  deps?.setQuitting();
  app.quit();
}

function pickInstallerAsset(assets: any[]): any | null {
  if (process.platform !== 'win32' || process.env.PORTABLE_EXECUTABLE_FILE) return null;
  return (
    assets.find((a) => typeof a?.name === 'string' && /^PlayCue_Studio_Setup_.*\.exe$/i.test(a.name)) || null
  );
}

async function promptAndUpdate(rel: any, latest: string, current: string): Promise<void> {
  const win = deps?.getWindow() ?? null;
  const asset = pickInstallerAsset(Array.isArray(rel.assets) ? rel.assets : []);
  const notes = typeof rel.body === 'string' ? rel.body.replace(/\r/g, '').trim().slice(0, 700) : '';
  const opts = {
    type: 'info' as const,
    title: trm('Actualización disponible'),
    message: trm('Hay una nueva versión de PlayCue Studio: {v}').replace('{v}', latest),
    detail:
      `${trm('Tu versión: {v}').replace('{v}', current)}\n\n` +
      (asset ? trm('Se descargará e instalará sobre la versión actual.') : trm('Se abrirá la página de descarga.')) +
      (notes ? `\n\n${notes}` : ''),
    buttons: [
      asset ? trm('Descargar e instalar') : trm('Abrir página de descarga'),
      trm('Más tarde'),
      trm('Omitir esta versión'),
    ],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  promptedThisSession.add(latest);
  const choice =
    TEST && process.env.PLAYCUE_UPDATE_AUTOACCEPT === '1'
      ? { response: 0 }
      : win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);
  writeLog('INFO', 'update', `Update ${latest} prompt answered: ${['accept', 'later', 'skip'][choice.response] ?? choice.response}`);
  if (choice.response === 2) {
    saveUpdateSettings({ ...getUpdateSettings(), skipVersion: latest });
    return;
  }
  if (choice.response !== 0) return;

  const pageUrl = typeof rel.html_url === 'string' && rel.html_url.startsWith(RELEASE_PAGE_PREFIX) ? rel.html_url : `${RELEASE_PAGE_PREFIX}releases/latest`;
  if (!asset) {
    await shell.openExternal(pageUrl);
    return;
  }

  const dest = path.join(app.getPath('temp'), 'PlayCue_Studio_Update', asset.name);
  const digest = typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') ? asset.digest.slice(7) : null;
  try {
    writeLog('INFO', 'update', `Downloading ${asset.name} (${asset.size} bytes)`);
    await downloadFile(asset.browser_download_url, dest, Number(asset.size) || 0, digest, (f) => {
      const w = deps?.getWindow();
      if (w && !w.isDestroyed()) w.setProgressBar(f);
    });
  } catch (e: any) {
    deps?.getWindow()?.setProgressBar(-1);
    writeLog('ERROR', 'update', `Download failed: ${e?.message || e}`);
    const r = await dialog.showMessageBox({
      type: 'error',
      title: trm('Actualización disponible'),
      message: trm('No se pudo descargar la actualización.'),
      detail: String(e?.message || e),
      buttons: [trm('Abrir página de descarga'), trm('Cerrar')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (r.response === 0) await shell.openExternal(pageUrl);
    return;
  }
  deps?.getWindow()?.setProgressBar(-1);

  const playing = deps?.isPlaying() ?? false;
  const done =
    TEST && process.env.PLAYCUE_UPDATE_AUTOACCEPT === '1'
      ? { response: 0 }
      : await dialog.showMessageBox({
          type: 'info',
          title: trm('Actualización disponible'),
          message: trm('Actualización descargada'),
          detail: playing
            ? trm('Hay un vídeo en reproducción. Si instalas ahora, la reproducción se detendrá.')
            : trm('PlayCue Studio se cerrará, se instalará la actualización y se volverá a abrir.'),
          buttons: [trm('Instalar ahora'), trm('Al cerrar la aplicación')],
          defaultId: playing ? 1 : 0,
          cancelId: 1,
          noLink: true,
        });
  if (done.response === 0) {
    launchInstallerAndQuit(dest);
  } else {
    pendingInstaller = dest;
    writeLog('INFO', 'update', 'Installer will run when the app quits');
  }
}

export async function checkForUpdates(manual: boolean): Promise<UpdateResult> {
  const current = app.getVersion();
  if (checking) return { status: 'busy', current };
  checking = true;
  try {
    const rel = await fetchJson(API_URL);
    const latest = String(rel.tag_name || '').replace(/^v/i, '');
    if (!latest || compareVersions(latest, current) <= 0) {
      writeLog('INFO', 'update', `Up to date (current ${current}, latest ${latest || '?'})`);
      return { status: 'uptodate', current, latest };
    }
    if (!manual) {
      const w = deps?.getWindow();
      if (getUpdateSettings().skipVersion === latest) return { status: 'skipped', current, latest };
      if (promptedThisSession.has(latest)) return { status: 'available', current, latest };
      if (deps?.isPlaying() || !w || w.isDestroyed() || !w.isVisible()) {
        // never interrupt a show: try again in a while
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void checkForUpdates(false), BUSY_RETRY_MS);
        return { status: 'deferred', current, latest };
      }
    }
    await promptAndUpdate(rel, latest, current);
    return { status: 'available', current, latest };
  } catch (e: any) {
    writeLog('WARN', 'update', `Check failed: ${e?.message || e}`);
    return { status: 'error', current, error: String(e?.message || e) };
  } finally {
    checking = false;
  }
}

export function startUpdateChecks(d: UpdateDeps): void {
  deps = d;
  const tick = () => {
    if (getUpdateSettings().auto) void checkForUpdates(false);
  };
  setTimeout(tick, FIRST_CHECK_DELAY_MS);
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  app.on('will-quit', () => {
    if (timer) clearInterval(timer);
    if (pendingInstaller && fs.existsSync(pendingInstaller)) {
      try {
        // no --force-run: the user closed the app on purpose, so don't reopen it
        spawn(pendingInstaller, ['--updated', '/S'], { detached: true, stdio: 'ignore' }).unref();
        writeLog('INFO', 'update', 'Installer launched on quit');
      } catch {}
    }
  });
}
