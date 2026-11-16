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

import { tr } from '../i18n';
import { splitPlaybackError } from '../utils/playbackError';
interface CueListProps {
  cues: VideoCue[];
  selectedCueId: string | null;
  /** All selected cue ids (multi-selection with Shift / Ctrl). Always includes selectedCueId when set. */
  selectedCueIds: string[];
  previewCueId: string | null;
  programCueId: string | null;
  onSelectCue: (id: string) => void;
  onSelectCues: (ids: string[], primaryId: string | null) => void;
  onLoadToPreview: (id: string) => void;
  onTakeCueToProgram: (id: string) => void;
  onUpdateCue: (id: string, patch: Partial<VideoCue>) => void;
  onDeleteCues: (ids: string[]) => void;
  onDuplicateCue: (id: string) => void;
  onMoveCues: (ids: string[], direction: -1 | 1) => void;
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
  selectedCueIds,
  previewCueId,
  programCueId,
  onSelectCue,
  onSelectCues,
  onLoadToPreview,
  onTakeCueToProgram,
  onUpdateCue,
  onDeleteCues,
  onDuplicateCue,
  onMoveCues,
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
  const [cuesToConfirmDelete, setCuesToConfirmDelete] = useState<VideoCue[] | null>(null);

  // Keep latest selection / cues available to the global key handler without re-subscribing
  const selectionRef = useRef<string[]>(selectedCueIds);
  selectionRef.current = selectedCueIds;
  const cuesRef = useRef<VideoCue[]>(cues);
  cuesRef.current = cues;

