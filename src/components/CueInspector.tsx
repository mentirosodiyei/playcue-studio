import React, { useState } from 'react';
import {
  Sliders,
  Scissors,
  Volume2,
  Monitor,
  FileVideo,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Link,
  CheckCircle2,
  CopyCheck,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import {
  VideoCue,
  EndAction,
  ScaleMode,
  AspectRatioMode,
  TransitionType,
  ConvertVideoOptions,
  HardwareProfileInfo,
} from '../types/cue';
import {
  formatTimecode,
  formatBytes,
  gainToDbString,
} from '../utils/timecode';
import { ASPECT_RATIO_OPTIONS, computeVideoBox } from '../utils/videoGeometry';

interface CueInspectorProps {
  cue: VideoCue | null;
  prvCurrentTime: number;
  totalCanvasWidth?: number;
  totalCanvasHeight?: number;
  hardwareInfo?: HardwareProfileInfo | null;
  onUpdateCue: (id: string, patch: Partial<VideoCue>) => void;
  onApplyGeometryToAllCues?: (sourceCue: VideoCue) => void;
  onOptimizeProxy: (cue: VideoCue, options?: ConvertVideoOptions) => void;
  onRelinkCue: (cue: VideoCue) => void;
}

export const CueInspector: React.FC<CueInspectorProps> = ({
  cue,
  prvCurrentTime,
  totalCanvasWidth = 2560,
  totalCanvasHeight = 1440,
  hardwareInfo,
  onUpdateCue,
  onApplyGeometryToAllCues,
  onOptimizeProxy,
  onRelinkCue,
}) => {
  const [activeTab, setActiveTab] = useState<'video' | 'time' | 'audio' | 'file'>('video');

  // Video & Audio Codec Conversion Settings State
  const [convCodec, setConvCodec] = useState<ConvertVideoOptions['targetCodec']>('h264');
  const [convQuality, setConvQuality] = useState<ConvertVideoOptions['quality']>('high');
  const [convRes, setConvRes] = useState<ConvertVideoOptions['resolution']>('original');
  const [convAudioCodec, setConvAudioCodec] =
    useState<ConvertVideoOptions['audioCodec']>('aac_320');
  const [convAudioSampleRate, setConvAudioSampleRate] =
    useState<ConvertVideoOptions['audioSampleRate']>(48000);
  const [convAudioChannels, setConvAudioChannels] =
    useState<ConvertVideoOptions['audioChannels']>('2');
  const [convAudioNormalize, setConvAudioNormalize] = useState<boolean>(false);

  if (!cue) {
    return (
      <div className="inspector-panel empty">
        <Sliders size={26} strokeWidth={1.4} />
        <h4>AJUSTES DEL VÍDEO</h4>
        <p>Selecciona un vídeo en el Cue List para configurar AR, posición, recorte, audio y códec.</p>
      </div>
    );
  }

  const outVal = cue.outPoint > cue.inPoint ? cue.outPoint : cue.duration;
  const zoomVal = cue.zoom ?? 100;
  const scaleXVal = cue.scaleX ?? 100;
  const scaleYVal = cue.scaleY ?? 100;
  const offsetXVal = cue.offsetX ?? 0;
  const offsetYVal = cue.offsetY ?? 0;
  const arVal = cue.aspectRatio ?? 'native';
  const bgBlurOn = !!cue.bgBlurEnabled;
  const bgBlurAmount = cue.bgBlurAmount ?? 90;
  const bgBlurBrightness = cue.bgBlurBrightness ?? 75;
  const bgBlurZoom = cue.bgBlurZoom ?? 125;

  const computedBox = computeVideoBox({
    scaleMode: cue.scaleMode,
    aspectRatio: arVal,
    zoom: zoomVal,
    scaleX: scaleXVal,
    scaleY: scaleYVal,
    offsetX: offsetXVal,
    offsetY: offsetYVal,
    canvasWidth: totalCanvasWidth,
    canvasHeight: totalCanvasHeight,
    videoWidth: cue.width || 1920,
    videoHeight: cue.height || 1080,
  });

  // Clip gain slider with magnetic snap at 0.0 dB (100%)
  const handleClipGainChange = (rawVal: number) => {
    const snapped = rawVal >= 96 && rawVal <= 104 ? 100 : rawVal;
    onUpdateCue(cue.id, { volume: snapped });
  };

  const audioSummaryText =
    cue.audioChannels > 0
      ? `${cue.audioCodec.toUpperCase()}${
          cue.audioProfile && cue.audioProfile !== cue.audioCodec ? ` (${cue.audioProfile})` : ''
        } • ${cue.audioChannels}ch (${
          cue.audioChannelLayout || (cue.audioChannels === 2 ? 'stereo' : 'mono')
        }) • ${Math.round((cue.audioSampleRate || 48000) / 1000)} kHz${
          cue.audioBitrateKbps ? ` • ${cue.audioBitrateKbps} kbps` : ''
        }`
      : 'SIN PISTA DE AUDIO (MUDO)';

  return (
    <div className="inspector-panel">
      {/* Inspector Header */}
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className="inspector-badge">AJUSTES DE VÍDEO</span>
          <span className="inspector-cue-tag">#{cue.cueNumber}</span>
        </div>
        <div className="inspector-clip-name truncate" title={cue.name}>
          {cue.name}
        </div>

        {/* Inspector Sub-Tabs */}
        <div className="inspector-tabs">
          <button
            className={activeTab === 'video' ? 'active' : ''}
            onClick={() => setActiveTab('video')}
          >
            <Monitor size={12} />
            <span>Vídeo</span>
          </button>
          <button
            className={activeTab === 'time' ? 'active' : ''}
            onClick={() => setActiveTab('time')}
          >
            <Scissors size={12} />
            <span>Tiempo</span>
          </button>
          <button
            className={activeTab === 'audio' ? 'active' : ''}
            onClick={() => setActiveTab('audio')}
          >
            <Volume2 size={12} />
            <span>Audio</span>
          </button>
          <button
            className={activeTab === 'file' ? 'active' : ''}
            onClick={() => setActiveTab('file')}
          >
            <FileVideo size={12} />
            <span>Códec</span>
          </button>
        </div>
      </div>

      <div className="inspector-body">
        {/* ================= TAB 1: VIDEO, AR, NUMERIC GEOMETRY, CODEC INFO & BLUR AT BOTTOM ================= */}
        {activeTab === 'video' && (
          <div className="insp-section-stack">
            {/* 1. Screen Fit & Aspect Ratio (AR) + Numeric Window Controls */}
            <div className="insp-group">
              <label className="insp-label">AJUSTE A PANTALLA Y RELACIÓN DE ASPECTO (AR)</label>
              <div className="pill-row">
                {(
                  [
                    { id: 'fit', label: 'FIT (Ajustar)' },
                    { id: 'fill', label: 'FILL (Llenar)' },
                    { id: 'stretch', label: 'STRETCH (Estirar)' },
                  ] as { id: ScaleMode; label: string }[]
                ).map((s) => (
                  <button
                    key={s.id}
                    className={`mini-pill ${cue.scaleMode === s.id ? 'selected' : ''}`}
                    onClick={() => onUpdateCue(cue.id, { scaleMode: s.id })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 8 }}>
                <small className="insp-sub-label">Preajustes de Relación de Aspecto (AR):</small>
                <div className="pill-row" style={{ marginTop: 4 }}>
                  {(
                    [
                      'native',
                      'output',
                      '16:9',
                      '16:10',
                      '4:3',
                      '21:9',
                      '32:9',
                      '9:16',
                      '1:1',
                    ] as AspectRatioMode[]
                  ).map((ar) => {
                    const opt = ASPECT_RATIO_OPTIONS.find((o) => o.id === ar);
                    return (
                      <button
                        key={ar}
                        className={`mini-pill ${arVal === ar ? 'selected' : ''}`}
                        onClick={() => onUpdateCue(cue.id, { aspectRatio: ar })}
                      >
                        {opt?.shortLabel || ar}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Numeric Geometry Controls (Synced with Mouse Drag & 4 Corners) */}
              <div className="numeric-geometry-panel">
                <div className="insp-label-flex" style={{ marginBottom: 6 }}>
                  <small className="insp-sub-label">
                    Tamaño y Posición de Ventana (Ratón / Numérico):
                  </small>
                  <span className="px-readout">
                    {computedBox.pixelWidth}×{computedBox.pixelHeight} px
                  </span>
                </div>

                <div className="num-grid-2x2">
                  <div className="num-field">
                    <label>Escala H (Ancho %)</label>
                    <input
                      type="number"
                      className="insp-input"
                      min={10}
                      max={400}
                      step={1}
                      value={scaleXVal}
                      onChange={(e) =>
                        onUpdateCue(cue.id, {
                          scaleX: Math.max(10, Math.min(400, parseFloat(e.target.value) || 100)),
                        })
                      }
                    />
                  </div>

                  <div className="num-field">
                    <label>Escala V (Alto %)</label>
                    <input
                      type="number"
                      className="insp-input"
                      min={10}
                      max={400}
                      step={1}
                      value={scaleYVal}
                      onChange={(e) =>
                        onUpdateCue(cue.id, {
                          scaleY: Math.max(10, Math.min(400, parseFloat(e.target.value) || 100)),
                        })
                      }
                    />
                  </div>

                  <div className="num-field">
                    <label>Posición X (%)</label>
                    <input
                      type="number"
                      className="insp-input"
                      min={-100}
                      max={100}
                      step={0.5}
                      value={offsetXVal}
                      onChange={(e) =>
                        onUpdateCue(cue.id, {
                          offsetX: Math.max(-100, Math.min(100, parseFloat(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>

                  <div className="num-field">
                    <label>Posición Y (%)</label>
                    <input
                      type="number"
                      className="insp-input"
                      min={-100}
                      max={100}
                      step={0.5}
                      value={offsetYVal}
                      onChange={(e) =>
                        onUpdateCue(cue.id, {
                          offsetY: Math.max(-100, Math.min(100, parseFloat(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="insp-label-flex">
                    <small className="insp-sub-label">Zoom General Uniforme (%)</small>
                    <input
                      type="number"
                      className="insp-input compact-num"
                      min={20}
                      max={300}
                      step={1}
                      value={zoomVal}
                      onChange={(e) =>
                        onUpdateCue(cue.id, {
                          zoom: Math.max(20, Math.min(300, parseFloat(e.target.value) || 100)),
                        })
                      }
                    />
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={300}
                    step={1}
                    value={zoomVal}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { zoom: parseInt(e.target.value, 10) })
                    }
                  />
                </div>

                <div className="pill-row" style={{ marginTop: 8 }}>
                  <button
                    className="mini-action-btn"
                    onClick={() =>
                      onUpdateCue(cue.id, {
                        zoom: 100,
                        scaleX: 100,
                        scaleY: 100,
                        offsetX: 0,
                        offsetY: 0,
                        aspectRatio: 'native',
                        scaleMode: 'fit',
                      })
                    }
                  >
                    <RotateCcw size={11} /> Resetear Ventana
                  </button>
                  {onApplyGeometryToAllCues && (
                    <button
                      className="mini-action-btn accent-link"
                      onClick={() => onApplyGeometryToAllCues(cue)}
                      title="Copia estos ajustes de ventana, AR y fondo blur a todos los vídeos del Cue List"
                    >
                      <CopyCheck size={11} /> Aplicar a Todos
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Video & Audio Codec Info Summary inside Video Tab */}
            <div className="insp-group">
              <label className="insp-label">INFORMACIÓN DE CÓDEC (VÍDEO Y AUDIO)</label>
              <div className="codec-spec-grid">
                <div>
                  <span>Códec Vídeo</span>
                  <strong>
                    {cue.videoCodec.toUpperCase()} • {cue.width}×{cue.height} @ {cue.fps}fps
                  </strong>
                </div>
                <div>
                  <span>Códec Audio</span>
                  <strong className={cue.audioChannels > 0 ? 'emerald-text' : 'text-muted'}>
                    {audioSummaryText}
                  </strong>
                </div>
              </div>
            </div>

            {/* 2. Rotation & Flip */}
            <div className="insp-group">
              <label className="insp-label">ROTACIÓN Y ESPEJO</label>
              <div className="pill-row">
                {([0, 90, 180, 270] as const).map((deg) => (
                  <button
                    key={deg}
                    className={`mini-pill ${cue.rotation === deg ? 'selected' : ''}`}
                    onClick={() => onUpdateCue(cue.id, { rotation: deg })}
                  >
                    <RotateCw size={11} /> {deg}°
                  </button>
                ))}
                <button
                  className={`mini-pill ${cue.flipH ? 'selected' : ''}`}
                  onClick={() => onUpdateCue(cue.id, { flipH: !cue.flipH })}
                >
                  <FlipHorizontal size={12} /> H
                </button>
                <button
                  className={`mini-pill ${cue.flipV ? 'selected' : ''}`}
                  onClick={() => onUpdateCue(cue.id, { flipV: !cue.flipV })}
                >
                  <FlipVertical size={12} /> V
                </button>
              </div>
            </div>

            {/* 3. Transition & Opacity / Fades */}
            <div className="insp-group">
              <label className="insp-label">TRANSICIÓN Y FUNDIDOS DE VÍDEO</label>
              <div className="insp-row-2col">
                <select
                  className="insp-select"
                  value={cue.transitionType}
                  onChange={(e) =>
                    onUpdateCue(cue.id, {
                      transitionType: e.target.value as TransitionType,
                    })
                  }
                >
                  <option value="cut">Cut (Corte 0s)</option>
                  <option value="dissolve">Cross Dissolve (Mix)</option>
                  <option value="dipToBlack">Dip to Black</option>
                  <option value="wipe">Wipe Horizontal</option>
                </select>
                <input
                  type="number"
                  className="insp-input"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={cue.transitionDuration}
                  onChange={(e) =>
                    onUpdateCue(cue.id, {
                      transitionDuration: Math.max(0.1, parseFloat(e.target.value) || 1),
                    })
                  }
                />
              </div>

              <div className="insp-row-2col" style={{ marginTop: 8 }}>
                <div>
                  <small>Fade In Vídeo ({cue.videoFadeIn.toFixed(1)}s)</small>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={0.2}
                    value={cue.videoFadeIn}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { videoFadeIn: parseFloat(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <small>Fade Out Vídeo ({cue.videoFadeOut.toFixed(1)}s)</small>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={0.2}
                    value={cue.videoFadeOut}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { videoFadeOut: parseFloat(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>

            {/* 4. AT THE VERY BOTTOM: Background Blur Layer */}
            <div className={`insp-group blur-layer-box ${bgBlurOn ? 'active' : ''}`}>
              <div className="insp-label-flex">
                <label className="insp-label">CAPA DE FONDO CON BLUR</label>
                <span className={`status-pill ${bgBlurOn ? 'on' : 'off'}`}>
                  {bgBlurOn ? `${bgBlurAmount}% ON` : 'OFF'}
                </span>
              </div>

              <button
                className={`full-width-btn blur-master-toggle ${bgBlurOn ? 'active' : ''}`}
                onClick={() =>
                  onUpdateCue(cue.id, {
                    bgBlurEnabled: !bgBlurOn,
                    bgBlurAmount: cue.bgBlurAmount ?? 90,
                    bgBlurBrightness: cue.bgBlurBrightness ?? 75,
                    bgBlurZoom: cue.bgBlurZoom ?? 125,
                  })
                }
              >
                <span>
                  {bgBlurOn
                    ? 'Desactivar Capa de Fondo con Blur'
                    : 'Generar Capa de Fondo con Blur (90%)'}
                </span>
              </button>

              {bgBlurOn && (
                <div className="blur-sliders-stack">
                  <div className="insp-label-flex" style={{ marginTop: 6 }}>
                    <small>Nivel de Blur ({bgBlurAmount}%)</small>
                    <input
                      type="number"
                      className="insp-input compact-num"
                      min={10}
                      max={100}
                      step={5}
                      value={bgBlurAmount}
                      onChange={(e) =>
                        onUpdateCue(cue.id, {
                          bgBlurAmount: Math.max(10, Math.min(100, parseInt(e.target.value, 10) || 90)),
                        })
                      }
                    />
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={bgBlurAmount}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { bgBlurAmount: parseInt(e.target.value, 10) })
                    }
                  />

                  <div className="insp-row-2col" style={{ marginTop: 6 }}>
                    <div>
                      <small>Brillo Fondo ({bgBlurBrightness}%)</small>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        step={5}
                        value={bgBlurBrightness}
                        onChange={(e) =>
                          onUpdateCue(cue.id, {
                            bgBlurBrightness: parseInt(e.target.value, 10),
                          })
                        }
                      />
                    </div>
                    <div>
                      <small>Escala Fondo ({bgBlurZoom}%)</small>
                      <input
                        type="range"
                        min={105}
                        max={200}
                        step={5}
                        value={bgBlurZoom}
                        onChange={(e) =>
                          onUpdateCue(cue.id, {
                            bgBlurZoom: parseInt(e.target.value, 10),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: TIME & TRIM ================= */}
        {activeTab === 'time' && (
          <div className="insp-section-stack">
            {/* In / Out Trim */}
            <div className="insp-group">
              <label className="insp-label">RECORTE IN / OUT (TRIM)</label>
              <div className="trim-box">
                <div className="trim-line">
                  <span>IN: {formatTimecode(cue.inPoint, cue.fps, true)}</span>
                  <button
                    className="mini-action-btn"
                    onClick={() =>
                      onUpdateCue(cue.id, {
                        inPoint: Math.min(prvCurrentTime, outVal - 0.1),
                      })
                    }
                  >
                    Capturar PRV
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={cue.duration || 100}
                  step={0.04}
                  value={cue.inPoint}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val < outVal - 0.1) {
                      onUpdateCue(cue.id, { inPoint: val });
                    }
                  }}
                />

                <div className="trim-line" style={{ marginTop: 8 }}>
                  <span>OUT: {formatTimecode(outVal, cue.fps, true)}</span>
                  <button
                    className="mini-action-btn"
                    onClick={() =>
                      onUpdateCue(cue.id, {
                        outPoint: Math.max(prvCurrentTime, cue.inPoint + 0.1),
                      })
                    }
                  >
                    Capturar PRV
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={cue.duration || 100}
                  step={0.04}
                  value={outVal}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val > cue.inPoint + 0.1) {
                      onUpdateCue(cue.id, { outPoint: val });
                    }
                  }}
                />

                <div className="trim-summary-footer">
                  <span>
                    Duración efectiva:{' '}
                    <strong>
                      {formatTimecode(
                        (outVal - cue.inPoint) / (cue.playbackRate || 1),
                        cue.fps
                      )}
                    </strong>
                  </span>
                  <button
                    className="mini-action-btn"
                    onClick={() =>
                      onUpdateCue(cue.id, { inPoint: 0, outPoint: cue.duration })
                    }
                  >
                    Resetear In/Out
                  </button>
                </div>
              </div>
            </div>

            {/* End Action */}
            <div className="insp-group">
              <label className="insp-label">ACCIÓN AL TERMINAR (END ACTION)</label>
              <select
                className="insp-select"
                value={cue.endAction}
                onChange={(e) =>
                  onUpdateCue(cue.id, { endAction: e.target.value as EndAction })
                }
              >
                <option value="hold">HOLD — Congelar en último fotograma</option>
                <option value="black">BLACK — Ir a negro al terminar</option>
                <option value="loop">LOOP — Bucle infinito entre In y Out</option>
                <option value="next">PLAY NEXT — Encadenar con el siguiente vídeo</option>
                <option value="stop">STOP — Detener y limpiar salida</option>
              </select>
            </div>

            {/* Playback Speed */}
            <div className="insp-group">
              <label className="insp-label">VELOCIDAD DE REPRODUCCIÓN ({cue.playbackRate}x)</label>
              <div className="pill-row">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    className={`mini-pill ${cue.playbackRate === spd ? 'selected' : ''}`}
                    onClick={() => onUpdateCue(cue.id, { playbackRate: spd })}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: AUDIO (WITH SNAP AT 0.0 dB) ================= */}
        {activeTab === 'audio' && (
          <div className="insp-section-stack">
            <div className="insp-group">
              <label className="insp-label">PISTA DE AUDIO DETECTADA</label>
              <div className="codec-spec-grid">
                <div>
                  <span>Códec de Audio</span>
                  <strong className={cue.audioChannels > 0 ? 'emerald-text' : ''}>
                    {cue.audioChannels > 0
                      ? `${cue.audioCodec.toUpperCase()}${
                          cue.audioProfile && cue.audioProfile !== cue.audioCodec
                            ? ` (${cue.audioProfile})`
                            : ''
                        }`
                      : 'Sin Audio'}
                  </strong>
                </div>
                <div>
                  <span>Canales / Sample Rate</span>
                  <strong>
                    {cue.audioChannels > 0
                      ? `${cue.audioChannels}ch (${cue.audioChannelLayout || 'stereo'}) @ ${Math.round(
                          (cue.audioSampleRate || 48000) / 1000
                        )}kHz`
                      : '0 canales'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="insp-group">
              <div className="insp-label-flex">
                <label className="insp-label">GANANCIA DEL CLIP (SNAP EN 0 dB)</label>
                <span className={`db-readout ${cue.volume === 100 && !cue.muted ? 'zero-db' : ''}`}>
                  {gainToDbString(cue.volume, cue.muted)}
                </span>
              </div>
              <div className="slider-with-zero-mark">
                <div
                  className="horizontal-zero-tick"
                  style={{ left: `${(100 / 150) * 100}%` }}
                  title="0.0 dB (100%)"
                />
                <input
                  type="range"
                  min={0}
                  max={150}
                  step={1}
                  value={cue.volume}
                  onChange={(e) => handleClipGainChange(parseInt(e.target.value, 10))}
                  onDoubleClick={() => onUpdateCue(cue.id, { volume: 100 })}
                />
              </div>
              <div className="pill-row" style={{ marginTop: 6 }}>
                <button
                  className={`mini-pill ${cue.muted ? 'selected-danger' : ''}`}
                  onClick={() => onUpdateCue(cue.id, { muted: !cue.muted })}
                >
                  {cue.muted ? 'MUTE ACTIVO' : 'SILENCIAR (MUTE)'}
                </button>
                <button
                  className={`mini-pill ${cue.volume === 100 && !cue.muted ? 'selected' : ''}`}
                  onClick={() => onUpdateCue(cue.id, { volume: 100, muted: false })}
                >
                  0.0 dB (100%)
                </button>
                <button
                  className="mini-pill"
                  onClick={() => onUpdateCue(cue.id, { volume: 71 })}
                >
                  -3.0 dB
                </button>
                <button
                  className="mini-pill"
                  onClick={() => onUpdateCue(cue.id, { volume: 50 })}
                >
                  -6.0 dB
                </button>
              </div>
            </div>

            <div className="insp-group">
              <div className="insp-label-flex">
                <label className="insp-label">AUDIO FADE IN (ENTRADA)</label>
                <span>{cue.audioFadeIn.toFixed(1)} s</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.2}
                value={cue.audioFadeIn}
                onChange={(e) =>
                  onUpdateCue(cue.id, { audioFadeIn: parseFloat(e.target.value) })
                }
              />
            </div>

            <div className="insp-group">
              <div className="insp-label-flex">
                <label className="insp-label">AUDIO FADE OUT (SALIDA)</label>
                <span>{cue.audioFadeOut.toFixed(1)} s</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.2}
                value={cue.audioFadeOut}
                onChange={(e) =>
                  onUpdateCue(cue.id, { audioFadeOut: parseFloat(e.target.value) })
                }
              />
            </div>
          </div>
        )}

        {/* ================= TAB 4: CODEC DETECTION (VIDEO + AUDIO) & CONVERTIR ================= */}
        {activeTab === 'file' && (
          <div className="insp-section-stack">
            {hardwareInfo && (
              <div className="insp-group">
                <label className="insp-label">HARDWARE DEL SISTEMA (PRIORIDAD GPU ACTIVA)</label>
                <div className="proxy-ready-box" style={{ marginBottom: 6 }}>
                  <CheckCircle2 size={14} />
                  <div>
                    <strong>
                      {hardwareInfo.selectedGpuName}{' '}
                      <span className="emerald-text">
                        (
                        {hardwareInfo.selectedGpuTier === 'discrete'
                          ? 'GPU Dedicada • Máxima Potencia'
                          : hardwareInfo.selectedGpuTier === 'integrated'
                          ? 'GPU Integrada'
                          : 'Software'}
                        )
                      </span>
                    </strong>
                    <small style={{ display: 'block' }}>
                      Reproducción: {hardwareInfo.playbackDecoderLabel} • Conversión:{' '}
                      {hardwareInfo.preferredEncoderLabel}
                    </small>
                    {hardwareInfo.gpus.length > 1 && (
                      <small style={{ display: 'block', opacity: 0.8, marginTop: 2 }}>
                        GPUs detectadas ({hardwareInfo.gpus.length}):{' '}
                        {hardwareInfo.gpus
                          .map((g) => `${g.name}${g.isSelected ? ' [ACTIVA]' : ''}`)
                          .join(' / ')}
                      </small>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="insp-group">
              <label className="insp-label">DETECCIÓN DE CÓDEC DE VÍDEO Y AUDIO</label>
              <div className="codec-spec-grid">
                <div>
                  <span>Códec de Vídeo</span>
                  <strong>
                    {cue.videoCodec.toUpperCase()}
                    {cue.videoProfile ? ` (${cue.videoProfile})` : ''}
                  </strong>
                </div>
                <div>
                  <span>Resolución y FPS</span>
                  <strong>
                    {cue.width}×{cue.height} @ {cue.fps}fps
                  </strong>
                </div>
                <div>
                  <span>Códec de Audio</span>
                  <strong className={cue.audioChannels > 0 ? 'emerald-text' : 'text-muted'}>
                    {cue.audioChannels > 0
                      ? `${cue.audioCodec.toUpperCase()}${
                          cue.audioProfile && cue.audioProfile !== cue.audioCodec
                            ? ` (${cue.audioProfile})`
                            : ''
                        }`
                      : 'SIN AUDIO'}
                  </strong>
                </div>
                <div>
                  <span>Canales / Muestreo Audio</span>
                  <strong>
                    {cue.audioChannels > 0
                      ? `${cue.audioChannels}ch (${
                          cue.audioChannelLayout || 'stereo'
                        }) • ${Math.round((cue.audioSampleRate || 48000) / 1000)}kHz${
                          cue.audioBitrateKbps ? ` • ${cue.audioBitrateKbps}kbps` : ''
                        }`
                      : '0 canales'}
                  </strong>
                </div>
                <div>
                  <span>Contenedor / Pixel</span>
                  <strong>
                    {cue.container} • {cue.pixelFormat || 'yuv420p'}
                  </strong>
                </div>
                <div>
                  <span>Tamaño / Bitrate Total</span>
                  <strong>
                    {formatBytes(cue.fileSize)}
                    {cue.bitrateKbps ? ` (${(cue.bitrateKbps / 1000).toFixed(1)} Mbps)` : ''}
                  </strong>
                </div>
              </div>

              <div className="proxy-ready-box" style={{ marginTop: 6 }}>
                <CheckCircle2 size={14} />
                <div>
                  <strong>Pack Universal de Códecs de Audio FFmpeg Activo</strong>
                  <small>
                    Decodifica AAC, MP3, PCM 16/24/32-bit, AC-3, E-AC-3, DTS, MP2, ALAC, FLAC, Opus y WMA
                  </small>
                </div>
              </div>
            </div>

            {/* CONVERTIR Section with Video + Audio Codec Conversion Settings */}
            <div className="insp-group">
              <label className="insp-label">CONVERTIR (VÍDEO Y AUDIO)</label>

              <div className="convert-settings-stack">
                <div>
                  <small className="insp-sub-label">Códec de Vídeo:</small>
                  <select
                    className="insp-select"
                    value={convCodec}
                    onChange={(e) =>
                      setConvCodec(e.target.value as ConvertVideoOptions['targetCodec'])
                    }
                  >
                    <option value="copy_video">
                      Solo Convertir Audio (Copiar Vídeo intacto - Ultra Rápido)
                    </option>
                    <option value="h264">H.264 Broadcast (MP4 • GOP Corto)</option>
                    <option value="h264_intra">H.264 ALL-I Intra-Frame (Scrubbing Exacto)</option>
                    <option value="hevc">H.265 / HEVC (MP4 • Alta Eficiencia)</option>
                    <option value="prores">Apple ProRes 422 (MOV • Producción)</option>
                  </select>
                </div>

                {convCodec !== 'copy_video' && (
                  <div className="insp-row-2col" style={{ marginTop: 6 }}>
                    <div>
                      <small className="insp-sub-label">Calidad Vídeo:</small>
                      <select
                        className="insp-select"
                        value={convQuality}
                        onChange={(e) =>
                          setConvQuality(e.target.value as ConvertVideoOptions['quality'])
                        }
                      >
                        <option value="high">Alta (Broadcast)</option>
                        <option value="medium">Media (Estándar)</option>
                        <option value="light">Ligera (Proxy)</option>
                      </select>
                    </div>

                    <div>
                      <small className="insp-sub-label">Resolución:</small>
                      <select
                        className="insp-select"
                        value={convRes}
                        onChange={(e) =>
                          setConvRes(e.target.value as ConvertVideoOptions['resolution'])
                        }
                      >
                        <option value="original">Original ({cue.width}×{cue.height})</option>
                        <option value="1080p">1080p (1920×1080)</option>
                        <option value="720p">720p (1280×720)</option>
                      </select>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 8 }}>
                  <small className="insp-sub-label">Conversión de Códec de Audio:</small>
                  <select
                    className="insp-select"
                    value={convAudioCodec}
                    onChange={(e) =>
                      setConvAudioCodec(e.target.value as ConvertVideoOptions['audioCodec'])
                    }
                  >
                    <option value="aac_320">AAC 320 kbps (Estéreo Broadcast Universal)</option>
                    <option value="aac_192">AAC 192 kbps (Estándar Compatible)</option>
                    <option value="pcm_s16le">PCM 16-bit Sin Compresión (WAV / MOV)</option>
                    <option value="pcm_s24le">PCM 24-bit Studio Master (MOV)</option>
                    <option value="mp3_320">MP3 320 kbps (CBR Alta Compatibilidad)</option>
                    <option value="copy_audio">Copiar Audio Original (Pass-through)</option>
                    <option value="mute_audio">Eliminar Pista de Audio (Dejar Mudo)</option>
                  </select>
                </div>

                {convAudioCodec !== 'mute_audio' && convAudioCodec !== 'copy_audio' && (
                  <>
                    <div className="insp-row-2col" style={{ marginTop: 6 }}>
                      <div>
                        <small className="insp-sub-label">Muestreo Audio:</small>
                        <select
                          className="insp-select"
                          value={convAudioSampleRate}
                          onChange={(e) =>
                            setConvAudioSampleRate(
                              Number(e.target.value) as ConvertVideoOptions['audioSampleRate']
                            )
                          }
                        >
                          <option value={48000}>48.0 kHz (Broadcast)</option>
                          <option value={44100}>44.1 kHz</option>
                        </select>
                      </div>

                      <div>
                        <small className="insp-sub-label">Canales Audio:</small>
                        <select
                          className="insp-select"
                          value={convAudioChannels}
                          onChange={(e) =>
                            setConvAudioChannels(
                              e.target.value as ConvertVideoOptions['audioChannels']
                            )
                          }
                        >
                          <option value="2">Estéreo 2.0 (Downmix 5.1→2.0)</option>
                          <option value="1">Mono 1.0</option>
                          <option value="original">Original ({cue.audioChannels}ch)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className={`mini-pill ${convAudioNormalize ? 'selected' : ''}`}
                        style={{ width: '100%', padding: '5px 8px' }}
                        onClick={() => setConvAudioNormalize((v) => !v)}
                      >
                        {convAudioNormalize
                          ? '✓ Normalizar Volumen Broadcast EBU R128 (-16 LUFS) ACTIVO'
                          : 'Normalizar Volumen Broadcast EBU R128 (-16 LUFS)'}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {cue.proxyPath && (
                <div className="proxy-ready-box" style={{ marginTop: 8 }}>
                  <CheckCircle2 size={14} />
                  <div>
                    <strong>Versión Convertida / Audio Optimizado Activo</strong>
                    <small className="truncate" style={{ display: 'block', maxWidth: 230 }}>
                      {cue.proxyPath}
                    </small>
                  </div>
                </div>
              )}

              <button
                className="full-width-btn primary-convert-btn"
                style={{ marginTop: 8 }}
                onClick={() =>
                  onOptimizeProxy(cue, {
                    targetCodec: convCodec,
                    quality: convQuality,
                    resolution: convRes,
                    audioCodec: convAudioCodec,
                    audioSampleRate: convAudioSampleRate,
                    audioChannels: convAudioChannels,
                    audioNormalize: convAudioNormalize,
                  })
                }
                disabled={cue.proxyProgress !== undefined && cue.proxyProgress < 100}
              >
                <RefreshCw
                  size={13}
                  className={
                    cue.proxyProgress !== undefined && cue.proxyProgress < 100 ? 'spin-anim' : ''
                  }
                />
                <span>
                  {cue.proxyProgress !== undefined && cue.proxyProgress < 100
                    ? `Convirtiendo (${cue.proxyProgress}%)...`
                    : convCodec === 'copy_video'
                    ? 'Convertir Audio Ahora (Rápido)'
                    : cue.proxyPath
                    ? 'Volver a Convertir Vídeo / Audio'
                    : 'Convertir Vídeo y Audio'}
                </span>
              </button>
            </div>

            <div className="insp-group">
              <label className="insp-label">ARCHIVO EN DISCO</label>
              <div className="filepath-box">{cue.filePath}</div>
              <button
                className="full-width-btn"
                style={{ marginTop: 8 }}
                onClick={() => onRelinkCue(cue)}
              >
                <Link size={13} />
                <span>Cambiar / Relinkear Archivo</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
