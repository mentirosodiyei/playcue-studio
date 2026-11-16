import React, { useEffect, useRef, useState, useMemo } from 'react';
import { OutputSyncState, DeckSyncPayload, MosaicSliceViewport } from '../types/cue';
import { TestPatternCanvas } from './TestPatternCanvas';
import { formatTimecode } from '../utils/timecode';
import {
  getForegroundVideoStyle,
  getBackgroundBlurVideoStyle,
} from '../utils/videoGeometry';

import { tr } from '../i18n';
const DEFAULT_DECK: DeckSyncPayload = {
  cueId: null,
  mediaUrl: null,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  scaleMode: 'fit',
  aspectRatio: 'native',
  zoom: 100,
  scaleX: 100,
  scaleY: 100,
  offsetX: 0,
  offsetY: 0,
  bgBlurEnabled: false,
  bgBlurAmount: 90,
  bgBlurBrightness: 75,
  bgBlurZoom: 125,
  opacity: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
};

function parseViewportFromHash(): MosaicSliceViewport {
  try {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) {
      const params = new URLSearchParams(hash.slice(qIdx + 1));
      const vpRaw = params.get('viewport');
      if (vpRaw) {
        return JSON.parse(decodeURIComponent(vpRaw));
      }
    }
  } catch {}
  return {
    mode: 'single',
    role: 'full',
    canvasWidth: 2560,
    canvasHeight: 1440,
    sliceX: 0,
    sliceY: 0,
    sliceWidth: 2560,
    sliceHeight: 1440,
    label: 'OUTPUT',
  };
}

