import { tr } from '../i18n';
/**
 * Real stereo level metering for <video> elements using the Web Audio API.
 *
 * Each element is wired once: element -> MediaElementSource -> destination (audible path)
 *                                                           -> splitter -> analyser L / R
 * The element's own `volume` / `muted` are applied before the source node, so the measured
 * level is exactly what is being sent to the sound card.
 */

interface MeterTap {
  boost: GainNode;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  bufL: Float32Array;
  bufR: Float32Array;
}

let ctx: AudioContext | null = null;
/** Selected output device id ('' = system default). Applied to the context as soon as it exists. */
let desiredSinkId = '';

/** Route all app audio to the given output device ('' = system default). */
export async function setAudioOutput(deviceId: string): Promise<boolean> {
  desiredSinkId = deviceId || '';
  const c = ctx as any;
  if (!c || typeof c.setSinkId !== 'function') return true; // applied when the context is created
  try {
    await c.setSinkId(desiredSinkId);
    return true;
  } catch {
    return false;
  }
}

export interface AudioOutputInfo {
  id: string;
  label: string;
}

/** Lists the audio output devices (excluding the virtual "default"/"communications" aliases). */
export async function listAudioOutputs(): Promise<AudioOutputInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(
        (d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications'
      )
      .map((d, i) => ({ id: d.deviceId, label: d.label || tr("Salida de audio {n}", { n: i + 1 }) }));
  } catch {
    return [];
  }
}
const taps = new WeakMap<HTMLVideoElement, MeterTap>();
const failed = new WeakSet<HTMLVideoElement>();

function getContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor({ latencyHint: 'interactive' });
      if (desiredSinkId && typeof (ctx as any).setSinkId === 'function') {
        (ctx as any).setSinkId(desiredSinkId).catch(() => {});
      }
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Attach the meter to a video element (safe to call every frame; wires only once). */
export function attachMeter(video: HTMLVideoElement | null): void {
  if (!video || taps.has(video) || failed.has(video)) return;
  const c = getContext();
  if (!c) return;
  try {
    const source = c.createMediaElementSource(video);
    const splitter = c.createChannelSplitter(2);
    const analyserL = c.createAnalyser();
    const analyserR = c.createAnalyser();
    analyserL.fftSize = 4096;
    analyserR.fftSize = 4096;
    analyserL.smoothingTimeConstant = 0;
    analyserR.smoothingTimeConstant = 0;

    // Gain stage for levels above 0 dB: HTMLMediaElement.volume is capped at 1.0
    const boost = c.createGain();
    boost.gain.value = 1;

    source.connect(boost);
    boost.connect(c.destination);
    boost.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    taps.set(video, {
      boost,
      analyserL,
      analyserR,
      bufL: new Float32Array(analyserL.fftSize),
      bufR: new Float32Array(analyserR.fftSize),
    });
  } catch {
    failed.add(video);
  }
}

/** Extra gain (>= 1) applied after the element volume. No-op until the meter is attached. */
export function setBoost(video: HTMLVideoElement | null, gain: number): void {
  if (!video) return;
  const tap = taps.get(video);
  if (!tap) return;
  const g = Math.min(4, Math.max(1, Number.isFinite(gain) ? gain : 1));
  if (Math.abs(tap.boost.gain.value - g) > 0.001) tap.boost.gain.value = g;
}

function peakOf(analyser: AnalyserNode, buf: Float32Array): number {
  analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

/** Linear peak (0..1+) of the last analysis window; null when the element has no tap. */
export function readPeaks(
  video: HTMLVideoElement | null,
  mono = false
): { l: number; r: number } | null {
  if (!video) return null;
  const tap = taps.get(video);
  if (!tap) return null;
  const l = peakOf(tap.analyserL, tap.bufL);
  // Mono sources only fill channel 0 of the splitter: show them on both bars
  const r = mono ? l : peakOf(tap.analyserR, tap.bufR);
  return { l, r };
}

/**
 * Map a linear peak to the 0..100 bar height matching the dB scale printed on the meter:
 * +2 (top) / 0 / -6 / -18 / -48 (bottom), evenly spaced.
 */
export function peakToLevel(peak: number): number {
  if (peak <= 0.000001) return 0;
  const db = 20 * Math.log10(peak);
  const pts: [number, number][] = [
    [-48, 0],
    [-18, 25],
    [-6, 50],
    [0, 75],
    [2, 100],
  ];
  if (db <= pts[0][0]) return 0;
  if (db >= pts[pts.length - 1][0]) return 100;
  for (let i = 1; i < pts.length; i++) {
    if (db <= pts[i][0]) {
      const [d0, l0] = pts[i - 1];
      const [d1, l1] = pts[i];
      return l0 + ((db - d0) / (d1 - d0)) * (l1 - l0);
    }
  }
  return 0;
}
