import React from 'react';
import { AspectRatioMode, ScaleMode } from '../types/cue';

import { tr } from '../i18n';
export interface AspectRatioOption {
  id: AspectRatioMode;
  label: string;
  shortLabel: string;
  ratio: number | null;
}

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  { id: 'native', label: tr("Original del Vídeo (Nativo)"), shortLabel: tr("Nativo"), ratio: null },
  { id: 'output', label: tr("Ajustar a Lienzo de Salida (100%)"), shortLabel: tr("Salida"), ratio: null },
  { id: '16:9', label: tr("16:9 Widescreen"), shortLabel: '16:9', ratio: 16 / 9 },
  { id: '16:10', label: tr("16:10 WUXGA"), shortLabel: '16:10', ratio: 16 / 10 },
  { id: '4:3', label: tr("4:3 Clásico"), shortLabel: '4:3', ratio: 4 / 3 },
  { id: '21:9', label: tr("21:9 Ultrawide"), shortLabel: '21:9', ratio: 21 / 9 },
  { id: '32:9', label: tr("32:9 Dual Mosaico 2×1"), shortLabel: '32:9', ratio: 32 / 9 },
  { id: '9:16', label: tr("9:16 Vertical"), shortLabel: '9:16', ratio: 9 / 16 },
  { id: '1:1', label: tr("1:1 Cuadrado"), shortLabel: '1:1', ratio: 1 },
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
  videoWidth?: number;
  videoHeight?: number;
}

export interface ComputedVideoBox {
  baseWidthPct: number;
  baseHeightPct: number;
  widthPct: number;
  heightPct: number;
  leftPct: number;
  topPct: number;
  pixelWidth: number;
  pixelHeight: number;
  pixelX: number;
  pixelY: number;
}

export function computeVideoBox(params: GeometryParams): ComputedVideoBox {
  const {
    scaleMode = 'fit',
    aspectRatio = 'native',
    zoom = 100,
    scaleX = 100,
    scaleY = 100,
    offsetX = 0,
    offsetY = 0,
    canvasWidth = 2560,
    canvasHeight = 1440,
    videoWidth = 1920,
    videoHeight = 1080,
  } = params;

  const cw = Math.max(1, canvasWidth);
  const ch = Math.max(1, canvasHeight);
  const vw = Math.max(1, videoWidth);
  const vh = Math.max(1, videoHeight);

  const canvasAR = cw / ch;
  const nativeAR = vw / vh;

  const arOpt = ASPECT_RATIO_OPTIONS.find((o) => o.id === aspectRatio);
  const targetAR =
    aspectRatio === 'output'
      ? canvasAR
      : aspectRatio === 'native'
      ? nativeAR
      : arOpt?.ratio ?? nativeAR;

  let baseWidthPct = 100;
  let baseHeightPct = 100;

  if (scaleMode === 'stretch' || aspectRatio === 'output') {
    baseWidthPct = 100;
    baseHeightPct = 100;
  } else if (scaleMode === 'fill') {
    if (targetAR > canvasAR) {
      baseHeightPct = 100;
      baseWidthPct = (targetAR / canvasAR) * 100;
    } else {
      baseWidthPct = 100;
      baseHeightPct = (canvasAR / targetAR) * 100;
    }
  } else {
    // 'fit' mode
    if (Math.abs(targetAR - canvasAR) < 0.01) {
      baseWidthPct = 100;
      baseHeightPct = 100;
    } else if (targetAR > canvasAR) {
      baseWidthPct = 100;
      baseHeightPct = (canvasAR / targetAR) * 100;
    } else {
      baseHeightPct = 100;
      baseWidthPct = (targetAR / canvasAR) * 100;
    }
  }

  const z = (zoom ?? 100) / 100;
  const sx = (scaleX ?? 100) / 100;
  const sy = (scaleY ?? 100) / 100;

  const widthPct = Math.max(5, baseWidthPct * z * sx);
  const heightPct = Math.max(5, baseHeightPct * z * sy);

  const centerX = 50 + (offsetX ?? 0);
  const centerY = 50 + (offsetY ?? 0);

  const leftPct = centerX - widthPct / 2;
  const topPct = centerY - heightPct / 2;

  const pixelWidth = Math.round((widthPct / 100) * cw);
  const pixelHeight = Math.round((heightPct / 100) * ch);
  const pixelX = Math.round((leftPct / 100) * cw);
  const pixelY = Math.round((topPct / 100) * ch);

  return {
    baseWidthPct,
    baseHeightPct,
    widthPct,
    heightPct,
    leftPct,
    topPct,
    pixelWidth,
    pixelHeight,
    pixelX,
    pixelY,
  };
}

export function getForegroundVideoStyle(params: GeometryParams): React.CSSProperties {
  const box = computeVideoBox(params);
  const { rotation = 0, flipH = false, flipV = false } = params;

  const transforms: string[] = [];
  if (rotation) {
    transforms.push(`rotate(${rotation}deg)`);
  }
  if (flipH || flipV) {
    transforms.push(`scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`);
  }

  return {
    position: 'absolute',
    left: `${box.leftPct.toFixed(4)}%`,
    top: `${box.topPct.toFixed(4)}%`,
    width: `${box.widthPct.toFixed(4)}%`,
    height: `${box.heightPct.toFixed(4)}%`,
    objectFit: 'fill',
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
    transformOrigin: 'center center',
    backgroundColor: 'transparent',
    pointerEvents: 'none',
    maxWidth: 'none',
    maxHeight: 'none',
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
    maxWidth: 'none',
    maxHeight: 'none',
  };
}
