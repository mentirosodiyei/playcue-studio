import React from 'react';
import { AspectRatioMode, ScaleMode } from '../types/cue';

export interface AspectRatioOption {
  id: AspectRatioMode;
  label: string;
  shortLabel: string;
  ratio: number | null;
}

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  { id: 'native', label: 'Original del Vídeo (Nativo)', shortLabel: 'NATIVO', ratio: null },
  { id: 'output', label: 'Adaptar a Pantalla de Salida', shortLabel: 'SALIDA', ratio: null },
  { id: '16:9', label: '16:9 Widescreen (HD / QHD / 4K)', shortLabel: '16:9', ratio: 16 / 9 },
  { id: '16:10', label: '16:10 Formato Proyector WUXGA', shortLabel: '16:10', ratio: 16 / 10 },
  { id: '4:3', label: '4:3 Estándar Clásico', shortLabel: '4:3', ratio: 4 / 3 },
  { id: '21:9', label: '21:9 Cinema Ultrawide', shortLabel: '21:9', ratio: 21 / 9 },
  { id: '32:9', label: '32:9 Super Ultrawide / Mosaico 2×1', shortLabel: '32:9', ratio: 32 / 9 },
  { id: '9:16', label: '9:16 Vertical (Reels / Totem LED)', shortLabel: '9:16', ratio: 9 / 16 },
  { id: '1:1', label: '1:1 Cuadrado', shortLabel: '1:1', ratio: 1 },
];

export interface GeometryParams {
  scaleMode?: ScaleMode;
  aspectRatio?: AspectRatioMode;
  zoom?: number;
  scaleX?: number;
  scaleY?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
}

export function getForegroundVideoStyle(params: GeometryParams): React.CSSProperties {
  const {
    scaleMode = 'fit',
    aspectRatio = 'native',
    zoom = 100,
    scaleX = 100,
    scaleY = 100,
    offsetX = 0,
    offsetY = 0,
    rotation = 0,
    flipH = false,
    flipV = false,
    canvasWidth = 2560,
    canvasHeight = 1440,
  } = params;

  const canvasAR = Math.max(0.1, canvasWidth) / Math.max(0.1, canvasHeight);
  const arOpt = ASPECT_RATIO_OPTIONS.find((o) => o.id === aspectRatio);
  const targetAR = arOpt?.ratio ?? null;

  let widthPct = 100;
  let heightPct = 100;
  let objectFit: React.CSSProperties['objectFit'] =
    scaleMode === 'fill' ? 'cover' : scaleMode === 'stretch' ? 'fill' : 'contain';

  if (aspectRatio === 'output') {
    objectFit = 'fill';
  } else if (targetAR !== null) {
    // Force the video element into a box of targetAR, then stretch the video to fill that box
    objectFit = 'fill';
    if (scaleMode === 'fill') {
      if (targetAR > canvasAR) {
        heightPct = 100;
        widthPct = (targetAR / canvasAR) * 100;
      } else {
        widthPct = 100;
        heightPct = (canvasAR / targetAR) * 100;
      }
    } else {
      // 'fit' or 'stretch' with explicit aspect ratio
      if (targetAR > canvasAR) {
        widthPct = 100;
        heightPct = (canvasAR / targetAR) * 100;
      } else {
        heightPct = 100;
        widthPct = (targetAR / canvasAR) * 100;
      }
    }
  }

  const z = (zoom ?? 100) / 100;
  const sx = z * ((scaleX ?? 100) / 100) * (flipH ? -1 : 1);
  const sy = z * ((scaleY ?? 100) / 100) * (flipV ? -1 : 1);

  const transforms: string[] = [];
  if (offsetX || offsetY) {
    transforms.push(`translate(${offsetX}%, ${offsetY}%)`);
  }
  if (rotation) {
    transforms.push(`rotate(${rotation}deg)`);
  }
  if (sx !== 1 || sy !== 1) {
    transforms.push(`scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`);
  }

  return {
    position: 'absolute',
    left: `${(100 - widthPct) / 2}%`,
    top: `${(100 - heightPct) / 2}%`,
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    objectFit,
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
    transformOrigin: 'center center',
    backgroundColor: 'transparent',
    pointerEvents: 'none',
  };
}

export interface BgBlurParams {
  bgBlurAmount?: number; // 0..100 (default 90)
  bgBlurBrightness?: number; // 20..100 (default 75)
  bgBlurZoom?: number; // 100..200 (default 125)
  rotation?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
}

export function getBackgroundBlurVideoStyle(params: BgBlurParams): React.CSSProperties {
  const blurPct = params.bgBlurAmount ?? 90;
  const brightnessPct = params.bgBlurBrightness ?? 75;
  const bgZoomPct = params.bgBlurZoom ?? 125;

  // Map 90% blur to ~54px Gaussian blur (and scale up slightly so blurred edges never show black borders)
  const blurPx = Math.max(0, Math.round((blurPct / 100) * 60));
  const scaleVal = Math.max(1.05, bgZoomPct / 100);
  const sx = scaleVal * (params.flipH ? -1 : 1);
  const sy = scaleVal * (params.flipV ? -1 : 1);

  const transforms: string[] = [];
  if (params.rotation) {
    transforms.push(`rotate(${params.rotation}deg)`);
  }
  transforms.push(`scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`);

  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: transforms.join(' '),
    transformOrigin: 'center center',
    filter: `blur(${blurPx}px) brightness(${brightnessPct}%) saturate(120%)`,
    backgroundColor: '#000000',
    pointerEvents: 'none',
  };
}
