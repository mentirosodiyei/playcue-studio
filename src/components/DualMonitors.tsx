import React from 'react';
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
} from '../utils/timecode';
import { TestPatternCanvas } from './TestPatternCanvas';

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
  masterVolume,
  isMasterMuted,
  onChangeMasterVolume,
  onToggleMasterMute,
  vuLevels,
  mosaicConfig,
  totalCanvasWidth = 1920,
  totalCanvasHeight = 1080,
}) => {
  const getDeckStyle = (deck: DeckSyncPayload, deckKey: 'A' | 'B'): React.CSSProperties => {
    const objectFit =
      deck.scaleMode === 'fill' ? 'cover' : deck.scaleMode === 'stretch' ? 'fill' : 'contain';
    const transforms: string[] = [];
    if (deck.rotation) transforms.push(`rotate(${deck.rotation}deg)`);
    if (deck.flipH) transforms.push('scaleX(-1)');
    if (deck.flipV) transforms.push('scaleY(-1)');

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
      objectFit,
      opacity: deck.mediaUrl ? Math.max(0, Math.min(1, deck.opacity)) : 0,
      transform: transforms.length > 0 ? transforms.join(' ') : undefined,
      clipPath,
      zIndex: activeDeck === deckKey ? 2 : 1,
      backgroundColor: 'transparent',
    };
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

  return (
    <div className="dual-monitors-grid">
      {/* ================= LEFT: PREVIEW (PRV) MONITOR ================= */}
      <div className="monitor-card preview-card">
        <div className="monitor-header">
          <div className="monitor-badge prv-badge">
            <span className="tally-dot prv-dot" />
            PREVIEW (PRV)
          </div>
          <div className="monitor-clip-title">
            {previewCue ? (
              <>
                <span className="cue-num-pill">#{previewCue.cueNumber}</span>
                <span className="truncate">{previewCue.name}</span>
                <span className="codec-tag">
                  {previewCue.width}x{previewCue.height} • {previewCue.fps}fps •{' '}
                  {previewCue.videoCodec.toUpperCase()}
                </span>
              </>
            ) : (
              <span className="text-muted">Selecciona un Cue para previsualizar</span>
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

        {/* Preview Video Viewport */}
        <div className="monitor-viewport prv-viewport">
          <video
            ref={previewVideoRef}
            muted={!prvAudition}
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit:
                previewCue?.scaleMode === 'fill'
                  ? 'cover'
                  : previewCue?.scaleMode === 'stretch'
                  ? 'fill'
                  : 'contain',
              display: previewCue ? 'block' : 'none',
            }}
          />
          {!previewCue && (
            <div className="empty-viewport">
              <span>SIN SEÑAL EN PREVIEW</span>
              <small>Doble clic o clic en un clip de la lista inferior</small>
            </div>
          )}
          {previewCue && !previewCue.exists && (
            <div className="missing-overlay">
              <span>ARCHIVO NO ENCONTRADO (OFFLINE)</span>
              <small>{previewCue.filePath}</small>
            </div>
          )}
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
              title="Reproducir / Pausar Preview"
            >
              {prvPlaying ? <Pause size={15} /> : <Play size={15} />}
              <span>{prvPlaying ? 'PAUSA' : 'PLAY'}</span>
            </button>
            <button
              className="ctrl-btn icon-only"
              onClick={() => onStepPrvFrame(-1)}
              disabled={!previewCue}
              title="Fotograma anterior (-1f)"
            >
              <StepBack size={14} />
            </button>
            <button
              className="ctrl-btn icon-only"
              onClick={() => onStepPrvFrame(1)}
              disabled={!previewCue}
              title="Fotograma siguiente (+1f)"
            >
              <StepForward size={14} />
            </button>
          </div>

          <div className="btn-group">
            <button
              className="ctrl-btn trim-btn"
              onClick={onSetPrvIn}
              disabled={!previewCue}
              title="Marcar Punto IN en posición actual (Tecla I)"
            >
              <Scissors size={13} />
              <span>[ IN</span>
            </button>
            <button
              className="ctrl-btn trim-btn"
              onClick={onSetPrvOut}
              disabled={!previewCue}
              title="Marcar Punto OUT en posición actual (Tecla O)"
            >
              <span>OUT ]</span>
            </button>
            <button
              className="ctrl-btn"
              onClick={onResetPrvInOut}
              disabled={!previewCue}
              title="Resetear recorte In/Out al clip completo"
            >
              <span>CLR</span>
            </button>
          </div>

          <div className="btn-group">
            <button
              className="ctrl-btn"
              onClick={() => onPrvGotoEnd(10)}
              disabled={!previewCue}
              title="Probar final en Preview (-10s antes de OUT)"
            >
              <span>-10s</span>
            </button>
            <button
              className={`ctrl-btn ${prvAudition ? 'active-amber' : ''}`}
              onClick={onTogglePrvAudition}
              disabled={!previewCue}
              title="Escuchar audio de Preview (Audition)"
            >
              {prvAudition ? <Volume2 size={14} /> : <VolumeX size={14} />}
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
          title="Lanzar Preview a Program con transición (ENTER / F1)"
        >
          <ArrowRightLeft size={20} />
          <span className="take-title">TAKE</span>
          <span className="take-sub">
            {transitionType.toUpperCase()} ({transitionDuration.toFixed(1)}s)
          </span>
        </button>

        <button
          className="cut-direct-btn"
          onClick={onCutImmediate}
          disabled={!previewCue}
          title="Corte directo instantáneo a Program (F2)"
        >
          <Zap size={15} />
          <span>CUT DIRECTO</span>
        </button>

        {/* Transition Progress Bar */}
        <div className="trans-progress-wrap" title="Progreso de transición A/B">
          <div
            className="trans-progress-fill"
            style={{ width: `${Math.round(transitionProgress * 100)}%` }}
          />
        </div>

        {/* Transition Type Selector */}
        <div className="bridge-section">
          <div className="bridge-label">TRANSICIÓN</div>
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
            title="Blackout / Fade to Black en salida (Tecla B)"
          >
            <EyeOff size={15} />
            <span>BLACKOUT</span>
          </button>

          <button
            className={`override-btn freeze-btn ${isFrozen ? 'active' : ''}`}
            onClick={onToggleFreeze}
            title="Congelar imagen de salida (Tecla F)"
          >
            <Snowflake size={15} />
            <span>FREEZE</span>
          </button>

          <button
            className={`override-btn pattern-btn ${isTestPattern ? 'active' : ''}`}
            onClick={onToggleTestPattern}
            title="Enviar Carta de Ajuste SMPTE 1080p a Salida"
          >
            <Tv size={15} />
            <span>CARTA AJUSTE</span>
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
              PROGRAM (PGM) {pgmPlaying ? '• ON AIR' : '• STANDBY'}
            </div>
            <div className="monitor-clip-title">
              {programCue ? (
                <>
                  <span className="cue-num-pill pgm-pill">#{programCue.cueNumber}</span>
                  <span className="truncate">{programCue.name}</span>
                  <span
                    className="end-action-chip"
                    style={{ borderColor: END_ACTION_LABELS[programCue.endAction].color }}
                  >
                    FIN: {END_ACTION_LABELS[programCue.endAction].short}
                  </span>
                </>
              ) : (
                <span className="text-muted">Sin clip en aire</span>
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

          {/* Program Dual-Deck Viewport */}
          <div className="monitor-viewport pgm-viewport">
            <video
              ref={pgmVideoARef}
              playsInline
              crossOrigin="anonymous"
              style={getDeckStyle(deckA, 'A')}
            />
            <video
              ref={pgmVideoBRef}
              playsInline
              crossOrigin="anonymous"
              style={getDeckStyle(deckB, 'B')}
            />

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
              (mosaicConfig.mode === 'horizontal_2x1' || mosaicConfig.mode === 'vertical_1x2') && (
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
                <span>BLACKOUT ACTIVO (SALIDA EN NEGRO)</span>
              </div>
            )}

            {isFrozen && !isBlackout && (
              <div className="freeze-viewport-banner">
                <Snowflake size={14} />
                <span>SALIDA CONGELADA (FREEZE)</span>
              </div>
            )}

            {!programCue && !isTestPattern && (
              <div className="empty-viewport">
                <span>PROGRAM EN NEGRO</span>
                <small>Pulsa TAKE o barra espaciadora para lanzar vídeo</small>
              </div>
            )}

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
                title="Play / Pausa Program (ESPACIO)"
              >
                {pgmPlaying ? <Pause size={15} /> : <Play size={15} />}
                <span>{pgmPlaying ? 'PAUSAR PGM' : 'PLAY PGM'}</span>
              </button>
              <button
                className="ctrl-btn"
                onClick={onRestartPgm}
                disabled={!programCue}
                title="Volver al punto IN del clip en aire (Tecla R)"
              >
                <RotateCcw size={14} />
                <span>INICIO</span>
              </button>
            </div>

            {/* Mitti / PlaybackPro+ Signature Goto -10s / -20s / -30s */}
            <div className="btn-group">
              <button
                className="ctrl-btn goto-end-btn"
                onClick={() => onPgmGotoEnd(30)}
                disabled={!programCue}
                title="Saltar a 30 segundos antes del punto OUT"
              >
                <FastForward size={13} />
                <span>-30s</span>
              </button>
              <button
                className="ctrl-btn goto-end-btn"
                onClick={() => onPgmGotoEnd(20)}
                disabled={!programCue}
                title="Saltar a 20 segundos antes del punto OUT"
              >
                <span>-20s</span>
              </button>
              <button
                className="ctrl-btn goto-end-btn highlight-goto"
                onClick={() => onPgmGotoEnd(10)}
                disabled={!programCue}
                title="Saltar a 10 segundos antes del punto OUT (Tecla T)"
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
                title="Al terminar: Congelar último fotograma (Hold)"
              >
                <span>HOLD</span>
              </button>
              <button
                className={`ctrl-btn ${programCue?.endAction === 'black' ? 'active-slate' : ''}`}
                onClick={() => onChangePgmEndAction('black')}
                disabled={!programCue}
                title="Al terminar: Ir a Negro (Black)"
              >
                <span>BLACK</span>
              </button>
              <button
                className={`ctrl-btn ${programCue?.endAction === 'loop' ? 'active-emerald' : ''}`}
                onClick={() => onChangePgmEndAction('loop')}
                disabled={!programCue}
                title="Al terminar: Bucle infinito (Tecla L)"
              >
                <Repeat size={13} />
                <span>LOOP</span>
              </button>
              <button
                className={`ctrl-btn ${programCue?.endAction === 'next' ? 'active-amber' : ''}`}
                onClick={() => onChangePgmEndAction('next')}
                disabled={!programCue}
                title="Al terminar: Lanzar siguiente vídeo automáticamente"
              >
                <SkipForward size={13} />
                <span>NEXT</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= STEREO VU METER & MASTER AUDIO RACK ================= */}
        <div className="audio-master-rack">
          <div className="rack-title">PGM AUDIO</div>
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
              <span>0</span>
              <span>-6</span>
              <span>-12</span>
              <span>-24</span>
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

            {/* Master Fader */}
            <div className="master-fader-col">
              <input
                type="range"
                className="vertical-fader"
                min={0}
                max={125}
                step={1}
                value={isMasterMuted ? 0 : masterVolume}
                onChange={(e) => onChangeMasterVolume(parseInt(e.target.value, 10))}
                title={`Volumen Master: ${masterVolume}%`}
              />
              <span className="fader-val">{isMasterMuted ? 'MUTE' : `${masterVolume}%`}</span>
            </div>
          </div>

          <button
            className={`master-mute-btn ${isMasterMuted ? 'muted' : ''}`}
            onClick={onToggleMasterMute}
            title="Silenciar Salida Master (Tecla M)"
          >
            {isMasterMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{isMasterMuted ? 'MUTED' : 'MASTER'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