  const requestDelete = (ids: string[]) => {
    const targets = cuesRef.current.filter((c) => ids.includes(c.id));
    if (targets.length > 0) setCuesToConfirmDelete(targets);
  };

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
        setCuesToConfirmDelete(null);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' && selectionRef.current.length > 0) {
        e.preventDefault();
        requestDelete(selectionRef.current);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const all = cuesRef.current.map((c) => c.id);
        onSelectCues(all, all[0] ?? null);
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
            <span>{tr("CUE LIST (")}{cues.length})</span>
          </div>
          <span className="total-runtime-badge">
            {tr("TOTAL:")} {formatTimecode(totalShowDuration, 25, true)}
          </span>
          {selectedCueIds.length > 1 && (
            <div
              className="total-runtime-badge"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title={tr("Selección múltiple: Shift = rango, Ctrl = añadir/quitar, Supr = eliminar")}
            >
              <span>{selectedCueIds.length} {tr("seleccionados")}</span>
              <button
                className="row-icon-btn"
                title={tr("Subir selección")}
                onClick={() => onMoveCues(selectedCueIds, -1)}
              >
                <ArrowUp size={12} />
              </button>
              <button
                className="row-icon-btn"
                title={tr("Bajar selección")}
                onClick={() => onMoveCues(selectedCueIds, 1)}
              >
                <ArrowDown size={12} />
              </button>
              <button
                className="row-icon-btn danger"
                title={tr("Eliminar selección")}
                onClick={() => requestDelete(selectedCueIds)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
          <div className="search-input-wrap">
            <Search size={13} />
            <input
              type="text"
              placeholder={tr("Buscar vídeo en el Cue List...")}
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
              title={tr("Añadir archivos de vídeo sueltos o carpetas completas al Cue List")}
            >
              <Plus size={15} />
              <span>{tr("Añadir Vídeos")}</span>
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
                    <strong>{tr("Añadir Archivos...")}</strong>
                    <span>{tr("Seleccionar uno o varios vídeos")}</span>
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
                    <strong>{tr("Añadir Carpeta...")}</strong>
                    <span>{tr("Importar todos los vídeos de una carpeta")}</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table Header */}
      <div className="cuelist-table-header">
        <div className="col-status">{tr("ESTADO")}</div>
        <div className="col-num">{tr("# CUE")}</div>
        <div className="col-thumb">CLIP</div>
        <div className="col-title">{tr("NOMBRE / FORMATO")}</div>
        <div className="col-inout">IN / OUT</div>
        <div className="col-dur">{tr("DURACIÓN")}</div>
        <div className="col-trans">{tr("TRANSICIÓN")}</div>
        <div className="col-audio">{tr("AUDIO")}</div>
        <div className="col-end">{tr("AL TERMINAR (END)")}</div>
        <div className="col-actions">{tr("ACCIONES")}</div>
      </div>

      {/* Cue Rows */}
      <div className="cuelist-rows-scroll">
        {filteredCues.length === 0 ? (
          <div className="cuelist-empty-state">
            <Film size={34} strokeWidth={1.3} />
            <h3>{tr("Cue List vacío")}</h3>
            <p>
              {tr("Arrastra archivos o carpetas de vídeo directamente aquí, o usa el botón")}{' '}
              <strong>{tr("Añadir Vídeos")}</strong>.
            </p>
            <div className="empty-state-buttons">
              <button className="toolbar-action-btn primary" onClick={onAddVideos}>
                <FileVideo size={14} /> {tr("Añadir Archivos")}
              </button>
              <button className="toolbar-action-btn secondary" onClick={onAddFolder}>
                <FolderPlus size={14} /> {tr("Añadir Carpeta")}
              </button>
            </div>
          </div>
        ) : (
          filteredCues.map((cue) => {
            const realIndex = cues.findIndex((x) => x.id === cue.id);
            const isSelected = selectedCueIds.includes(cue.id);
            // Row buttons act on the whole selection when the row belongs to a multi-selection
            const rowGroup =
              isSelected && selectedCueIds.length > 1 ? selectedCueIds : [cue.id];
            const groupIdx = rowGroup.map((id) => cues.findIndex((x) => x.id === id));
            const canMoveUp = Math.min(...groupIdx) > 0;
            const canMoveDown = Math.max(...groupIdx) < cues.length - 1;
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
                  // Right-click on an unselected row selects it; on a selected row keeps the selection
                  if (!selectedCueIds.includes(cue.id)) onSelectCues([cue.id], cue.id);
                  const menuW = 230;
                  const menuH = 92;
                  const posX = Math.min(e.clientX, window.innerWidth - menuW - 12);
                  const posY = Math.min(e.clientY, window.innerHeight - menuH - 12);
                  setContextMenu({ x: posX, y: posY, cue });
                }}
                onClick={(e) => {
                  if (e.shiftKey) {
                    // Range select from the primary (anchor) cue to the clicked one
                    const anchorIdx = Math.max(
                      0,
                      cues.findIndex((x) => x.id === (selectedCueId ?? cue.id))
                    );
                    const [from, to] =
                      anchorIdx <= realIndex ? [anchorIdx, realIndex] : [realIndex, anchorIdx];
                    onSelectCues(
                      cues.slice(from, to + 1).map((x) => x.id),
                      selectedCueId ?? cue.id
                    );
                    return;
                  }
                  if (e.ctrlKey || e.metaKey) {
                    if (selectedCueIds.includes(cue.id)) {
                      const rest = selectedCueIds.filter((id) => id !== cue.id);
                      onSelectCues(rest, rest[rest.length - 1] ?? null);
                    } else {
                      onSelectCues([...selectedCueIds, cue.id], cue.id);
                    }
                    return;
                  }
                  onSelectCue(cue.id);
                  onLoadToPreview(cue.id);
                }}
                onDoubleClick={() => onTakeCueToProgram(cue.id)}
                className={`cue-row ${isSelected ? 'selected' : ''} ${isPgm ? 'is-pgm' : ''} ${
                  isPrv ? 'is-prv' : ''
                } ${dragOverIndex === realIndex ? 'drag-over' : ''}`}
                style={{
                  userSelect: 'none',
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
                        <Link size={11} /> {tr("RELINKEAR")}
                      </button>
                    )}
                    {cue.exists && cue.playbackError && (
                      <span
                        className="inline-warn-btn error"
                        title={cue.playbackError}
                        style={{ cursor: 'default' }}
                      >
                        {splitPlaybackError(cue.playbackError).headline}
                      </span>
                    )}
                    {cue.exists && !cue.isNativeCompatible && !cue.proxyPath && (
                      <button
                        className="inline-warn-btn amber"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOptimizeProxy(cue);
                        }}
                        title={tr("Convertir este vídeo a H.264 para reproducción nativa")}
                      >
                        <Wand2 size={11} />
                        {cue.proxyProgress !== undefined && cue.proxyProgress < 100
                          ? tr("Convirtiendo {n}%", { n: cue.proxyProgress })
                          : tr("Convertir H.264")}
                      </button>
                    )}
                  </div>
                  <div className="cue-meta-line">
                    <span>
                      {cue.width}×{cue.height} • {cue.fps}{tr("fps •")} {cue.videoCodec.toUpperCase()}
                    </span>
                    {cue.audioChannels > 0 ? (
                      <span className="emerald-text">
                        • {tr("AUDIO:")} {cue.audioCodec.toUpperCase()} ({cue.audioChannels}{tr("ch @")}{' '}
                        {Math.round((cue.audioSampleRate || 48000) / 1000)}{tr("kHz)")}
                      </span>
                    ) : (
                      <span>{tr("• SIN AUDIO")}</span>
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
                    <option value="cut">{tr("CUT (0s)")}</option>
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
                    title={tr("Mute / Unmute este clip")}
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
                    <option value="hold">{tr("HOLD (Pausa Fin)")}</option>
                    <option value="black">{tr("BLACK (Ir a Negro)")}</option>
                    <option value="loop">{tr("LOOP (Bucle)")}</option>
                    <option value="next">{tr("PLAY NEXT (Siguiente)")}</option>
                    <option value="goto">{tr("IR A (Saltar a Cue)")}</option>
                    <option value="stop">{tr("STOP (Limpiar)")}</option>
                  </select>
                  {cue.endAction === 'goto' && (
                    <select
                      className="row-select end-select"
                      style={{
                        marginTop: 3,
                        borderColor: END_ACTION_LABELS.goto.color,
                        color: cue.gotoCueId ? END_ACTION_LABELS.goto.color : '#ef4444',
                      }}
                      value={cue.gotoCueId || ''}
                      title={tr("Cue al que se salta cuando este vídeo termina")}
                      onChange={(e) => onUpdateCue(cue.id, { gotoCueId: e.target.value || null })}
                    >
                      <option value="">{tr("— Elegir Cue destino —")}</option>
                      {cues.map((t) => (
                        <option key={t.id} value={t.id}>
                          → {t.cueNumber} · {t.name.slice(0, 28)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Quick Row Actions */}
                <div className="col-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="row-icon-btn prv-btn"
                    onClick={() => onLoadToPreview(cue.id)}
                    title={tr("Cargar en Preview (PRV)")}
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    className="row-icon-btn take-btn"
                    onClick={() => onTakeCueToProgram(cue.id)}
                    title={tr("Lanzar directamente a Program (TAKE)")}
                  >
                    <Play size={13} />
                  </button>
                  <button
                    className="row-icon-btn"
                    onClick={() => onMoveCues(rowGroup, -1)}
                    disabled={!canMoveUp}
                    title={rowGroup.length > 1 ? tr("Subir los Cues seleccionados") : tr("Subir Cue")}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="row-icon-btn"
                    onClick={() => onMoveCues(rowGroup, 1)}
                    disabled={!canMoveDown}
                    title={rowGroup.length > 1 ? tr("Bajar los Cues seleccionados") : tr("Bajar Cue")}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="row-icon-btn"
                    onClick={() => onDuplicateCue(cue.id)}
                    title={tr("Duplicar Cue")}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="row-icon-btn danger"
                    onClick={() => requestDelete(rowGroup)}
                    title={
                      rowGroup.length > 1
                        ? tr("Eliminar los {n} Cues seleccionados", { n: rowGroup.length })
                        : tr("Delete (Eliminar del Cue List)")
                    }
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
          {/* Locate only makes sense for a single file */}
          {selectedCueIds.length <= 1 && (
            <>
              <button
                className="context-menu-item"
                onClick={() => {
                  const target = contextMenu.cue;
                  setContextMenu(null);
                  onLocateCue(target);
                }}
              >
                <FolderOpen size={14} className="cyan-text" />
                <span>{tr("Locate (Abrir en carpeta)")}</span>
              </button>
              <div className="macos-dropdown-divider" />
            </>
          )}
          <button
            className="context-menu-item danger"
            onClick={() => {
              const ids = selectedCueIds.length > 1 ? selectedCueIds : [contextMenu.cue.id];
              setContextMenu(null);
              requestDelete(ids);
            }}
          >
            <Trash2 size={14} />
            <span>
              {selectedCueIds.length > 1
                ? tr("Eliminar {n} Cues seleccionados", { n: selectedCueIds.length })
                : tr("Delete (Borrar de la app)")}
            </span>
          </button>
        </div>
      )}

      {/* Confirmation Modal for Deleting a Cue from the App */}
      {cuesToConfirmDelete && cuesToConfirmDelete.length > 0 && (
        <div
          className="modal-backdrop"
          onClick={() => setCuesToConfirmDelete(null)}
        >
          <div
            className="confirm-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h4>
              {cuesToConfirmDelete.length > 1
                ? tr("¿Eliminar {n} vídeos del Cue List?", { n: cuesToConfirmDelete.length })
                : tr("¿Eliminar vídeo del Cue List?")}
            </h4>
            <p>
              {cuesToConfirmDelete.length > 1 ? (
                <>
                  {tr("Se eliminarán")} <strong>{cuesToConfirmDelete.length} {tr("vídeos")}</strong> {tr("únicamente de la lista de la aplicación.")}
                </>
              ) : (
                <>
                  {tr("Se eliminará")} <strong>"{cuesToConfirmDelete[0].name}"</strong> {tr("únicamente de la lista de la aplicación.")}
                </>
              )}{' '}
              {tr("Los archivos originales")} <strong>{tr("no se borrarán")}</strong> {tr("de su carpeta.")}
            </p>
            <div className="confirm-modal-actions">
              <button
                className="inspector-action-btn"
                onClick={() => setCuesToConfirmDelete(null)}
              >
                {tr("Cancelar")}
              </button>
              <button
                className="inspector-action-btn danger-fill"
                onClick={() => {
                  const ids = cuesToConfirmDelete.map((c) => c.id);
                  setCuesToConfirmDelete(null);
                  onDeleteCues(ids);
                }}
              >
                <Trash2 size={13} />
                <span>{tr("Delete")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
