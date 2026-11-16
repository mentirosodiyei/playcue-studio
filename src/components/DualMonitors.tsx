import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Scissors,
  Volume2,
  VolumeX,
  Snowflake,
  EyeOff,
  Tv,
  ArrowRightLeft,
  Zap,
  Repeat,
  SkipForward,
  StepBack,
  StepForward,
} from 'lucide-react';
import {
  VideoCue,
  TransitionType,
  EndAction,
  DeckSyncPayload,
  MosaicConfig,
} from '../types/cue';
import {
  formatTimecode,
  END_ACTION_LABELS,
  toMediaUrl,
  gainToDbString,
} from '../utils/timecode';
import {
  computeVideoBox,
  getForegroundVideoStyle,
  getBackgroundBlurVideoStyle,
} from '../utils/videoGeometry';
import { TestPatternCanvas } from './TestPatternCanvas';

import { tr } from '../i18n';
interface DualMonitorsProps {
  previewCue: VideoCue | null;
  programCue: VideoCue | null;
  previewVideoRef: React.RefObject<HTMLVideoElement>;
  pgmVideoARef: React.RefObject<HTMLVideoElement>;
  pgmVideoBRef: React.RefObject<HTMLVideoElement>;
  deckA: DeckSyncPayload;
  deckB: DeckSyncPayload;
  activeDeck: 'A' | 'B';
  transitionProgress: number;
  // Preview state
  prvPlaying: boolean;
  prvTime: number;
  prvAudition: boolean;
  onTogglePrvPlay: () => void;
  onSeekPrv: (time: number) => void;
  onSetPrvIn: () => void;
  onSetPrvOut: () => void;
  onResetPrvInOut: () => void;
  onStepPrvFrame: (dir: -1 | 1) => void;
  onTogglePrvAudition: () => void;
  onPrvGotoEnd: (secBeforeEnd: number) => void;
  // Center Bridge state
  transitionType: TransitionType;
  transitionDuration: number;
  onChangeTransitionType: (t: TransitionType) => void;
  onChangeTransitionDuration: (d: number) => void;
  onTake: () => void;
  onCutImmediate: () => void;
  isBlackout: boolean;
  onToggleBlackout: () => void;
  isFrozen: boolean;
  onToggleFreeze: () => void;
  isTestPattern: boolean;
  onToggleTestPattern: () => void;
  // Program state
  pgmPlaying: boolean;
  pgmTime: number;
  pgmRemaining: number;
  onTogglePgmPlay: () => void;
  onRestartPgm: () => void;
  onSeekPgm: (time: number) => void;
  onPgmGotoEnd: (secBeforeEnd: number) => void;
  onChangePgmEndAction: (action: EndAction) => void;
  // Cue geometry live update
  onUpdateCue?: (id: string, patch: Partial<VideoCue>) => void;
  // Audio Master
  masterVolume: number;
  isMasterMuted: boolean;
  onChangeMasterVolume: (vol: number) => void;
  onToggleMasterMute: () => void;
  vuLevels: { left: number; right: number; peakL: number; peakR: number };
  mosaicConfig?: MosaicConfig;
  totalCanvasWidth?: number;
  totalCanvasHeight?: number;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export const DualMonitors: React.FC<DualMonitorsProps> = ({
  previewCue,
  programCue,
  previewVideoRef,
  pgmVideoARef,
  pgmVideoBRef,
  deckA,
  deckB,
  activeDeck,
  transitionProgress,
  prvPlaying,
  prvTime,
  prvAudition,
  onTogglePrvPlay,
  onSeekPrv,
  onSetPrvIn,
  onSetPrvOut,
  onResetPrvInOut,
  onStepPrvFrame,
  onTogglePrvAudition,
  onPrvGotoEnd,
  transitionType,
  transitionDuration,
  onChangeTransitionType,
  onChangeTransitionDuration,
  onTake,
  onCutImmediate,
  isBlackout,
  onToggleBlackout,
  isFrozen,
  onToggleFreeze,
  isTestPattern,
  onToggleTestPattern,
  pgmPlaying,
  pgmTime,
  pgmRemaining,
  onTogglePgmPlay,
  onRestartPgm,
  onSeekPgm,
  onPgmGotoEnd,
  onChangePgmEndAction,
  onUpdateCue,
  masterVolume,
  isMasterMuted,
  onChangeMasterVolume,
  onToggleMasterMute,
  vuLevels,
  mosaicConfig,
  totalCanvasWidth = 2560,
  totalCanvasHeight = 1440,
}) => {
  const prvBgVideoRef = useRef<HTMLVideoElement | null>(null);
  const pgmBgVideoARef = useRef<HTMLVideoElement | null>(null);
  const pgmBgVideoBRef = useRef<HTMLVideoElement | null>(null);

  const prvViewportRef = useRef<HTMLDivElement | null>(null);
  const pgmViewportRef = useRef<HTMLDivElement | null>(null);
  const prvStageRef = useRef<HTMLDivElement | null>(null);
  const pgmStageRef = useRef<HTMLDivElement | null>(null);

  const [prvStageSize, setPrvStageSize] = useState<{ w: number; h: number }>({ w: 480, h: 270 });
  const [pgmStageSize, setPgmStageSize] = useState<{ w: number; h: number }>({ w: 480, h: 270 });
  const [activeGizmoTarget, setActiveGizmoTarget] = useState<'prv' | 'pgm' | null>(null);

  // Measure Preview & Program outer chambers and fit the exact output/mosaic aspect ratio inside
  useEffect(() => {
    const computeFit = (el: HTMLDivElement | null, setter: (sz: { w: number; h: number }) => void) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const availW = Math.max(60, rect.width - 12);
      const availH = Math.max(40, rect.height - 12);
      const ar = Math.max(0.1, totalCanvasWidth) / Math.max(0.1, totalCanvasHeight);
      let w = availW;
      let h = availW / ar;
      if (h > availH) {
        h = availH;
        w = availH * ar;
      }
      setter({ w: Math.round(w), h: Math.round(h) });
    };

    const updateAll = () => {
      computeFit(prvViewportRef.current, setPrvStageSize);
      computeFit(pgmViewportRef.current, setPgmStageSize);
    };

    updateAll();
    const ro = new ResizeObserver(updateAll);
    if (prvViewportRef.current) ro.observe(prvViewportRef.current);
    if (pgmViewportRef.current) ro.observe(pgmViewportRef.current);
    window.addEventListener('resize', updateAll);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateAll);
    };
  }, [totalCanvasWidth, totalCanvasHeight]);

  // Sync Preview Background Blur video with Preview Foreground video
  useEffect(() => {
    const bgV = prvBgVideoRef.current;
    if (!bgV) return;
    if (!previewCue || !previewCue.bgBlurEnabled) {
      if (bgV.getAttribute('src')) {
        bgV.pause();
        bgV.removeAttribute('src');
        bgV.load();
      }
      return;
    }
    const url = toMediaUrl(previewCue.proxyPath || previewCue.filePath);
    if (url && bgV.getAttribute('data-cue-id') !== previewCue.id) {
      bgV.setAttribute('data-cue-id', previewCue.id);
      bgV.src = url;
      if (prvTime > 0.03) {
        try {
          bgV.currentTime = prvTime;
        } catch {}
      }
    }
    const targetRate = previewCue.playbackRate || 1;
    if (Math.abs(bgV.playbackRate - targetRate) > 0.005) {
      bgV.playbackRate = targetRate;
    }
    if (!bgV.seeking && Math.abs((bgV.currentTime || 0) - prvTime) > 0.65) {
      try {
        bgV.currentTime = prvTime;
      } catch {}
    }
    if (prvPlaying && bgV.paused) {
      bgV.play().catch(() => {});
    } else if (!prvPlaying && !bgV.paused) {
      bgV.pause();
    }
  }, [previewCue, prvTime, prvPlaying]);

  // Sync Program Deck A & Deck B Background Blur videos with Foreground videos
  useEffect(() => {
    const syncBg = (bgV: HTMLVideoElement | null, deck: DeckSyncPayload) => {
      if (!bgV) return;
      const shouldShow = !!(deck.bgBlurEnabled && deck.mediaUrl);
      if (!shouldShow) {
        if (bgV.getAttribute('data-url')) {
          bgV.pause();
          bgV.removeAttribute('data-url');
          bgV.removeAttribute('src');
          bgV.load();
        }
        return;
      }
      if (bgV.getAttribute('data-url') !== deck.mediaUrl && deck.mediaUrl) {
        bgV.setAttribute('data-url', deck.mediaUrl);
        bgV.src = deck.mediaUrl;
        if ((deck.currentTime || 0) > 0.03) {
          try {
            bgV.currentTime = deck.currentTime || 0;
          } catch {}
        }
      }
      const targetRate = deck.playbackRate || 1;
      if (Math.abs(bgV.playbackRate - targetRate) > 0.005) {
        bgV.playbackRate = targetRate;
      }
      if (isFrozen) {
        if (!bgV.paused) bgV.pause();
        return;
      }
      if (!bgV.seeking && Math.abs((bgV.currentTime || 0) - (deck.currentTime || 0)) > 0.65) {
        try {
          bgV.currentTime = deck.currentTime || 0;
        } catch {}
      }
      if (deck.isPlaying && bgV.paused) {
        bgV.play().catch(() => {});
      } else if (!deck.isPlaying && !bgV.paused) {
        bgV.pause();
      }
    };

    syncBg(pgmBgVideoARef.current, deckA);
    syncBg(pgmBgVideoBRef.current, deckB);
  }, [deckA, deckB, isFrozen]);

  const getDeckWrapperStyle = (deck: DeckSyncPayload, deckKey: 'A' | 'B'): React.CSSProperties => {
    let clipPath = 'none';
    if (transitionType === 'wipe' && transitionProgress < 1) {
      if (activeDeck === deckKey) {
        const pct = Math.round(transitionProgress * 100);
        clipPath = `inset(0 ${100 - pct}% 0 0)`;
      }
    }

    return {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      opacity: deck.mediaUrl ? Math.max(0, Math.min(1, deck.opacity)) : 0,
      clipPath,
      zIndex: activeDeck === deckKey ? 2 : 1,
      backgroundColor: 'transparent',
    };
  };

  // Interactive Mouse Move & 4-Corner Resize Handler for Preview & Program Canvases
  const startInteractiveTransform = (
    e: React.MouseEvent,
    cue: VideoCue | null,
    stageEl: HTMLDivElement | null,
    mode: DragMode,
    targetKey: 'prv' | 'pgm'
  ) => {
    if (!cue || !stageEl || !onUpdateCue) return;
    e.preventDefault();
    e.stopPropagation();

    setActiveGizmoTarget(targetKey);
    const stageRect = stageEl.getBoundingClientRect();
    if (stageRect.width < 10 || stageRect.height < 10) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;

    const box = computeVideoBox({
      scaleMode: cue.scaleMode,
      aspectRatio: cue.aspectRatio,
      zoom: cue.zoom ?? 100,
      scaleX: cue.scaleX ?? 100,
      scaleY: cue.scaleY ?? 100,
      offsetX: cue.offsetX ?? 0,
      offsetY: cue.offsetY ?? 0,
      canvasWidth: totalCanvasWidth,
      canvasHeight: totalCanvasHeight,
      videoWidth: cue.width || 1920,
      videoHeight: cue.height || 1080,
    });

    const startOffsetX = cue.offsetX ?? 0;
    const startOffsetY = cue.offsetY ?? 0;
    const startLeft = box.leftPct;
    const startRight = box.leftPct + box.widthPct;
    const startTop = box.topPct;
    const startBottom = box.topPct + box.heightPct;
    const effBaseW = Math.max(1, box.baseWidthPct * ((cue.zoom ?? 100) / 100));
    const effBaseH = Math.max(1, box.baseHeightPct * ((cue.zoom ?? 100) / 100));

    const onMouseMove = (moveEv: MouseEvent) => {
      const dxPct = ((moveEv.clientX - startClientX) / stageRect.width) * 100;
      const dyPct = ((moveEv.clientY - startClientY) / stageRect.height) * 100;

      if (mode === 'move') {
        let nextOx = Math.round((startOffsetX + dxPct) * 10) / 10;
        let nextOy = Math.round((startOffsetY + dyPct) * 10) / 10;
        // Magnetic snap to center (0, 0) when close
        if (Math.abs(nextOx) < 1.0) nextOx = 0;
        if (Math.abs(nextOy) < 1.0) nextOy = 0;
        onUpdateCue(cue.id, {
          offsetX: Math.max(-100, Math.min(100, nextOx)),
          offsetY: Math.max(-100, Math.min(100, nextOy)),
        });
        return;
      }

      // 4-Corner independent horizontal & vertical resizing / deformation
      let newLeft = startLeft;
      let newRight = startRight;
      let newTop = startTop;
      let newBottom = startBottom;

      if (mode === 'nw') {
        newLeft = Math.min(startRight - 5, startLeft + dxPct);
        newTop = Math.min(startBottom - 5, startTop + dyPct);
      } else if (mode === 'ne') {
        newRight = Math.max(startLeft + 5, startRight + dxPct);
        newTop = Math.min(startBottom - 5, startTop + dyPct);
      } else if (mode === 'sw') {
        newLeft = Math.min(startRight - 5, startLeft + dxPct);
        newBottom = Math.max(startTop + 5, startBottom + dyPct);
      } else if (mode === 'se') {
        newRight = Math.max(startLeft + 5, startRight + dxPct);
        newBottom = Math.max(startTop + 5, startBottom + dyPct);
      }

      const newW = Math.max(5, newRight - newLeft);
      const newH = Math.max(5, newBottom - newTop);
      const newCenterX = (newLeft + newRight) / 2;
      const newCenterY = (newTop + newBottom) / 2;

      const nextScaleX = Math.max(10, Math.min(400, Math.round((newW / effBaseW) * 1000) / 10));
      const nextScaleY = Math.max(10, Math.min(400, Math.round((newH / effBaseH) * 1000) / 10));
      const nextOffsetX = Math.max(-100, Math.min(100, Math.round((newCenterX - 50) * 10) / 10));
      const nextOffsetY = Math.max(-100, Math.min(100, Math.round((newCenterY - 50) * 10) / 10));

      onUpdateCue(cue.id, {
        scaleX: nextScaleX,
        scaleY: nextScaleY,
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const renderInteractiveGizmo = (
    cue: VideoCue | null,
    stageRef: React.RefObject<HTMLDivElement>,
    targetKey: 'prv' | 'pgm'
  ) => {
    if (!cue || !onUpdateCue) return null;
    const box = computeVideoBox({
      scaleMode: cue.scaleMode,
      aspectRatio: cue.aspectRatio,
      zoom: cue.zoom ?? 100,
      scaleX: cue.scaleX ?? 100,
      scaleY: cue.scaleY ?? 100,
      offsetX: cue.offsetX ?? 0,
      offsetY: cue.offsetY ?? 0,
      canvasWidth: totalCanvasWidth,
      canvasHeight: totalCanvasHeight,
      videoWidth: cue.width || 1920,
      videoHeight: cue.height || 1080,
    });

    const isFocused = activeGizmoTarget === targetKey;

    return (
      <div
        className={`video-transform-gizmo ${isFocused ? 'focused' : ''}`}
        style={{
          left: `${box.leftPct}%`,
          top: `${box.topPct}%`,
          width: `${box.widthPct}%`,
          height: `${box.heightPct}%`,
        }}
        onMouseDown={(e) =>
          startInteractiveTransform(e, cue, stageRef.current, 'move', targetKey)
        }
        onDoubleClick={(e) => {
          e.stopPropagation();
          onUpdateCue(cue.id, {
            scaleX: 100,
            scaleY: 100,
            offsetX: 0,
            offsetY: 0,
            zoom: 100,
          });
        }}
        title={tr("Arrastra para mover el vídeo • Arrastra las 4 esquinas para ampliar o deformar H/V • Doble clic para centrar al 100%")}
      >
        {/* 4 Corner Handles */}
        <div
          className="gizmo-corner nw"
          onMouseDown={(e) =>
            startInteractiveTransform(e, cue, stageRef.current, 'nw', targetKey)
          }
        />
        <div
          className="gizmo-corner ne"
          onMouseDown={(e) =>
            startInteractiveTransform(e, cue, stageRef.current, 'ne', targetKey)
          }
        />
        <div
          className="gizmo-corner sw"
          onMouseDown={(e) =>
            startInteractiveTransform(e, cue, stageRef.current, 'sw', targetKey)
          }
        />
        <div
          className="gizmo-corner se"
          onMouseDown={(e) =>
            startInteractiveTransform(e, cue, stageRef.current, 'se', targetKey)
          }
        />
        <div className="gizmo-hud-badge">
          {box.pixelWidth}×{box.pixelHeight}{tr("px (")}{Math.round(cue.scaleX ?? 100)}%×
          {Math.round(cue.scaleY ?? 100)}%)
        </div>
      </div>
    );
  };

  const prvDur = previewCue?.duration || 0;
  const prvIn = previewCue?.inPoint || 0;
  const prvOut = previewCue && previewCue.outPoint > prvIn ? previewCue.outPoint : prvDur;
  const prvRem = Math.max(0, prvOut - prvTime);

  const pgmDur = programCue?.duration || 0;
  const pgmIn = programCue?.inPoint || 0;
  const pgmOut = programCue && programCue.outPoint > pgmIn ? programCue.outPoint : pgmDur;

  const isWarning = pgmPlaying && pgmRemaining <= 15 && pgmRemaining > 5;
  const isCritical = pgmPlaying && pgmRemaining <= 5;

  // Master Fader with magnetic snap at 100% (0.0 dB)
  const handleMasterFaderChange = (rawVal: number) => {
    const snapped = rawVal >= 96 && rawVal <= 104 ? 100 : rawVal;
    onChangeMasterVolume(snapped);
  };

  return (
    <div
      className="dual-monitors-grid"
      onMouseDown={() => setActiveGizmoTarget(null)}
    >
      {/* ================= LEFT: PREVIEW (PRV) MONITOR ================= */}
      <div className="monitor-card preview-card">
        <div className="monitor-header">
          <div className="monitor-badge prv-badge">
            <span className="tally-dot prv-dot" />
            {tr("PREVIEW (PRV)")}
          </div>
          <div className="monitor-clip-title">
            {previewCue ? (
              <>
                <span className="cue-num-pill">#{previewCue.cueNumber}</span>
                <span className="truncate">{previewCue.name}</span>
                <span className="codec-tag">
                  {previewCue.videoCodec.toUpperCase()} {previewCue.width}×{previewCue.height} •{' '}
                  {previewCue.audioChannels > 0
                    ? `AUDIO ${previewCue.audioCodec.toUpperCase()} ${previewCue.audioChannels}ch`
                    : tr("SIN AUDIO")}
                </span>
              </>
            ) : (
              <span className="text-muted">{tr("Selecciona un vídeo del Cue List")}</span>
            )}
          </div>
          <div className="monitor-tc-group">
            <span className="tc-small">
              IN {formatTimecode(prvIn, previewCue?.fps || 25)}
            </span>
            <span className="tc-small emerald-text">
              REM -{formatTimecode(prvRem, previewCue?.fps || 25)}
            </span>
          </div>
        </div>

        {/* Preview Video Chamber & Proportional Output Canvas */}
        <div className="monitor-viewport prv-viewport" ref={prvViewportRef}>
          <div
            className="canvas-stage"
            ref={prvStageRef}
            style={{
              width: `${prvStageSize.w}px`,
              height: `${prvStageSize.h}px`,
            }}
          >
            {/* Preview Background Blur Layer */}
            <video
              ref={prvBgVideoRef}
              muted
              playsInline
              style={{
                ...getBackgroundBlurVideoStyle({
                  bgBlurAmount: previewCue?.bgBlurAmount ?? 90,
                  bgBlurBrightness: previewCue?.bgBlurBrightness ?? 75,
                  bgBlurZoom: previewCue?.bgBlurZoom ?? 125,
                  rotation: previewCue?.rotation,
                  flipH: previewCue?.flipH,
                  flipV: previewCue?.flipV,
                }),
                display: previewCue && previewCue.bgBlurEnabled ? 'block' : 'none',
              }}
            />

            {/* Preview Foreground Video Layer */}
            <video
              ref={previewVideoRef}
              muted={!prvAudition}
              playsInline
              style={{
                ...getForegroundVideoStyle({
                  scaleMode: previewCue?.scaleMode || 'fit',
                  aspectRatio: previewCue?.aspectRatio || 'native',
                  zoom: previewCue?.zoom ?? 100,
                  scaleX: previewCue?.scaleX ?? 100,
                  scaleY: previewCue?.scaleY ?? 100,
                  offsetX: previewCue?.offsetX ?? 0,
                  offsetY: previewCue?.offsetY ?? 0,
                  rotation: previewCue?.rotation || 0,
                  flipH: previewCue?.flipH || false,
                  flipV: previewCue?.flipV || false,
                  canvasWidth: totalCanvasWidth,
                  canvasHeight: totalCanvasHeight,
                  videoWidth: previewCue?.width || 1920,
                  videoHeight: previewCue?.height || 1080,
                }),
                display: previewCue ? 'block' : 'none',
              }}
            />

            {/* Interactive Mouse Move & 4-Corner Resize Gizmo */}
            {renderInteractiveGizmo(previewCue, prvStageRef, 'prv')}

            {!previewCue && (
              <div className="empty-viewport">
                <span>{tr("SIN SEÑAL EN PREVIEW")}</span>
                <small>{tr("Lienzo")} {totalCanvasWidth}×{totalCanvasHeight} px</small>
              </div>
            )}
            {previewCue && !previewCue.exists && (
              <div className="missing-overlay">
                <span>{tr("ARCHIVO NO ENCONTRADO (OFFLINE)")}</span>
                <small>{previewCue.filePath}</small>
              </div>
            )}
          </div>

          <div className="viewport-overlay-tc left">
            ELAPSED {formatTimecode(prvTime, previewCue?.fps || 25)}
          </div>
          <div className="viewport-overlay-tc right">
            OUT {formatTimecode(prvOut, previewCue?.fps || 25)}
          </div>
        </div>

        {/* Preview Timeline with In/Out Trim Bar */}
        <div className="timeline-container">
          <div className="trim-region-track">
            {prvDur > 0 && (
              <>
                <div
                  className="trim-active-bar prv-trim-bar"
                  style={{
                    left: `${(prvIn / prvDur) * 100}%`,
                    width: `${Math.max(0.5, ((prvOut - prvIn) / prvDur) * 100)}%`,
                  }}
                />
                <div
                  className="trim-marker in-marker"
                  style={{ left: `${(prvIn / prvDur) * 100}%` }}
                  title={`IN: ${formatTimecode(prvIn)}`}
                />
                <div
                  className="trim-marker out-marker"
                  style={{ left: `${(prvOut / prvDur) * 100}%` }}
                  title={`OUT: ${formatTimecode(prvOut)}`}
                />
              </>
            )}
            <input
              type="range"
              className="scrub-slider prv-slider"
              min={0}
              max={prvDur || 100}
              step={0.02}
              value={prvTime}
              disabled={!previewCue}
              onChange={(e) => onSeekPrv(parseFloat(e.target.value))}
            />
          </div>
        </div>

        {/* Preview Transport & Trim Controls */}
        <div className="monitor-controls-row">
          <div className="btn-group">
            <button
              className={`ctrl-btn ${prvPlaying ? 'active-emerald' : ''}`}
              onClick={onTogglePrvPlay}
              disabled={!previewCue}
              title={tr("Reproducir / Pausar Preview")}
            >
              {prvPlaying ? <Pause size={14} /> : <Play size={14} />}
              <span>{prvPlaying ? 'PAUSA' : 'PLAY'}</span>
            </button>
            <button
              className="ctrl-btn icon-only"
              onClick={() => onStepPrvFrame(-1)}
              disabled={!previewCue}
              title={tr("Fotograma anterior (-1f)")}
            >
              <StepBack size={13} />
            </button>
            <button
              className="ctrl-btn icon-only"
              onClick={() => onStepPrvFrame(1)}
              disabled={!previewCue}
              title={tr("Fotograma siguiente (+1f)")}
            >
              <StepForward size={13} />
            </button>
          </div>

          <div className="btn-group">
            <button
              className="ctrl-btn trim-btn"
              onClick={onSetPrvIn}
              disabled={!previewCue}
              title={tr("Marcar Punto IN en posición actual (Tecla I)")}
            >
              <Scissors size={12} />
              <span>{tr("[ IN")}</span>
            </button>
            <button
              className="ctrl-btn trim-btn"
              onClick={onSetPrvOut}
              disabled={!previewCue}
              title={tr("Marcar Punto OUT en posición actual (Tecla O)")}
            >
              <span>{tr("OUT ]")}</span>
            </button>
            <button
              className="ctrl-btn"
              onClick={onResetPrvInOut}
              disabled={!previewCue}
              title={tr("Resetear recorte In/Out al clip completo")}
            >
              <span>CLR</span>
            </button>
          </div>

          <div className="btn-group">
            <button
              className="ctrl-btn"
              onClick={() => onPrvGotoEnd(10)}
              disabled={!previewCue}
              title={tr("Probar final en Preview (-10s antes de OUT)")}
            >
              <span>-10s</span>
            </button>
            <button
              className={`ctrl-btn ${prvAudition ? 'active-amber' : ''}`}
              onClick={onTogglePrvAudition}
              disabled={!previewCue}
              title={tr("Escuchar audio de Preview (Audition)")}
            >
              {prvAudition ? <Volume2 size={13} /> : <VolumeX size={13} />}
              <span>AUD</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= CENTER: TRANSITION & TAKE BRIDGE ================= */}
      <div className="center-bridge">
        <button
          className="take-master-btn"
          onClick={onTake}
          disabled={!previewCue && !programCue}
          title={tr("Lanzar Preview a Program con transición (ENTER / F1)")}
        >
          <ArrowRightLeft size={18} />
          <span className="take-title">TAKE</span>
          <span className="take-sub">
            {transitionType.toUpperCase()} ({transitionDuration.toFixed(1)}s)
          </span>
        </button>

        <button
          className="cut-direct-btn"
          onClick={onCutImmediate}
          disabled={!previewCue}
          title={tr("Corte directo instantáneo a Program (F2)")}
        >
          <Zap size={14} />
          <span>{tr("CUT DIRECTO")}</span>
        </button>

        {/* Transition Progress Bar */}
        <div className="trans-progress-wrap" title={tr("Progreso de transición A/B")}>
          <div
            className="trans-progress-fill"
            style={{ width: `${Math.round(transitionProgress * 100)}%` }}
          />
        </div>

        {/* Transition Type Selector */}
        <div className="bridge-section">
          <div className="bridge-label">{tr("TRANSICIÓN")}</div>
          <div className="trans-type-grid">
            {(
              [
                { id: 'cut', label: 'CUT' },
                { id: 'dissolve', label: 'MIX' },
                { id: 'dipToBlack', label: 'DIP' },
                { id: 'wipe', label: 'WIPE' },
              ] as { id: TransitionType; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                className={`mini-pill ${transitionType === t.id ? 'selected' : ''}`}
                onClick={() => onChangeTransitionType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="trans-dur-row">
            {[0.5, 1.0, 1.5, 2.5].map((dur) => (
              <button
                key={dur}
                className={`dur-pill ${transitionDuration === dur ? 'selected' : ''}`}
                onClick={() => onChangeTransitionDuration(dur)}
              >
                {dur}s
              </button>
            ))}
          </div>
        </div>

        {/* Emergency Live Overrides */}
        <div className="bridge-overrides">
          <button
            className={`override-btn blackout-btn ${isBlackout ? 'active' : ''}`}
            onClick={onToggleBlackout}
            title={tr("Blackout / Fade to Black en salida (Tecla B)")}
          >
            <EyeOff size={14} />
            <span>BLACKOUT</span>
          </button>

          <button
            className={`override-btn freeze-btn ${isFrozen ? 'active' : ''}`}
            onClick={onToggleFreeze}
            title={tr("Congelar imagen de salida (Tecla F)")}
          >
            <Snowflake size={14} />
            <span>FREEZE</span>
          </button>

          <button
            className={`override-btn pattern-btn ${isTestPattern ? 'active' : ''}`}
            onClick={onToggleTestPattern}
            title={tr("Enviar Carta de Ajuste SMPTE a Salida")}
          >
            <Tv size={14} />
            <span>{tr("CARTA AJUSTE")}</span>
          </button>
        </div>
      </div>

      {/* ================= RIGHT: PROGRAM (PGM) MONITOR + AUDIO METERS ================= */}
      <div className="program-with-audio">
        <div
          className={`monitor-card program-card ${pgmPlaying ? 'live-tally' : ''} ${
            isCritical ? 'critical-pulse' : ''
          }`}
        >
          <div className="monitor-header">
            <div className="monitor-badge pgm-badge">
              <span className={`tally-dot pgm-dot ${pgmPlaying ? 'blinking' : ''}`} />
              {tr("PROGRAM (PGM)")} {pgmPlaying ? '• ON AIR' : tr("• STANDBY")}
            </div>
            <div className="monitor-clip-title">
              {programCue ? (
                <>
                  <span className="cue-num-pill pgm-pill">#{programCue.cueNumber}</span>
                  <span className="truncate">{programCue.name}</span>
                  <span className="codec-tag">
                    {programCue.audioChannels > 0
                      ? `${programCue.audioCodec.toUpperCase()} ${programCue.audioChannels}ch`
                      : tr("SIN AUDIO")}
                  </span>
                  <span
                    className="end-action-chip"
                    style={{ borderColor: END_ACTION_LABELS[programCue.endAction].color }}
                  >
                    {tr("FIN:")} {END_ACTION_LABELS[programCue.endAction].short}
                  </span>
                </>
              ) : (
                <span className="text-muted">
                  {tr("Salida")} {totalCanvasWidth}×{totalCanvasHeight} px
                </span>
              )}
            </div>
            <div className="monitor-tc-group">
              <span
                className={`tc-countdown ${
                  isCritical ? 'critical' : isWarning ? 'warning' : 'normal'
                }`}
              >
                -{formatTimecode(pgmRemaining, programCue?.fps || 25, true)}
              </span>
            </div>
          </div>

          {/* Program Dual-Deck Chamber & Proportional Output Canvas */}
          <div className="monitor-viewport pgm-viewport" ref={pgmViewportRef}>
            <div
              className="canvas-stage"
              ref={pgmStageRef}
              style={{
                width: `${pgmStageSize.w}px`,
                height: `${pgmStageSize.h}px`,
              }}
            >
              {/* DECK A */}
              <div style={getDeckWrapperStyle(deckA, 'A')}>
                <video
                  ref={pgmBgVideoARef}
                  muted
                  playsInline
                  style={{
                    ...getBackgroundBlurVideoStyle({
                      bgBlurAmount: deckA.bgBlurAmount,
                      bgBlurBrightness: deckA.bgBlurBrightness,
                      bgBlurZoom: deckA.bgBlurZoom,
                      rotation: deckA.rotation,
                      flipH: deckA.flipH,
                      flipV: deckA.flipV,
                    }),
                    display: deckA.bgBlurEnabled && deckA.mediaUrl ? 'block' : 'none',
                  }}
                />
                <video
                  ref={pgmVideoARef}
                  playsInline
                  style={getForegroundVideoStyle({
                    scaleMode: deckA.scaleMode,
                    aspectRatio: deckA.aspectRatio,
                    zoom: deckA.zoom,
                    scaleX: deckA.scaleX,
                    scaleY: deckA.scaleY,
                    offsetX: deckA.offsetX,
                    offsetY: deckA.offsetY,
                    rotation: deckA.rotation,
                    flipH: deckA.flipH,
                    flipV: deckA.flipV,
                    canvasWidth: totalCanvasWidth,
                    canvasHeight: totalCanvasHeight,
                    videoWidth: deckA.videoWidth || 1920,
                    videoHeight: deckA.videoHeight || 1080,
                  })}
                />
              </div>

              {/* DECK B */}
              <div style={getDeckWrapperStyle(deckB, 'B')}>
                <video
                  ref={pgmBgVideoBRef}
                  muted
                  playsInline
                  style={{
                    ...getBackgroundBlurVideoStyle({
                      bgBlurAmount: deckB.bgBlurAmount,
                      bgBlurBrightness: deckB.bgBlurBrightness,
                      bgBlurZoom: deckB.bgBlurZoom,
                      rotation: deckB.rotation,
                      flipH: deckB.flipH,
                      flipV: deckB.flipV,
                    }),
                    display: deckB.bgBlurEnabled && deckB.mediaUrl ? 'block' : 'none',
                  }}
                />
                <video
                  ref={pgmVideoBRef}
                  playsInline
                  style={getForegroundVideoStyle({
                    scaleMode: deckB.scaleMode,
                    aspectRatio: deckB.aspectRatio,
                    zoom: deckB.zoom,
                    scaleX: deckB.scaleX,
                    scaleY: deckB.scaleY,
                    offsetX: deckB.offsetX,
                    offsetY: deckB.offsetY,
                    rotation: deckB.rotation,
                    flipH: deckB.flipH,
                    flipV: deckB.flipV,
                    canvasWidth: totalCanvasWidth,
                    canvasHeight: totalCanvasHeight,
                    videoWidth: deckB.videoWidth || 1920,
                    videoHeight: deckB.videoHeight || 1080,
                  })}
                />
              </div>

              {/* Interactive Mouse Move & 4-Corner Resize Gizmo on Program */}
              {!isTestPattern && renderInteractiveGizmo(programCue, pgmStageRef, 'pgm')}

              {isTestPattern && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                  <TestPatternCanvas
                    canvasWidth={totalCanvasWidth}
                    canvasHeight={totalCanvasHeight}
                    mosaicMode={mosaicConfig?.mode || 'single'}
                  />
                </div>
              )}

              {/* Mosaic Seam Guide in Operator Program Monitor */}
              {mosaicConfig &&
                mosaicConfig.showSeamGuideInPreview &&
                (mosaicConfig.mode === 'horizontal_2x1' ||
                  mosaicConfig.mode === 'vertical_1x2') && (
                  <div
                    className={`pgm-mosaic-seam-guide ${
                      mosaicConfig.mode === 'horizontal_2x1' ? 'horiz' : 'vert'
                    }`}
                  >
                    <span className="seam-tag out1">OUT 1</span>
                    <span className="seam-tag out2">OUT 2</span>
                  </div>
                )}

              {isBlackout && (
                <div className="blackout-viewport-banner">
                  <span>{tr("BLACKOUT ACTIVO (SALIDA EN NEGRO)")}</span>
                </div>
              )}

              {isFrozen && !isBlackout && (
                <div className="freeze-viewport-banner">
                  <Snowflake size={13} />
                  <span>{tr("SALIDA CONGELADA (FREEZE)")}</span>
                </div>
              )}

              {!programCue && !isTestPattern && (
                <div className="empty-viewport">
                  <span>{tr("PROGRAM EN NEGRO")}</span>
                  <small>{tr("Lienzo")} {totalCanvasWidth}×{totalCanvasHeight} px</small>
                </div>
              )}
            </div>

            <div className="viewport-overlay-tc left">
              ELAPSED {formatTimecode(pgmTime, programCue?.fps || 25)}
            </div>
            <div className="viewport-overlay-tc right">
              IN {formatTimecode(pgmIn, programCue?.fps || 25)} → OUT{' '}
              {formatTimecode(pgmOut, programCue?.fps || 25)}
            </div>
          </div>

          {/* Program Timeline Scrubber */}
          <div className="timeline-container">
            <div className="trim-region-track">
              {pgmDur > 0 && (
                <>
                  <div
                    className={`trim-active-bar pgm-trim-bar ${
                      isCritical ? 'bg-red' : isWarning ? 'bg-amber' : ''
                    }`}
                    style={{
                      left: `${(pgmIn / pgmDur) * 100}%`,
                      width: `${Math.max(0.5, ((pgmOut - pgmIn) / pgmDur) * 100)}%`,
                    }}
                  />
                  <div
                    className="trim-marker in-marker"
                    style={{ left: `${(pgmIn / pgmDur) * 100}%` }}
                  />
                  <div
                    className="trim-marker out-marker"
                    style={{ left: `${(pgmOut / pgmDur) * 100}%` }}
                  />
                </>
              )}
              <input
                type="range"
                className="scrub-slider pgm-slider"
                min={0}
                max={pgmDur || 100}
                step={0.02}
                value={pgmTime}
                disabled={!programCue}
                onChange={(e) => onSeekPgm(parseFloat(e.target.value))}
              />
            </div>
          </div>

          {/* Program Transport & Test End Controls */}
          <div className="monitor-controls-row">
            <div className="btn-group">
              <button
                className={`ctrl-btn pgm-play-btn ${pgmPlaying ? 'active-red' : ''}`}
                onClick={onTogglePgmPlay}
                disabled={!programCue}
                title={tr("Play / Pausa Program (ESPACIO)")}
              >
                {pgmPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{pgmPlaying ? tr("PAUSAR PGM") : 'PLAY PGM'}</span>
              </button>
              <button
                className="ctrl-btn"
                onClick={onRestartPgm}
                disabled={!programCue}
                title={tr("Volver al punto IN del clip en aire (Tecla R)")}
              >
                <RotateCcw size={13} />
                <span>{tr("INICIO")}</span>
              </button>
            </div>

            {/* Goto -10s / -20s / -30s */}
            <div className="btn-group">
              <button
                className="ctrl-btn goto-end-btn"
                onClick={() => onPgmGotoEnd(30)}
                disabled={!programCue}
                title={tr("Saltar a 30 segundos antes del punto OUT")}
              >
                <FastForward size={12} />
                <span>-30s</span>
              </button>
              <button
                className="ctrl-btn goto-end-btn"
                onClick={() => onPgmGotoEnd(20)}
                disabled={!programCue}
                title={tr("Saltar a 20 segundos antes del punto OUT")}
              >
                <span>-20s</span>
              </button>
              <button
                className="ctrl-btn goto-end-btn highlight-goto"
                onClick={() => onPgmGotoEnd(10)}
                disabled={!programCue}
                title={tr("Saltar a 10 segundos antes del punto OUT (Tecla T)")}
              >
                <span>-10s</span>
              </button>
            </div>

            {/* Live End-Action Switcher for active Program clip */}
            <div className="btn-group">
              <button
                className={`ctrl-btn ${programCue?.endAction === 'hold' ? 'active-cyan' : ''}`}
                onClick={() => onChangePgmEndAction('hold')}
                disabled={!programCue}
                title={tr("Al terminar: Congelar último fotograma (Hold)")}
              >
                <span>HOLD</span>
              </button>
              <button
                className={`ctrl-btn ${programCue?.endAction === 'black' ? 'active-slate' : ''}`}
                onClick={() => onChangePgmEndAction('black')}
                disabled={!programCue}
                title={tr("Al terminar: Ir a Negro (Black)")}
              >
                <span>BLACK</span>
              </button>
              <button
                className={`ctrl-btn ${programCue?.endAction === 'loop' ? 'active-emerald' : ''}`}
                onClick={() => onChangePgmEndAction('loop')}
                disabled={!programCue}
                title={tr("Al terminar: Bucle infinito (Tecla L)")}
              >
                <Repeat size={12} />
                <span>LOOP</span>
              </button>
              <button
                className={`ctrl-btn ${programCue?.endAction === 'next' ? 'active-amber' : ''}`}
                onClick={() => onChangePgmEndAction('next')}
                disabled={!programCue}
                title={tr("Al terminar: Lanzar siguiente vídeo automáticamente")}
              >
                <SkipForward size={12} />
                <span>NEXT</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= STEREO VU METER & MASTER AUDIO RACK (WITH SNAP AT 0 dB) ================= */}
        <div className="audio-master-rack">
          <div className="rack-title">MASTER</div>
          <div className="vu-meters-body">
            {/* Left Channel Bar */}
            <div className="vu-channel">
              <div className="vu-track">
                <div
                  className="vu-fill"
                  style={{ height: `${Math.min(100, Math.max(0, vuLevels.left))}%` }}
                />
                <div
                  className="vu-peak"
                  style={{ bottom: `${Math.min(98, Math.max(0, vuLevels.peakL))}%` }}
                />
              </div>
              <span className="vu-label">L</span>
            </div>

            {/* dB Scale */}
            <div className="vu-scale">
              <span>+2</span>
              <span className="zero-db-mark">0</span>
              <span>-6</span>
              <span>-18</span>
              <span>-48</span>
            </div>

            {/* Right Channel Bar */}
            <div className="vu-channel">
              <div className="vu-track">
                <div
                  className="vu-fill"
                  style={{ height: `${Math.min(100, Math.max(0, vuLevels.right))}%` }}
                />
                <div
                  className="vu-peak"
                  style={{ bottom: `${Math.min(98, Math.max(0, vuLevels.peakR))}%` }}
                />
              </div>
              <span className="vu-label">R</span>
            </div>

            {/* Master Fader with 0 dB (100%) Snap */}
            <div className="master-fader-col">
              <div className="fader-track-wrap">
                <div className="fader-zero-tick" title={tr("0.0 dB (100%)")} />
                <input
                  type="range"
                  className="vertical-fader"
                  min={0}
                  max={125}
                  step={1}
                  value={isMasterMuted ? 0 : masterVolume}
                  onChange={(e) => handleMasterFaderChange(parseInt(e.target.value, 10))}
                  onDoubleClick={() => onChangeMasterVolume(100)}
                  title={tr("Master: {db} (Doble clic para 0.0 dB)", { db: gainToDbString(masterVolume, isMasterMuted) })}
                />
              </div>
              <span
                className={`fader-val ${masterVolume === 100 && !isMasterMuted ? 'is-zero' : ''}`}
                onClick={() => onChangeMasterVolume(100)}
                title={tr("Clic para fijar a 0.0 dB")}
              >
                {isMasterMuted ? 'MUTE' : gainToDbString(masterVolume, false)}
              </span>
            </div>
          </div>

          <button
            className={`master-mute-btn ${isMasterMuted ? 'muted' : ''}`}
            onClick={onToggleMasterMute}
            title={tr("Silenciar Salida Master (Tecla M)")}
          >
            {isMasterMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            <span>{isMasterMuted ? 'MUTED' : 'MUTE'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
