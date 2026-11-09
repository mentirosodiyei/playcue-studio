import React, { useState } from 'react';
import {
  Plus,
  Search,
  Play,
  Eye,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Volume2,
  VolumeX,
  AlertTriangle,
  Wand2,
  Link,
  Film,
  Sparkles,
} from 'lucide-react';
import {
  VideoCue,
  EndAction,
  TransitionType,
} from '../types/cue';
import {
  formatTimecode,
  getEffectiveCueDuration,
  gainToDbString,
  CUE_COLOR_MAP,
  END_ACTION_LABELS,
} from '../utils/timecode';

interface CueListProps {
  cues: VideoCue[];
  selectedCueId: string | null;
  previewCueId: string | null;
  programCueId: string | null;
  isGeneratingDemos: boolean;
  onSelectCue: (id: string) => void;
  onLoadToPreview: (id: string) => void;
  onTakeCueToProgram: (id: string) => void;
  onUpdateCue: (id: string, patch: Partial<VideoCue>) => void;
  onDeleteCue: (id: string) => void;
  onDuplicateCue: (id: string) => void;
  onMoveCue: (index: number, direction: -1 | 1) => void;
  onReorderCues: (fromIndex: number, toIndex: number) => void;
  onAddVideos: () => void;
  onGenerateDemos: () => void;
  onOptimizeProxy: (cue: VideoCue) => void;
  onRelinkCue: (cue: VideoCue) => void;
}

