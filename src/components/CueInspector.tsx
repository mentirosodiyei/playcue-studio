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
  Wand2,
  Link,
  CheckCircle2,
  Sparkles,
  CopyCheck,
  RotateCcw,
} from 'lucide-react';
import {
  VideoCue,
  CueColor,
  EndAction,
  ScaleMode,
  AspectRatioMode,
  TransitionType,
} from '../types/cue';
import {
  formatTimecode,
  formatBytes,
  gainToDbString,
  CUE_COLOR_MAP,
} from '../utils/timecode';
import { ASPECT_RATIO_OPTIONS } from '../utils/videoGeometry';

interface CueInspectorProps {
  cue: VideoCue | null;
  prvCurrentTime: number;
  onUpdateCue: (id: string, patch: Partial<VideoCue>) => void;
  onApplyGeometryToAllCues?: (sourceCue: VideoCue) => void;
  onOptimizeProxy: (cue: VideoCue) => void;
  onRelinkCue: (cue: VideoCue) => void;
}

export const CueInspector: React.FC<CueInspectorProps> = ({
  cue,
  prvCurrentTime,
  onUpdateCue,
  onApplyGeometryToAllCues,
  onOptimizeProxy,
  onRelinkCue,
}) => {
  const [activeTab, setActiveTab] = useState<'time' | 'audio' | 'video' | 'file'>('video');

  if (!cue) {
    return (
      <div className="inspector-panel empty">
        <Sliders size={28} strokeWidth={1.4} />
        <h4>INSPECTOR DE CUE</h4>
        <p>Selecciona un vídeo en la escaleta para ajustar Formato, Aspect Ratio, Blur 90%, In/Out y Audio.</p>
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

  return (
    <div className="inspector-panel">
      {/* Inspector Header */}
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className="inspector-badge">INSPECTOR</span>
          <span className="inspector-cue-tag">CUE #{cue.cueNumber}</span>
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
            <Monitor size={13} />
            <span>Vídeo / Salida</span>
          </button>
          <button
            className={activeTab === 'time' ? 'active' : ''}
            onClick={() => setActiveTab('time')}
          >
            <Scissors size={13} />
            <span>Tiempo</span>
          </button>
          <button
            className={activeTab === 'audio' ? 'active' : ''}
            onClick={() => setActiveTab('audio')}
          >
            <Volume2 size={13} />
            <span>Audio</span>
          </button>
          <button
            className={activeTab === 'file' ? 'active' : ''}
            onClick={() => setActiveTab('file')}
          >
            <FileVideo size={13} />
            <span>Códec</span>
          </button>
        </div>
      </div>

      <div className="inspector-body">
        {/* ================= TAB 1: TIME & TRIM ================= */}
        {activeTab === 'time' && (
          <div className="insp-section-stack">
            <div className="insp-group">
              <label className="insp-label">IDENTIFICACIÓN Y COLOR</label>
              <div className="insp-row-2col">
                <div>
                  <small>Cue #</small>
                  <input
                    type="text"
                    className="insp-input"
                    value={cue.cueNumber}
                    onChange={(e) => onUpdateCue(cue.id, { cueNumber: e.target.value })}
                  />
                </div>
                <div>
                  <small>Nombre en Escaleta</small>
                  <input
                    type="text"
                    className="insp-input"
                    value={cue.name}
                    onChange={(e) => onUpdateCue(cue.id, { name: e.target.value })}
                  />
                </div>
              </div>

              <div className="color-picker-row">
                {(Object.keys(CUE_COLOR_MAP) as CueColor[]).map((col) => (
                  <button
                    key={col}
                    className={`color-swatch-btn ${cue.color === col ? 'selected' : ''}`}
                    style={{ backgroundColor: CUE_COLOR_MAP[col].dot }}
                    onClick={() => onUpdateCue(cue.id, { color: col })}
                    title={CUE_COLOR_MAP[col].label}
                  />
                ))}
              </div>
            </div>

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
                <option value="hold">HOLD — Congelar en último fotograma (Mitti Pause at End)</option>
                <option value="black">BLACK — Fundir / Cortar a negro al terminar</option>
                <option value="loop">LOOP — Bucle infinito entre In y Out</option>
                <option value="next">PLAY NEXT — Encadenar con el siguiente Cue</option>
                <option value="stop">STOP — Detener y limpiar salida</option>
              </select>
            </div>

            {/* Playback Speed & Notes */}
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

            <div className="insp-group">
              <label className="insp-label">NOTAS DE GUION / REGIDURÍA</label>
              <textarea
                className="insp-textarea"
                rows={2}
                placeholder="Ej: Lanzar tras aplauso de ponente, micro abierto..."
                value={cue.notes}
                onChange={(e) => onUpdateCue(cue.id, { notes: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* ================= TAB 2: AUDIO ================= */}
        {activeTab === 'audio' && (
          <div className="insp-section-stack">
            <div className="insp-group">
              <div className="insp-label-flex">
                <label className="insp-label">GANANCIA DE CLIP (VOLUME)</label>
                <span className="db-readout">{gainToDbString(cue.volume, cue.muted)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={150}
                step={1}
                value={cue.volume}
                onChange={(e) =>
                  onUpdateCue(cue.id, { volume: parseInt(e.target.value, 10) })
                }
              />
              <div className="pill-row" style={{ marginTop: 6 }}>
                <button
                  className={`mini-pill ${cue.muted ? 'selected-danger' : ''}`}
                  onClick={() => onUpdateCue(cue.id, { muted: !cue.muted })}
                >
                  {cue.muted ? 'MUTE ACTIVO' : 'SILENCIAR (MUTE)'}
                </button>
                <button
                  className="mini-pill"
                  onClick={() => onUpdateCue(cue.id, { volume: 100, muted: false })}
                >
                  0.0 dB (100%)
                </button>
                <button
                  className="mini-pill"
                  onClick={() => onUpdateCue(cue.id, { volume: 70 })}
                >
                  -3.0 dB (70%)
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

        {/* ================= TAB 3: VIDEO, ASPECT RATIO, ZOOM & BLUR 90% ================= */}
        {activeTab === 'video' && (
          <div className="insp-section-stack">
            {/* 1. Background Blur Fill Layer (90%) */}
            <div className={`insp-group blur-layer-box ${bgBlurOn ? 'active' : ''}`}>
              <div className="insp-label-flex">
                <label className="insp-label" style={{ color: '#e9d5ff' }}>
                  CAPA FONDO AMPLIADO + BLUR ({bgBlurAmount}%)
                </label>
                <span className={`status-pill ${bgBlurOn ? 'on' : 'off'}`}>
                  {bgBlurOn ? 'ACTIVO' : 'OFF'}
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
                <Sparkles size={15} />
                <span>
                  {bgBlurOn
                    ? `Fondo Ampliado + Blur (${bgBlurAmount}%) ACTIVADO`
                    : 'Activar Capa Inferior con Vídeo Ampliado + Blur 90%'}
                </span>
              </button>

              {bgBlurOn && (
                <div className="blur-sliders-stack">
                  <div className="insp-label-flex" style={{ marginTop: 8 }}>
                    <small>Desenfoque (Blur)</small>
                    <strong>{bgBlurAmount}%</strong>
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
                      <small>Zoom Fondo ({bgBlurZoom}%)</small>
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

            {/* 2. Scale Mode & Aspect Ratio */}
            <div className="insp-group">
              <label className="insp-label">AJUSTE A PANTALLA Y RELACIÓN DE ASPECTO</label>
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
                <small style={{ display: 'block', marginBottom: 4, color: '#94a3b8' }}>
                  Forzar Relación de Aspecto (Aspect Ratio):
                </small>
                <select
                  className="insp-select"
                  value={arVal}
                  onChange={(e) =>
                    onUpdateCue(cue.id, { aspectRatio: e.target.value as AspectRatioMode })
                  }
                >
                  {ASPECT_RATIO_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pill-row" style={{ marginTop: 6 }}>
                {(['native', 'output', '16:9', '16:10', '4:3', '21:9', '9:16'] as AspectRatioMode[]).map(
                  (ar) => (
                    <button
                      key={ar}
                      className={`mini-pill ${arVal === ar ? 'selected' : ''}`}
                      onClick={() => onUpdateCue(cue.id, { aspectRatio: ar })}
                    >
                      {ar === 'native' ? 'Nativo' : ar === 'output' ? 'Full Salida' : ar}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* 3. Zoom / Amplification & X/Y Scale / Offset */}
            <div className="insp-group">
              <div className="insp-label-flex">
                <label className="insp-label">AMPLIACIÓN / ZOOM EN SALIDA</label>
                <span className="db-readout">{zoomVal}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={300}
                step={1}
                value={zoomVal}
                onChange={(e) =>
                  onUpdateCue(cue.id, { zoom: parseInt(e.target.value, 10) })
                }
              />
              <div className="pill-row" style={{ marginTop: 6 }}>
                {[
                  { val: 100, label: '100%' },
                  { val: 115, label: '115%' },
                  { val: 133, label: '133% (QHD)' },
                  { val: 150, label: '150%' },
                  { val: 200, label: '200%' },
                ].map((p) => (
                  <button
                    key={p.val}
                    className={`mini-pill ${zoomVal === p.val ? 'selected' : ''}`}
                    onClick={() => onUpdateCue(cue.id, { zoom: p.val })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="insp-row-2col" style={{ marginTop: 8 }}>
                <div>
                  <small>Escala Ancho X ({scaleXVal}%)</small>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={scaleXVal}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { scaleX: parseInt(e.target.value, 10) })
                    }
                  />
                </div>
                <div>
                  <small>Escala Alto Y ({scaleYVal}%)</small>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={scaleYVal}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { scaleY: parseInt(e.target.value, 10) })
                    }
                  />
                </div>
              </div>

              <div className="insp-row-2col" style={{ marginTop: 6 }}>
                <div>
                  <small>Posición X ({offsetXVal > 0 ? `+${offsetXVal}` : offsetXVal}%)</small>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={offsetXVal}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { offsetX: parseInt(e.target.value, 10) })
                    }
                  />
                </div>
                <div>
                  <small>Posición Y ({offsetYVal > 0 ? `+${offsetYVal}` : offsetYVal}%)</small>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={offsetYVal}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { offsetY: parseInt(e.target.value, 10) })
                    }
                  />
                </div>
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
                  <RotateCcw size={11} /> Resetear Zoom y Escala
                </button>
                {onApplyGeometryToAllCues && (
                  <button
                    className="mini-action-btn"
                    style={{ borderColor: '#38bdf8', color: '#38bdf8' }}
                    onClick={() => onApplyGeometryToAllCues(cue)}
                    title="Copia el Modo de Escalado, Aspect Ratio, Zoom y Fondo Blur de este Cue a todos los vídeos de la escaleta"
                  >
                    <CopyCheck size={11} /> Aplicar a Todos los Vídeos
                  </button>
                )}
              </div>
            </div>

            {/* 4. Rotation & Flip */}
            <div className="insp-group">
              <label className="insp-label">ROTACIÓN Y ESPEJO (GEOMETRÍA)</label>
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
              </div>
              <div className="pill-row" style={{ marginTop: 6 }}>
                <button
                  className={`mini-pill ${cue.flipH ? 'selected' : ''}`}
                  onClick={() => onUpdateCue(cue.id, { flipH: !cue.flipH })}
                >
                  <FlipHorizontal size={12} /> Espejo H
                </button>
                <button
                  className={`mini-pill ${cue.flipV ? 'selected' : ''}`}
                  onClick={() => onUpdateCue(cue.id, { flipV: !cue.flipV })}
                >
                  <FlipVertical size={12} /> Espejo V
                </button>
              </div>
            </div>

            {/* 5. Transition & Fades */}
            <div className="insp-group">
              <label className="insp-label">TRANSICIÓN DEL CUE AL HACER TAKE</label>
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
            </div>

            <div className="insp-group">
              <div className="insp-label-flex">
                <label className="insp-label">OPACIDAD Y FUNDIDOS DE VÍDEO</label>
                <span>{cue.opacity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={cue.opacity}
                onChange={(e) =>
                  onUpdateCue(cue.id, { opacity: parseInt(e.target.value, 10) })
                }
              />
              <div className="insp-row-2col" style={{ marginTop: 6 }}>
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
          </div>
        )}

        {/* ================= TAB 4: CODEC & FILE ================= */}
        {activeTab === 'file' && (
          <div className="insp-section-stack">
            <div className="insp-group">
              <label className="insp-label">METADATOS FFPROBE</label>
              <div className="codec-spec-grid">
                <div>
                  <span>Resolución</span>
                  <strong>
                    {cue.width} × {cue.height}
                  </strong>
                </div>
                <div>
                  <span>Frame Rate</span>
                  <strong>{cue.fps} fps</strong>
                </div>
                <div>
                  <span>Códec Vídeo</span>
                  <strong>{cue.videoCodec.toUpperCase()}</strong>
                </div>
                <div>
                  <span>Contenedor</span>
                  <strong>{cue.container}</strong>
                </div>
                <div>
                  <span>Audio</span>
                  <strong>
                    {cue.audioCodec.toUpperCase()} ({cue.audioChannels}ch)
                  </strong>
                </div>
                <div>
                  <span>Tamaño</span>
                  <strong>{formatBytes(cue.fileSize)}</strong>
                </div>
              </div>
            </div>

            <div className="insp-group">
              <label className="insp-label">MOTOR DE REPRODUCCIÓN / PROXY FFMPEG</label>
              {cue.proxyPath ? (
                <div className="proxy-ready-box">
                  <CheckCircle2 size={15} />
                  <div>
                    <strong>Proxy H.264 Broadcast Activo</strong>
                    <small>GOP corto (-g 15) para scrubbing instantáneo</small>
                  </div>
                </div>
              ) : (
                <button
                  className="full-width-btn amber-btn"
                  onClick={() => onOptimizeProxy(cue)}
                  disabled={cue.proxyProgress !== undefined && cue.proxyProgress < 100}
                >
                  <Wand2 size={15} />
                  <span>
                    {cue.proxyProgress !== undefined && cue.proxyProgress < 100
                      ? `Transcodificando Proxy (${cue.proxyProgress}%)...`
                      : 'Convertir a Proxy H.264 Broadcast (FFmpeg)'}
                  </span>
                </button>
              )}
            </div>

            <div className="insp-group">
              <label className="insp-label">ARCHIVO EN DISCO</label>
              <div className="filepath-box">{cue.filePath}</div>
              <button
                className="full-width-btn"
                style={{ marginTop: 8 }}
                onClick={() => onRelinkCue(cue)}
              >
                <Link size={14} />
                <span>Relinkear / Cambiar Archivo de Vídeo</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
