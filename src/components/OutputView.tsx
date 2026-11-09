import React, { useEffect, useRef, useState, useMemo } from 'react';
import { OutputSyncState, DeckSyncPayload, MosaicSliceViewport } from '../types/cue';
import { TestPatternCanvas } from './TestPatternCanvas';
import { formatTimecode } from '../utils/timecode';
import {
  getForegroundVideoStyle,
  getBackgroundBlurVideoStyle,
} from '../utils/videoGeometry';

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

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onOutputState((incoming: OutputSyncState) => {
      setState(incoming);
    });
    return () => unsub();
  }, []);

  // Allow pressing ESC on the output window to close it if testing on a single screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && window.electronAPI) {
        window.electronAPI.setOutputWindow({ open: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Sync Deck A & Deck B foreground + background blur video elements with sub-frame drift lock
  useEffect(() => {
    const syncVideo = (
      video: HTMLVideoElement | null,
      deck: DeckSyncPayload,
      lastUrlRef: React.MutableRefObject<string | null>,
      frozen: boolean,
      activeCondition = true
    ) => {
      if (!video) return;
      const effectiveUrl = activeCondition ? deck.mediaUrl : null;

      if (effectiveUrl !== lastUrlRef.current) {
        lastUrlRef.current = effectiveUrl;
        if (effectiveUrl) {
          video.src = effectiveUrl;
          video.currentTime = deck.currentTime || 0;
        } else {
          video.removeAttribute('src');
          video.load();
        }
      }

      if (!effectiveUrl) return;

      if (video.playbackRate !== (deck.playbackRate || 1)) {
        video.playbackRate = deck.playbackRate || 1;
      }

      if (frozen) {
        if (!video.paused) video.pause();
        return;
      }

      const drift = Math.abs((video.currentTime || 0) - (deck.currentTime || 0));
      if (deck.isPlaying) {
        if (drift > 0.045) {
          try {
            video.currentTime = deck.currentTime;
          } catch {}
        }
        if (video.paused) {
          video.play().catch(() => {});
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
        if (drift > 0.02) {
          try {
            video.currentTime = deck.currentTime;
          } catch {}
        }
      }
    };

    syncVideo(videoARef.current, state.deckA, lastUrlA, state.isFrozen, true);
    syncVideo(videoBRef.current, state.deckB, lastUrlB, state.isFrozen, true);

    syncVideo(
      bgVideoARef.current,
      state.deckA,
      lastBgUrlA,
      state.isFrozen,
      !!state.deckA.bgBlurEnabled
    );
    syncVideo(
      bgVideoBRef.current,
      state.deckB,
      lastBgUrlB,
      state.isFrozen,
      !!state.deckB.bgBlurEnabled
    );
  }, [state]);

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
      onDoubleClick={() => {
        if (window.electronAPI) {
          window.electronAPI.setOutputWindow({ open: false });
        }
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
            })}
          />
        </div>

        {state.isTestPattern && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
            <TestPatternCanvas
              canvasWidth={viewport.canvasWidth}
              canvasHeight={viewport.canvasHeight}
              mosaicMode={viewport.mode}
            />
          </div>
        )}
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
            {viewport.label} • LIENZO {viewport.canvasWidth}×{viewport.canvasHeight}
          </div>
          <div style={{ fontSize: 14, color: '#38bdf8', fontWeight: 700 }}>
            CUE {state.programCueNumber || '-'} • {state.programCueName || 'NO CLIP'}
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
            REM -{formatTimecode(state.remainingTime, 25, true)}
          </div>
        </div>
      )}
    </div>
  );
};
