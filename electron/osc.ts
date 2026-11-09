import dgram from 'dgram';
import http from 'http';
import os from 'os';

export interface RemoteCommandPayload {
  action: string;
  value?: number | string | boolean;
  source: 'OSC' | 'HTTP';
  rawAddress: string;
  timestamp: string;
}

export interface TelemetryCueItem {
  index: number;
  id: string;
  cueNumber: string;
  name: string;
  duration: number;
  transitionType: string;
  transitionDuration: number;
  endAction: string;
}

export interface LiveShowTelemetry {
  showName: string;
  isPlaying: boolean;
  isBlackout: boolean;
  isFrozen: boolean;
  isTestPattern: boolean;
  showOSD: boolean;
  programCueId: string | null;
  programIndex: number;
  programCueName: string;
  programCueNumber: string;
  programEndAction: string;
  previewCueId: string | null;
  previewIndex: number;
  previewCueName: string;
  previewCueNumber: string;
  transitionType: string;
  transitionDuration: number;
  mosaicMode: string;
  elapsed: number;
  remaining: number;
  duration: number;
  totalCues: number;
  masterVolume: number;
  isMuted: boolean;
  outputOpen: boolean;
  cues: TelemetryCueItem[];
}

function readOscString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) {
    end++;
  }
  const value = buf.toString('utf8', offset, end);
  const nextOffset = Math.ceil((end + 1) / 4) * 4;
  return { value, nextOffset };
}

export function parseOscPacket(buf: Buffer): { address: string; args: (number | string)[] } | null {
  try {
    if (buf.length < 4 || buf[0] !== 0x2f) {
      return null;
    }
    const addrRes = readOscString(buf, 0);
    const address = addrRes.value;
    let offset = addrRes.nextOffset;
    const args: (number | string)[] = [];

    if (offset < buf.length && buf[offset] === 0x2c) {
      const typeRes = readOscString(buf, offset);
      const types = typeRes.value.slice(1);
      offset = typeRes.nextOffset;

      for (const t of types) {
        if (offset > buf.length) break;
        if (t === 'i') {
          if (offset + 4 <= buf.length) {
            args.push(buf.readInt32BE(offset));
            offset += 4;
          }
        } else if (t === 'f') {
          if (offset + 4 <= buf.length) {
            args.push(buf.readFloatBE(offset));
            offset += 4;
          }
        } else if (t === 's') {
          const strRes = readOscString(buf, offset);
          args.push(strRes.value);
          offset = strRes.nextOffset;
        } else if (t === 'T') {
          args.push(1);
        } else if (t === 'F') {
          args.push(0);
        }
      }
    }
    return { address, args };
  } catch {
    return null;
  }
}

export class RemoteControlServer {
  private udpSocket: dgram.Socket | null = null;
  private httpServer: http.Server | null = null;
  private oscPort = 51000;
  private httpPort = 51080;
  private onCommand: (cmd: RemoteCommandPayload) => void;
  private telemetry: LiveShowTelemetry = {
    showName: 'Untitled Show',
    isPlaying: false,
    isBlackout: false,
    isFrozen: false,
    isTestPattern: false,
    showOSD: false,
    programCueId: null,
    programIndex: 0,
    programCueName: '-',
    programCueNumber: '-',
    programEndAction: 'hold',
    previewCueId: null,
    previewIndex: 0,
    previewCueName: '-',
    previewCueNumber: '-',
    transitionType: 'dissolve',
    transitionDuration: 1.0,
    mosaicMode: 'single',
    elapsed: 0,
    remaining: 0,
    duration: 0,
    totalCues: 0,
    masterVolume: 100,
    isMuted: false,
    outputOpen: false,
    cues: [],
  };

  constructor(onCommand: (cmd: RemoteCommandPayload) => void) {
    this.onCommand = onCommand;
  }

  public updateTelemetry(partial: Partial<LiveShowTelemetry>) {
    this.telemetry = { ...this.telemetry, ...partial };
  }

