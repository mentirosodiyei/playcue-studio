import React, { useEffect, useRef, useState, useMemo } from 'react';
import { OutputSyncState, DeckSyncPayload, MosaicSliceViewport } from '../types/cue';
import { TestPatternCanvas } from './TestPatternCanvas';
import { formatTimecode } from '../utils/timecode';

const DEFAULT_DECK: DeckSyncPayload = {
  cueId: null,
  mediaUrl: null,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  scaleMode: 'fit',
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
    canvasWidth: 1920,
    canvasHeight: 1080,
    sliceX: 0,
    sliceY: 0,
    sliceWidth: 1920,
    sliceHeight: 1080,
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
  const lastUrlA = useRef<string | null>(null);
  const lastUrlB = useRef<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onOutputState((incoming: OutputSyncState) => {
      setState(incoming);
    });
    return () => unsub();
  }, []);

  // Sync Deck A & Deck B video elements with sub-frame drift lock
  useEffect(() => {
    const syncVideo = (
      video: HTMLVideoElement | null,
      deck: DeckSyncPayload,
      lastUrlRef: React.MutableRefObject<string | null>,
      frozen: boolean
    ) => {
      if (!video) return;
      if (deck.mediaUrl !== lastUrlRef.current) {
        lastUrlRef.current = deck.mediaUrl;
        if (deck.mediaUrl) {
          video.src = deck.mediaUrl;
          video.currentTime = deck.currentTime || 0;
        } else {
          video.removeAttribute('src');
          video.load();
        }
      }

      if (!deck.mediaUrl) return;

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

    syncVideo(videoARef.current, state.deckA, lastUrlA, state.isFrozen);
    syncVideo(videoBRef.current, state.deckB, lastUrlB, state.isFrozen);
  }, [state]);

  const getDeckStyle = (deck: DeckSyncPayload, deckKey: 'A' | 'B'): React.CSSProperties => {
    const objectFit =
      deck.scaleMode === 'fill' ? 'cover' : deck.scaleMode === 'stretch' ? 'fill' : 'contain';

    const transforms: string[] = [];
    if (deck.rotation) transforms.push(`rotate(${deck.rotation}deg)`);
    if (deck.flipH) transforms.push('scaleX(-1)');
    if (deck.flipV) transforms.push('scaleY(-1)');

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
      objectFit,
      opacity: deck.mediaUrl ? Math.max(0, Math.min(1, deck.opacity)) : 0,
      transform: transforms.length > 0 ? transforms.join(' ') : undefined,
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
        backgroundColor: '#000000',
        overflow: 'hidden',
        cursor: 'none',
        userSelect: 'none',
      }}
    >
      {/* Virtual Mosaic Canvas (Full or Sliced for Output 1 / Output 2) */}
      <div style={sliceContainerStyle}>
        <video
          ref={videoARef}
          muted
          playsInline
          style={getDeckStyle(state.deckA, 'A')}
        />

        <video
          ref={videoBRef}
          muted
          playsInline
          style={getDeckStyle(state.deckB, 'B')}
        />

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
