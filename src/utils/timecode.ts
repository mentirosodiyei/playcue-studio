import { VideoCue, CueColor } from '../types/cue';

export function formatTimecode(seconds: number, fps = 25, includeHours = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const frames = Math.min(
    Math.floor(fps) - 1,
    Math.max(0, Math.floor((seconds - totalSeconds) * fps))
  );

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const ff = String(frames).padStart(2, '0');

  if (includeHours || hours > 0) {
    return `${hh}:${mm}:${ss}.${ff}`;
  }
  return `${mm}:${ss}.${ff}`;
}

export function parseTimecodeInput(input: string, maxDuration: number): number | null {
  const clean = input.trim();
  if (!clean) return null;
  // Accept seconds directly like "12.5"
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const val = parseFloat(clean);
    return Math.max(0, Math.min(maxDuration, val));
  }
  // Accept MM:SS.ff or HH:MM:SS.ff
  const parts = clean.replace('.', ':').split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;

  let seconds = 0;
  if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // MM:SS:FF
    seconds = parts[0] * 60 + parts[1] + parts[2] / 25;
  } else if (parts.length === 4) {
    // HH:MM:SS:FF
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 25;
  } else {
    return null;
  }
  return Math.max(0, Math.min(maxDuration, seconds));
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export function toMediaUrl(filePath: string | undefined | null): string | null {
  if (!filePath) return null;
  if (filePath.startsWith('blob:') || filePath.startsWith('http') || filePath.startsWith('data:')) {
    return filePath;
  }
  return `media://local?path=${encodeURIComponent(filePath)}`;
}

export function getEffectiveCueDuration(cue: VideoCue | null | undefined): number {
  if (!cue) return 0;
  const inPt = Math.max(0, cue.inPoint || 0);
  const outPt = cue.outPoint > inPt ? cue.outPoint : cue.duration;
  const raw = Math.max(0, outPt - inPt);
  const rate = cue.playbackRate || 1;
  return raw / rate;
}

export function gainToDbString(volumePct: number, muted: boolean): string {
  if (muted || volumePct <= 0.1) return '-∞ dB';
  const ratio = volumePct / 100;
  const db = 20 * Math.log10(ratio);
  const sign = db > 0 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
}

export const CUE_COLOR_MAP: Record<CueColor, { bg: string; border: string; dot: string; label: string }> = {
  none: { bg: 'transparent', border: '#1e293b', dot: '#64748b', label: 'Sin color' },
  red: { bg: 'rgba(239, 68, 68, 0.12)', border: '#ef4444', dot: '#ef4444', label: 'Rojo' },
  amber: { bg: 'rgba(245, 158, 11, 0.12)', border: '#f59e0b', dot: '#f59e0b', label: 'Ámbar' },
  emerald: { bg: 'rgba(16, 185, 129, 0.12)', border: '#10b981', dot: '#10b981', label: 'Verde' },
  blue: { bg: 'rgba(59, 130, 246, 0.12)', border: '#3b82f6', dot: '#3b82f6', label: 'Azul' },
  purple: { bg: 'rgba(168, 85, 247, 0.12)', border: '#a855f7', dot: '#a855f7', label: 'Violeta' },
  cyan: { bg: 'rgba(6, 182, 212, 0.12)', border: '#06b6d4', dot: '#06b6d4', label: 'Cian' },
};

export const END_ACTION_LABELS: Record<VideoCue['endAction'], { short: string; full: string; color: string }> = {
  hold: {
    short: 'HOLD (Pausa Fin)',
    full: 'Congelar en último fotograma (Hold at End)',
    color: '#38bdf8',
  },
  black: {
    short: 'BLACK (Ir a Negro)',
    full: 'Fundir/Cortar a negro al terminar (Black at End)',
    color: '#94a3b8',
  },
  loop: {
    short: 'LOOP (Bucle)',
    full: 'Bucle continuo entre In y Out (Loop)',
    color: '#10b981',
  },
  next: {
    short: 'PLAY NEXT (Siguiente)',
    full: 'Lanzar siguiente Cue automáticamente (Auto-Follow)',
    color: '#f59e0b',
  },
  stop: {
    short: 'STOP (Limpiar)',
    full: 'Detener y descargar salida',
    color: '#ef4444',
  },
};