  public getServerInfo() {
    const interfaces = os.networkInterfaces();
    const ips: string[] = ['127.0.0.1'];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }
    return {
      oscPort: this.oscPort,
      httpPort: this.httpPort,
      ips,
    };
  }

  public start() {
    this.startOscServer();
    this.startHttpServer();
  }

  public stop() {
    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch {}
      this.udpSocket = null;
    }
    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch {}
      this.httpServer = null;
    }
  }

  private mapAddressToCommand(
    address: string,
    arg: number | string | undefined,
    source: 'OSC' | 'HTTP'
  ): RemoteCommandPayload | null {
    const clean = address.toLowerCase().replace(/\/+$/, '');
    const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });

    const make = (action: string, value?: number | string | boolean): RemoteCommandPayload => ({
      action,
      value,
      source,
      rawAddress: address,
      timestamp,
    });

    switch (clean) {
      case '/mitti/play':
      case '/pbp/play':
      case '/api/play':
      case '/play':
        return make('play');
      case '/mitti/pause':
      case '/pbp/pause':
      case '/api/pause':
      case '/pause':
        return make('pause');
      case '/mitti/toggleplay':
      case '/api/toggle-play':
      case '/toggleplay':
        return make('togglePlay');
      case '/pbp/take':
      case '/mitti/take':
      case '/api/take':
      case '/take':
        return make('take');
      case '/mitti/cut':
      case '/pbp/cut':
      case '/api/cut':
      case '/cut':
        return make('cut');
      case '/mitti/panic':
      case '/api/panic':
      case '/panic':
        return make('panic');
      case '/mitti/blackout':
      case '/pbp/ftb':
      case '/api/blackout':
      case '/blackout':
        return make('blackout');
      case '/mitti/freeze':
      case '/api/freeze':
      case '/freeze':
        return make('freeze');
      case '/api/test-pattern':
      case '/testpattern':
        return make('testPattern');
      case '/api/osd':
      case '/osd':
        return make('toggleOSD');
      case '/mitti/goto10':
      case '/pbp/goto10':
      case '/api/goto-end/10':
      case '/goto10':
        return make('gotoEnd', 10);
      case '/mitti/goto20':
      case '/pbp/goto20':
      case '/api/goto-end/20':
      case '/goto20':
        return make('gotoEnd', 20);
      case '/mitti/goto30':
      case '/pbp/goto30':
      case '/api/goto-end/30':
      case '/goto30':
        return make('gotoEnd', 30);
      case '/api/goto-end':
        return make('gotoEnd', Number(arg ?? 10));
      case '/mitti/rewind':
      case '/api/restart':
      case '/restart':
        return make('restart');
      case '/mitti/looptoggle':
      case '/api/loop':
      case '/loop':
        return make('toggleLoop');
      case '/mitti/selectnextcue':
      case '/api/next-cue':
      case '/next':
        return make('nextCue');
      case '/mitti/selectprevcue':
      case '/api/prev-cue':
      case '/prev':
        return make('prevCue');
      case '/mitti/jumptocue':
      case '/api/load-cue':
      case '/cue/load':
        return make('loadCueIndex', Number(arg ?? 1));
      case '/mitti/playcue':
      case '/api/take-cue':
      case '/cue/take':
        return make('takeCueIndex', Number(arg ?? 1));
      case '/api/cut-cue':
      case '/cue/cut':
        return make('cutCueIndex', Number(arg ?? 1));
      case '/api/transition-type':
      case '/transition/type':
        return make('setTransitionType', String(arg ?? 'dissolve'));
      case '/api/transition-duration':
      case '/transition/duration':
        return make('setTransitionDuration', Number(arg ?? 1.0));
      case '/api/end-action':
      case '/cue/end-action':
        return make('setEndAction', String(arg ?? 'hold'));
      case '/api/mosaic-mode':
      case '/mosaic/mode':
        return make('setMosaicMode', String(arg ?? 'single'));
      case '/mitti/audiovolume':
      case '/api/volume':
      case '/volume':
        return make('setVolume', Number(arg ?? 100));
      case '/api/volume-delta':
      case '/volume/delta':
        return make('adjustVolume', Number(arg ?? 0));
      case '/api/mute':
      case '/mute':
        return make('toggleMute');
      case '/api/output-toggle':
      case '/output/toggle':
        return make('toggleOutput');
      default: {
        const takeMatch = clean.match(/\/cue\/(\d+)\/take/);
        if (takeMatch) {
          return make('takeCueIndex', parseInt(takeMatch[1], 10));
        }
        const cutMatch = clean.match(/\/cue\/(\d+)\/cut/);
        if (cutMatch) {
          return make('cutCueIndex', parseInt(cutMatch[1], 10));
        }
        const loadMatch = clean.match(/\/cue\/(\d+)\/load/);
        if (loadMatch) {
          return make('loadCueIndex', parseInt(loadMatch[1], 10));
        }
        return null;
      }
    }
  }

  private startOscServer() {
    try {
      const socket = dgram.createSocket('udp4');
      socket.on('error', () => {});
      socket.on('message', (msg) => {
        const parsed = parseOscPacket(msg);
        if (parsed) {
          const cmd = this.mapAddressToCommand(parsed.address, parsed.args[0], 'OSC');
          if (cmd) {
            this.onCommand(cmd);
          }
        }
      });
      socket.bind(this.oscPort, '0.0.0.0');
      this.udpSocket = socket;
    } catch {}
  }

  private startHttpServer() {
    try {
      const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const urlObj = new URL(req.url || '/', `http://127.0.0.1:${this.httpPort}`);
        const pathname = urlObj.pathname;

        if (pathname === '/api/status' || pathname === '/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, telemetry: this.telemetry }));
          return;
        }

        const valParam =
          urlObj.searchParams.get('value') ??
          urlObj.searchParams.get('cue') ??
          urlObj.searchParams.get('mode') ??
          urlObj.searchParams.get('type') ??
          undefined;
        const cmd = this.mapAddressToCommand(pathname, valParam, 'HTTP');
        if (cmd) {
          this.onCommand(cmd);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, executed: cmd, telemetry: this.telemetry }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unknown endpoint', path: pathname }));
      });

      server.on('error', () => {});
      server.listen(this.httpPort, '0.0.0.0');
      this.httpServer = server;
    } catch {}
  }
}