export const OutputView: React.FC = () => {
  const viewport = useMemo(() => parseViewportFromHash(), []);

  const [state, setState] = useState<OutputSyncState>({
    deckA: { ...DEFAULT_DECK },
    deckB: { ...DEFAULT_DECK },
    activeDeck: 'A',
    transitionType: 'cut',
    transitionProgress: 1,
    isBlackout: false,
    isFrozen: false,
    isTestPattern: false,
    showOSD: false,
    programCueName: '',
    programCueNumber: '',
    remainingTime: 0,
    syncSeq: 0,
  });

  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoARef = useRef<HTMLVideoElement | null>(null);
  const bgVideoBRef = useRef<HTMLVideoElement | null>(null);

  const lastUrlA = useRef<string | null>(null);
  const lastUrlB = useRef<string | null>(null);
  const lastBgUrlA = useRef<string | null>(null);
  const lastBgUrlB = useRef<string | null>(null);

  const lastSeekAtA = useRef<number>(0);
  const lastSeekAtB = useRef<number>(0);
  const lastSeekAtBgA = useRef<number>(0);
  const lastSeekAtBgB = useRef<number>(0);
  const lastVisualSigRef = useRef<string>('');

  // Sync a video element using broadcast PLL speed-lock (avoids H.264 GOP seek thrashing)
  const syncVideoElement = (
    video: HTMLVideoElement | null,
    deck: DeckSyncPayload,
    lastUrlRef: React.MutableRefObject<string | null>,
    lastSeekRef: React.MutableRefObject<number>,
    frozen: boolean,
    activeCondition = true
  ) => {
    if (!video) return;
    const effectiveUrl = activeCondition ? deck.mediaUrl : null;
    const now = performance.now();

    if (effectiveUrl !== lastUrlRef.current) {
      lastUrlRef.current = effectiveUrl;
      if (effectiveUrl) {
        video.src = effectiveUrl;
        const targetStart = deck.currentTime || 0;
        if (targetStart > 0.03) {
          try {
            video.currentTime = targetStart;
          } catch {}
        }
        lastSeekRef.current = now;
      } else {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    }

    if (!effectiveUrl) return;

    const baseRate = deck.playbackRate || 1;

    if (frozen) {
      if (!video.paused) video.pause();
      return;
    }

    const curT = video.currentTime || 0;
    const targetT = deck.currentTime || 0;
    const signedDrift = targetT - curT;
    const absDrift = Math.abs(signedDrift);

    if (deck.isPlaying) {
      if (video.paused && video.readyState >= 1) {
        video.play().catch(() => {});
      }

      // Only hard-seek on a genuine jump/scrub/loop (> 650ms) and when not already seeking
      if (absDrift > 0.65 && !video.seeking && now - lastSeekRef.current > 900) {
        try {
          video.currentTime = targetT;
          lastSeekRef.current = now;
          if (video.playbackRate !== baseRate) {
            video.playbackRate = baseRate;
          }
        } catch {}
      } else if (absDrift > 0.09 && absDrift <= 0.65 && !video.seeking) {
        // Gentle PLL speed lock (±2%) so H.264 decoder never flushes its frame queue
        const nudgedRate = signedDrift > 0 ? baseRate * 1.02 : baseRate * 0.98;
        if (Math.abs(video.playbackRate - nudgedRate) > 0.005) {
          video.playbackRate = nudgedRate;
        }
      } else if (Math.abs(video.playbackRate - baseRate) > 0.005) {
        video.playbackRate = baseRate;
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
      if (Math.abs(video.playbackRate - baseRate) > 0.005) {
        video.playbackRate = baseRate;
      }
      if (absDrift > 0.08 && !video.seeking && now - lastSeekRef.current > 250) {
        try {
          video.currentTime = targetT;
          lastSeekRef.current = now;
        } catch {}
      }
    }
  };

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onOutputState((incoming: OutputSyncState) => {
      // 1. Imperatively sync <video> elements immediately without waiting for React render
      syncVideoElement(
        videoARef.current,
        incoming.deckA,
        lastUrlA,
        lastSeekAtA,
        incoming.isFrozen,
        true
      );
      syncVideoElement(
        videoBRef.current,
        incoming.deckB,
        lastUrlB,
        lastSeekAtB,
        incoming.isFrozen,
        true
      );
      syncVideoElement(
        bgVideoARef.current,
        incoming.deckA,
        lastBgUrlA,
        lastSeekAtBgA,
        incoming.isFrozen,
        !!incoming.deckA.bgBlurEnabled
      );
      syncVideoElement(
        bgVideoBRef.current,
        incoming.deckB,
        lastBgUrlB,
        lastSeekAtBgB,
        incoming.isFrozen,
        !!incoming.deckB.bgBlurEnabled
      );

      // 2. Only trigger React state update when visual layout, opacity, or OSD state changes
      const dA = incoming.deckA;
      const dB = incoming.deckB;
      const visualSig = [
        incoming.activeDeck,
        incoming.transitionType,
        Math.round((incoming.transitionProgress ?? 1) * 200),
        incoming.isBlackout ? 1 : 0,
        incoming.isFrozen ? 1 : 0,
        incoming.isTestPattern ? 1 : 0,
        incoming.showOSD ? 1 : 0,
        incoming.showOSD ? Math.floor((incoming.remainingTime || 0) * 10) : 0,
        incoming.showOSD ? incoming.programCueNumber : '',
        dA.mediaUrl || '',
        Math.round((dA.opacity ?? 0) * 200),
        dA.scaleMode,
        dA.aspectRatio,
        dA.zoom,
        dA.scaleX,
        dA.scaleY,
        dA.offsetX,
        dA.offsetY,
        dA.rotation,
        dA.flipH ? 1 : 0,
        dA.flipV ? 1 : 0,
        dA.bgBlurEnabled ? 1 : 0,
        dA.bgBlurAmount,
        dA.bgBlurBrightness,
        dA.bgBlurZoom,
        dB.mediaUrl || '',
        Math.round((dB.opacity ?? 0) * 200),
        dB.scaleMode,
        dB.aspectRatio,
        dB.zoom,
        dB.scaleX,
        dB.scaleY,
        dB.offsetX,
        dB.offsetY,
        dB.rotation,
        dB.flipH ? 1 : 0,
        dB.flipV ? 1 : 0,
        dB.bgBlurEnabled ? 1 : 0,
        dB.bgBlurAmount,
        dB.bgBlurBrightness,
        dB.bgBlurZoom,
      ].join('|');

      if (visualSig !== lastVisualSigRef.current) {
        lastVisualSigRef.current = visualSig;
        setState(incoming);
      }
    });
    return () => unsub();
  }, []);

  // ESC on the output window is handled by the main process as PANIC (blackout); it never closes it.

  const getDeckWrapperStyle = (deck: DeckSyncPayload, deckKey: 'A' | 'B'): React.CSSProperties => {
    let clipPath = 'none';
    if (state.transitionType === 'wipe' && state.transitionProgress < 1) {
      const isIncoming = state.activeDeck === deckKey;
      if (isIncoming) {
        const pct = Math.round(state.transitionProgress * 100);
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
      zIndex: state.activeDeck === deckKey ? 2 : 1,
      backgroundColor: 'transparent',
      pointerEvents: 'none',
    };
  };

  // Virtual Mosaic Canvas slice transform
  const sliceContainerStyle: React.CSSProperties = useMemo(() => {
    const sw = Math.max(1, viewport.sliceWidth);
    const sh = Math.max(1, viewport.sliceHeight);
    const cw = Math.max(1, viewport.canvasWidth);
    const ch = Math.max(1, viewport.canvasHeight);

    return {
      position: 'absolute',
      left: `${-(viewport.sliceX / sw) * 100}%`,
      top: `${-(viewport.sliceY / sh) * 100}%`,
      width: `${(cw / sw) * 100}%`,
      height: `${(ch / sh) * 100}%`,
      backgroundColor: '#000000',
      overflow: 'hidden',
    };
  }, [viewport]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000000',
        overflow: 'hidden',
        cursor: 'none',
        userSelect: 'none',
      }}
    >
      {/* Virtual Mosaic Canvas (Full or Sliced for Output 1 / Output 2) */}
      <div style={sliceContainerStyle}>
        {/* DECK A (Background Blur Layer + Foreground Video Layer) */}
        <div style={getDeckWrapperStyle(state.deckA, 'A')}>
          <video
            ref={bgVideoARef}
            muted
            playsInline
            style={{
              ...getBackgroundBlurVideoStyle({
                bgBlurAmount: state.deckA.bgBlurAmount,
                bgBlurBrightness: state.deckA.bgBlurBrightness,
                bgBlurZoom: state.deckA.bgBlurZoom,
                rotation: state.deckA.rotation,
                flipH: state.deckA.flipH,
                flipV: state.deckA.flipV,
              }),
              display: state.deckA.bgBlurEnabled && state.deckA.mediaUrl ? 'block' : 'none',
            }}
          />
          <video
            ref={videoARef}
            muted
            playsInline
            style={getForegroundVideoStyle({
              scaleMode: state.deckA.scaleMode,
              aspectRatio: state.deckA.aspectRatio,
              zoom: state.deckA.zoom,
              scaleX: state.deckA.scaleX,
              scaleY: state.deckA.scaleY,
              offsetX: state.deckA.offsetX,
              offsetY: state.deckA.offsetY,
              rotation: state.deckA.rotation,
              flipH: state.deckA.flipH,
              flipV: state.deckA.flipV,
              canvasWidth: viewport.canvasWidth,
              canvasHeight: viewport.canvasHeight,
              videoWidth: state.deckA.videoWidth,
              videoHeight: state.deckA.videoHeight,
            })}
          />
        </div>

        {/* DECK B (Background Blur Layer + Foreground Video Layer) */}
        <div style={getDeckWrapperStyle(state.deckB, 'B')}>
          <video
            ref={bgVideoBRef}
            muted
            playsInline
            style={{
              ...getBackgroundBlurVideoStyle({
                bgBlurAmount: state.deckB.bgBlurAmount,
                bgBlurBrightness: state.deckB.bgBlurBrightness,
                bgBlurZoom: state.deckB.bgBlurZoom,
                rotation: state.deckB.rotation,
                flipH: state.deckB.flipH,
                flipV: state.deckB.flipV,
              }),
              display: state.deckB.bgBlurEnabled && state.deckB.mediaUrl ? 'block' : 'none',
            }}
          />
          <video
            ref={videoBRef}
            muted
            playsInline
            style={getForegroundVideoStyle({
              scaleMode: state.deckB.scaleMode,
              aspectRatio: state.deckB.aspectRatio,
              zoom: state.deckB.zoom,
              scaleX: state.deckB.scaleX,
              scaleY: state.deckB.scaleY,
              offsetX: state.deckB.offsetX,
              offsetY: state.deckB.offsetY,
              rotation: state.deckB.rotation,
              flipH: state.deckB.flipH,
              flipV: state.deckB.flipV,
              canvasWidth: viewport.canvasWidth,
              canvasHeight: viewport.canvasHeight,
              videoWidth: state.deckB.videoWidth,
              videoHeight: state.deckB.videoHeight,
            })}
          />
        </div>

        {/* Always mounted (only hidden) so turning the pattern on/off never changes the layer tree
            or flashes an unpainted frame; its background is opaque. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            backgroundColor: '#0a0e17',
            visibility: state.isTestPattern ? 'visible' : 'hidden',
          }}
        >
          <TestPatternCanvas
            active={state.isTestPattern}
            canvasWidth={viewport.canvasWidth}
            canvasHeight={viewport.canvasHeight}
            mosaicMode={viewport.mode}
          />
        </div>
      </div>

      {/* Blackout Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#000000',
          opacity: state.isBlackout ? 1 : 0,
          transition: 'opacity 320ms ease-in-out',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      />

      {/* Optional Technician OSD */}
      {state.showOSD && !state.isBlackout && (
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: 32,
            zIndex: 30,
            background: 'rgba(7, 9, 13, 0.88)',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '10px 18px',
            fontFamily: 'Consolas, monospace',
            color: '#f8fafc',
          }}
        >
          <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, marginBottom: 2 }}>
            {viewport.label} • {tr("LIENZO")} {viewport.canvasWidth}×{viewport.canvasHeight}
          </div>
          <div style={{ fontSize: 14, color: '#38bdf8', fontWeight: 700 }}>
            CUE {state.programCueNumber || '-'} • {state.programCueName || tr("NO CLIP")}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color:
                state.remainingTime <= 5
                  ? '#ef4444'
                  : state.remainingTime <= 15
                  ? '#f59e0b'
                  : '#10b981',
            }}
          >
            REM -{formatTimecode(state.remainingTime, state.programFps || 25, true)}
          </div>
        </div>
      )}
    </div>
  );
};