export const CueList: React.FC<CueListProps> = ({
  cues,
  selectedCueId,
  previewCueId,
  programCueId,
  isGeneratingDemos,
  onSelectCue,
  onLoadToPreview,
  onTakeCueToProgram,
  onUpdateCue,
  onDeleteCue,
  onDuplicateCue,
  onMoveCue,
  onReorderCues,
  onAddVideos,
  onGenerateDemos,
  onOptimizeProxy,
  onRelinkCue,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const filteredCues = cues.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.cueNumber.toLowerCase().includes(q) ||
      c.fileName.toLowerCase().includes(q) ||
      c.notes.toLowerCase().includes(q)
    );
  });

  const totalShowDuration = cues.reduce((acc, c) => acc + getEffectiveCueDuration(c), 0);

  return (
    <div className="cuelist-panel">
      {/* Cue List Header Bar */}
      <div className="cuelist-toolbar">
        <div className="cuelist-toolbar-left">
          <div className="panel-section-title">
            <Film size={15} />
            <span>CUE LIST / ESCALETA ({cues.length})</span>
          </div>
          <span className="total-runtime-badge">
            TOTAL: {formatTimecode(totalShowDuration, 25, true)}
          </span>
          <div className="search-input-wrap">
            <Search size={13} />
            <input
              type="text"
              placeholder="Buscar cue por nombre, # o nota..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="cuelist-toolbar-right">
          <button
            className="toolbar-action-btn secondary"
            onClick={onGenerateDemos}
            disabled={isGeneratingDemos}
            title="Genera 3 vídeos de prueba 1080p50 con barras SMPTE, cuenta atrás y tono de audio usando FFmpeg"
          >
            <Sparkles size={14} />
            <span>{isGeneratingDemos ? 'Generando 1080p...' : 'Generar Vídeos Demo'}</span>
          </button>

          <button
            className="toolbar-action-btn primary"
            onClick={onAddVideos}
            title="Importar archivos de vídeo desde el disco (o arrastra y suelta aquí)"
          >
            <Plus size={15} />
            <span>Añadir Vídeos</span>
          </button>
        </div>
      </div>

      {/* Table Header */}
      <div className="cuelist-table-header">
        <div className="col-status">ESTADO</div>
        <div className="col-num"># CUE</div>
        <div className="col-thumb">CLIP</div>
        <div className="col-title">NOMBRE / FORMATO</div>
        <div className="col-inout">IN / OUT</div>
        <div className="col-dur">DURACIÓN</div>
        <div className="col-trans">TRANSICIÓN</div>
        <div className="col-audio">AUDIO</div>
        <div className="col-end">AL TERMINAR (END)</div>
        <div className="col-actions">ACCIONES</div>
      </div>

      {/* Cue Rows */}
      <div className="cuelist-rows-scroll">
        {filteredCues.length === 0 ? (
          <div className="cuelist-empty-state">
            <Film size={36} strokeWidth={1.3} />
            <h3>No hay vídeos en la escaleta</h3>
            <p>
              Arrastra y suelta cualquier archivo de vídeo (MP4, MOV ProRes, MKV, AVI, WebM, MXF)
              directamente en la ventana, o pulsa <strong>Añadir Vídeos</strong>.
            </p>
            <div className="empty-state-buttons">
              <button className="toolbar-action-btn primary" onClick={onAddVideos}>
                <Plus size={15} /> Añadir Vídeos del PC
              </button>
              <button
                className="toolbar-action-btn secondary"
                onClick={onGenerateDemos}
                disabled={isGeneratingDemos}
              >
                <Sparkles size={14} />{' '}
                {isGeneratingDemos ? 'Generando Clips...' : 'Crear 3 Vídeos Demo Broadcast'}
              </button>
            </div>
          </div>
        ) : (
          filteredCues.map((cue) => {
            const realIndex = cues.findIndex((x) => x.id === cue.id);
            const isSelected = cue.id === selectedCueId;
            const isPrv = cue.id === previewCueId;
            const isPgm = cue.id === programCueId;
            const effectiveDur = getEffectiveCueDuration(cue);
            const colorInfo = CUE_COLOR_MAP[cue.color || 'none'];
            const outVal = cue.outPoint > cue.inPoint ? cue.outPoint : cue.duration;

            return (
              <div
                key={cue.id}
                draggable
                onDragStart={() => setDragIndex(realIndex)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverIndex(realIndex);
                }}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== realIndex) {
                    onReorderCues(dragIndex, realIndex);
                  }
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onClick={() => {
                  onSelectCue(cue.id);
                  onLoadToPreview(cue.id);
                }}
                onDoubleClick={() => onTakeCueToProgram(cue.id)}
                className={`cue-row ${isSelected ? 'selected' : ''} ${isPgm ? 'is-pgm' : ''} ${
                  isPrv ? 'is-prv' : ''
                } ${dragOverIndex === realIndex ? 'drag-over' : ''}`}
                style={{
                  backgroundColor: isPgm
                    ? 'rgba(239, 68, 68, 0.14)'
                    : isPrv
                    ? 'rgba(16, 185, 129, 0.10)'
                    : colorInfo.bg,
                  borderLeft: `4px solid ${
                    isPgm ? '#ef4444' : isPrv ? '#10b981' : colorInfo.border
                  }`,
                }}
              >
                {/* Status Badge */}
                <div className="col-status">
                  {isPgm && <span className="row-tally pgm">PGM</span>}
                  {isPrv && <span className="row-tally prv">PRV</span>}
                  {!isPgm && !isPrv && <span className="row-tally idle">•</span>}
                </div>

                {/* Cue Number */}
                <div className="col-num">
                  <span
                    className="color-dot"
                    style={{ backgroundColor: colorInfo.dot }}
                  />
                  <span className="cue-number-text">{cue.cueNumber}</span>
                </div>

                {/* Thumbnail */}
                <div className="col-thumb">
                  <div className="thumb-box">
                    {cue.thumbnailDataUrl ? (
                      <img src={cue.thumbnailDataUrl} alt={cue.name} />
                    ) : (
                      <div className="thumb-placeholder">
                        <Film size={16} />
                      </div>
                    )}
                    {cue.proxyPath && <span className="proxy-badge">PROXY</span>}
                  </div>
                </div>

                {/* Title & Format Metadata */}
                <div className="col-title">
                  <div className="cue-title-line">
                    <span className="cue-name-strong">{cue.name}</span>
                    {!cue.exists && (
                      <button
                        className="inline-warn-btn error"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRelinkCue(cue);
                        }}
                      >
                        <Link size={11} /> RELINKEAR
                      </button>
                    )}
                    {cue.exists && !cue.isNativeCompatible && !cue.proxyPath && (
                      <button
                        className="inline-warn-btn amber"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOptimizeProxy(cue);
                        }}
                        title="Este códec (ej. ProRes / AVI / MKV especial) se puede convertir a H.264 Proxy para reproducción instantánea"
                      >
                        <Wand2 size={11} />
                        {cue.proxyProgress !== undefined && cue.proxyProgress < 100
                          ? `Convirtiendo ${cue.proxyProgress}%`
                          : 'Optimizar H.264'}
                      </button>
                    )}
                  </div>
                  <div className="cue-meta-line">
                    <span>
                      {cue.width}x{cue.height} • {cue.fps}fps • {cue.videoCodec.toUpperCase()}
                    </span>
                    {cue.audioChannels > 0 ? (
                      <span>• {cue.audioCodec.toUpperCase()} ({cue.audioChannels}ch)</span>
                    ) : (
                      <span>• SIN AUDIO</span>
                    )}
                    {cue.playbackRate !== 1 && (
                      <span className="speed-tag">{cue.playbackRate}x</span>
                    )}
                    {cue.notes && <span className="cue-note-preview">“{cue.notes}”</span>}
                  </div>
                  {cue.proxyProgress !== undefined && cue.proxyProgress < 100 && (
                    <div className="proxy-progress-bar">
                      <div style={{ width: `${cue.proxyProgress}%` }} />
                    </div>
                  )}
                </div>

                {/* In / Out */}
                <div className="col-inout">
                  <div className="tc-pair">
                    <span>IN {formatTimecode(cue.inPoint, cue.fps)}</span>
                    <span>OUT {formatTimecode(outVal, cue.fps)}</span>
                  </div>
                </div>

                {/* Effective Duration */}
                <div className="col-dur">
                  <span className="dur-strong">{formatTimecode(effectiveDur, cue.fps)}</span>
                </div>

                {/* Transition Inline Selector */}
                <div className="col-trans" onClick={(e) => e.stopPropagation()}>
                  <select
                    className="row-select"
                    value={cue.transitionType}
                    onChange={(e) =>
                      onUpdateCue(cue.id, {
                        transitionType: e.target.value as TransitionType,
                      })
                    }
                  >
                    <option value="cut">CUT (0s)</option>
                    <option value="dissolve">MIX ({cue.transitionDuration}s)</option>
                    <option value="dipToBlack">DIP ({cue.transitionDuration}s)</option>
                    <option value="wipe">WIPE ({cue.transitionDuration}s)</option>
                  </select>
                </div>

                {/* Audio Inline Control */}
                <div className="col-audio" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`row-mute-btn ${cue.muted ? 'muted' : ''}`}
                    onClick={() => onUpdateCue(cue.id, { muted: !cue.muted })}
                    title="Mute / Unmute este clip"
                  >
                    {cue.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  </button>
                  <div className="audio-row-details">
                    <span>{gainToDbString(cue.volume, cue.muted)}</span>
                    {(cue.audioFadeIn > 0 || cue.audioFadeOut > 0) && (
                      <small>
                        F: {cue.audioFadeIn}s/{cue.audioFadeOut}s
                      </small>
                    )}
                  </div>
                </div>

                {/* End Action Inline Selector */}
                <div className="col-end" onClick={(e) => e.stopPropagation()}>
                  <select
                    className="row-select end-select"
                    style={{
                      borderColor: END_ACTION_LABELS[cue.endAction].color,
                      color: END_ACTION_LABELS[cue.endAction].color,
                    }}
                    value={cue.endAction}
                    onChange={(e) =>
                      onUpdateCue(cue.id, { endAction: e.target.value as EndAction })
                    }
                  >
                    <option value="hold">HOLD (Pausa Fin)</option>
                    <option value="black">BLACK (Ir a Negro)</option>
                    <option value="loop">LOOP (Bucle)</option>
                    <option value="next">PLAY NEXT (Siguiente)</option>
                    <option value="stop">STOP (Limpiar)</option>
                  </select>
                </div>

                {/* Quick Row Actions */}
                <div className="col-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="row-icon-btn prv-btn"
                    onClick={() => onLoadToPreview(cue.id)}
                    title="Cargar en Preview (PRV)"
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    className="row-icon-btn take-btn"
                    onClick={() => onTakeCueToProgram(cue.id)}
                    title="Lanzar directamente a Program (TAKE)"
                  >
                    <Play size={13} />
                  </button>
                  <button
                    className="row-icon-btn"
                    onClick={() => onMoveCue(realIndex, -1)}
                    disabled={realIndex === 0}
                    title="Subir Cue"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="row-icon-btn"
                    onClick={() => onMoveCue(realIndex, 1)}
                    disabled={realIndex === cues.length - 1}
                    title="Bajar Cue"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="row-icon-btn"
                    onClick={() => onDuplicateCue(cue.id)}
                    title="Duplicar Cue"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="row-icon-btn danger"
                    onClick={() => onDeleteCue(cue.id)}
                    title="Eliminar Cue"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
