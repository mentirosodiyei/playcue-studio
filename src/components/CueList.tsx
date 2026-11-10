import React, { useState, useEffect, useRef } from 'react';
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
  Wand2,
  Link,
  Film,
  FolderPlus,
  FolderOpen,
  FileVideo,
  ChevronDown,
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
  END_ACTION_LABELS,
} from '../utils/timecode';

interface CueListProps {
  cues: VideoCue[];
  selectedCueId: string | null;
  previewCueId: string | null;
  programCueId: string | null;
  onSelectCue: (id: string) => void;
  onLoadToPreview: (id: string) => void;
  onTakeCueToProgram: (id: string) => void;
  onUpdateCue: (id: string, patch: Partial<VideoCue>) => void;
  onDeleteCue: (id: string) => void;
  onDuplicateCue: (id: string) => void;
  onMoveCue: (index: number, direction: -1 | 1) => void;
  onReorderCues: (fromIndex: number, toIndex: number) => void;
  onAddVideos: () => void;
  onAddFolder: () => void;
  onLocateCue: (cue: VideoCue) => void;
  onOptimizeProxy: (cue: VideoCue) => void;
  onRelinkCue: (cue: VideoCue) => void;
}

export const CueList: React.FC<CueListProps> = ({
  cues,
  selectedCueId,
  previewCueId,
  programCueId,
  onSelectCue,
  onLoadToPreview,
  onTakeCueToProgram,
  onUpdateCue,
  onDeleteCue,
  onDuplicateCue,
  onMoveCue,
  onReorderCues,
  onAddVideos,
  onAddFolder,
  onLocateCue,
  onOptimizeProxy,
  onRelinkCue,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // "Añadir Vídeos" dropdown menu state
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  // Right-click Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    cue: VideoCue;
  } | null>(null);

  // Delete confirmation modal state
  const [cueToConfirmDelete, setCueToConfirmDelete] = useState<VideoCue | null>(null);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
      setContextMenu(null);
    };
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddMenuOpen(false);
        setContextMenu(null);
        setCueToConfirmDelete(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKey);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKey);
    };
  }, []);

  const filteredCues = cues.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.cueNumber.toLowerCase().includes(q) ||
      c.fileName.toLowerCase().includes(q)
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
            <span>CUE LIST ({cues.length})</span>
          </div>
          <span className="total-runtime-badge">
            TOTAL: {formatTimecode(totalShowDuration, 25, true)}
          </span>
          <div className="search-input-wrap">
            <Search size={13} />
            <input
              type="text"
              placeholder="Buscar vídeo en el Cue List..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="cuelist-toolbar-right">
          <div className="add-videos-dropdown-wrap" ref={addMenuRef}>
            <button
              className="toolbar-action-btn primary"
              onClick={(e) => {
                e.stopPropagation();
                setAddMenuOpen((prev) => !prev);
              }}
              title="Añadir archivos de vídeo sueltos o carpetas completas al Cue List"
            >
              <Plus size={15} />
              <span>Añadir Vídeos</span>
              <ChevronDown size={13} style={{ marginLeft: 2, opacity: 0.85 }} />
            </button>

            {addMenuOpen && (
              <div className="macos-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                <button
                  className="macos-dropdown-item"
                  onClick={() => {
                    setAddMenuOpen(false);
                    onAddVideos();
                  }}
                >
                  <FileVideo size={14} className="cyan-text" />
                  <div className="dropdown-item-text">
                    <strong>Añadir Archivos...</strong>
                    <span>Seleccionar uno o varios vídeos</span>
                  </div>
                </button>
                <div className="macos-dropdown-divider" />
                <button
                  className="macos-dropdown-item"
                  onClick={() => {
                    setAddMenuOpen(false);
                    onAddFolder();
                  }}
                >
                  <FolderPlus size={14} className="cyan-text" />
                  <div className="dropdown-item-text">
                    <strong>Añadir Carpeta...</strong>
                    <span>Importar todos los vídeos de una carpeta</span>
                  </div>
                </button>
              </div>
            )}
          </div>
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
            <Film size={34} strokeWidth={1.3} />
            <h3>Cue List vacío</h3>
            <p>
              Arrastra archivos o carpetas de vídeo directamente aquí, o usa el botón{' '}
              <strong>Añadir Vídeos</strong>.
            </p>
            <div className="empty-state-buttons">
              <button className="toolbar-action-btn primary" onClick={onAddVideos}>
                <FileVideo size={14} /> Añadir Archivos
              </button>
              <button className="toolbar-action-btn secondary" onClick={onAddFolder}>
                <FolderPlus size={14} /> Añadir Carpeta
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
            const outVal = cue.outPoint > cue.inPoint ? cue.outPoint : cue.duration;

            return (
              <div
                key={cue.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(realIndex));
                  setDragIndex(realIndex);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragIndex !== null) {
                    setDragOverIndex(realIndex);
                  }
                }}
                onDrop={(e) => {
                  if (dragIndex !== null) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragIndex !== realIndex) {
                      onReorderCues(dragIndex, realIndex);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }
                }}
                onDragEnd={(e) => {
                  e.stopPropagation();
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectCue(cue.id);
                  const menuW = 210;
                  const menuH = 92;
                  const posX = Math.min(e.clientX, window.innerWidth - menuW - 12);
                  const posY = Math.min(e.clientY, window.innerHeight - menuH - 12);
                  setContextMenu({ x: posX, y: posY, cue });
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
                    : 'transparent',
                  borderLeft: `4px solid ${
                    isPgm ? '#ef4444' : isPrv ? '#10b981' : isSelected ? '#38bdf8' : 'transparent'
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
                    {cue.proxyPath && <span className="proxy-badge">CONV</span>}
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
                        title="Convertir este vídeo a H.264 para reproducción nativa"
                      >
                        <Wand2 size={11} />
                        {cue.proxyProgress !== undefined && cue.proxyProgress < 100
                          ? `Convirtiendo ${cue.proxyProgress}%`
                          : 'Convertir H.264'}
                      </button>
                    )}
                  </div>
                  <div className="cue-meta-line">
                    <span>
                      {cue.width}×{cue.height} • {cue.fps}fps • {cue.videoCodec.toUpperCase()}
                    </span>
                    {cue.audioChannels > 0 ? (
                      <span className="emerald-text">
                        • AUDIO: {cue.audioCodec.toUpperCase()} ({cue.audioChannels}ch @{' '}
                        {Math.round((cue.audioSampleRate || 48000) / 1000)}kHz)
                      </span>
                    ) : (
                      <span>• SIN AUDIO</span>
                    )}
                    {cue.playbackRate !== 1 && (
                      <span className="speed-tag">{cue.playbackRate}x</span>
                    )}
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
                    onClick={() => setCueToConfirmDelete(cue)}
                    title="Delete (Eliminar del Cue List)"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          className="context-menu-popup"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              const target = contextMenu.cue;
              setContextMenu(null);
              onLocateCue(target);
            }}
          >
            <FolderOpen size={14} className="cyan-text" />
            <span>Locate (Abrir en carpeta)</span>
          </button>
          <div className="macos-dropdown-divider" />
          <button
            className="context-menu-item danger"
            onClick={() => {
              const target = contextMenu.cue;
              setContextMenu(null);
              setCueToConfirmDelete(target);
            }}
          >
            <Trash2 size={14} />
            <span>Delete (Borrar de la app)</span>
          </button>
        </div>
      )}

      {/* Confirmation Modal for Deleting a Cue from the App */}
      {cueToConfirmDelete && (
        <div
          className="modal-backdrop"
          onClick={() => setCueToConfirmDelete(null)}
        >
          <div
            className="confirm-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h4>¿Eliminar vídeo del Cue List?</h4>
            <p>
              Se eliminará <strong>"{cueToConfirmDelete.name}"</strong> únicamente de la lista de la
              aplicación. El archivo original <strong>no se borrará</strong> de la carpeta donde está
              guardado.
            </p>
            <div className="confirm-modal-actions">
              <button
                className="inspector-action-btn"
                onClick={() => setCueToConfirmDelete(null)}
              >
                Cancelar
              </button>
              <button
                className="inspector-action-btn danger-fill"
                onClick={() => {
                  const id = cueToConfirmDelete.id;
                  setCueToConfirmDelete(null);
                  onDeleteCue(id);
                }}
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
