import React from 'react';
import {
  X,
  Monitor,
  Columns,
  Rows,
  Copy,
  ArrowLeftRight,
  RefreshCw,
  CheckCircle2,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { DisplayInfo, MosaicConfig, MosaicMode } from '../types/cue';

interface MosaicSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  displays: DisplayInfo[];
  mosaicConfig: MosaicConfig;
  outputOpen: boolean;
  isSpannedActive: boolean;
  onChangeMosaicConfig: (next: MosaicConfig) => void;
  onRefreshDisplays: () => void;
  onApplyAndLaunchOutput: (windowed?: boolean) => void;
}

export const MosaicSetupModal: React.FC<MosaicSetupModalProps> = ({
  isOpen,
  onClose,
  displays,
  mosaicConfig,
  outputOpen,
  isSpannedActive,
  onChangeMosaicConfig,
  onRefreshDisplays,
  onApplyAndLaunchOutput,
}) => {
  if (!isOpen) return null;

  const d1 =
    displays.find((d) => d.id === mosaicConfig.display1Id) ||
    displays.find((d) => !d.isPrimary) ||
    displays[0];

  const d2 =
    displays.find((d) => d.id === mosaicConfig.display2Id && d.id !== d1?.id) ||
    displays.find((d) => d.id !== d1?.id) ||
    d1;

  const overlap = Math.max(0, mosaicConfig.overlapPx || 0);

  let totalW = d1?.physicalWidth || 1920;
  let totalH = d1?.physicalHeight || 1080;

  if (mosaicConfig.mode === 'horizontal_2x1' && d1 && d2) {
    totalW = d1.physicalWidth + d2.physicalWidth - overlap;
    totalH = Math.max(d1.physicalHeight, d2.physicalHeight);
  } else if (mosaicConfig.mode === 'vertical_1x2' && d1 && d2) {
    totalW = Math.max(d1.physicalWidth, d2.physicalWidth);
    totalH = d1.physicalHeight + d2.physicalHeight - overlap;
  }

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const div = gcd(totalW, totalH) || 1;
  const aspectStr = `${Math.round(totalW / div)}:${Math.round(totalH / div)}`;

  const handleSwapOutputs = () => {
    if (!d1 || !d2) return;
    onChangeMosaicConfig({
      ...mosaicConfig,
      display1Id: d2.id,
      display2Id: d1.id,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        style={{ width: 920 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            <Layers size={18} className="cyan-text" />
            <span>
              CONFIGURADOR MULTIPANTALLA, FORMATOS CUSTOM EDID Y MOSAICO SÍNCRONO (2×1 / 1×2)
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="top-btn"
              onClick={onRefreshDisplays}
              title="Re-escanear pantallas y resoluciones EDID en Windows"
            >
              <RefreshCw size={13} />
              <span>Detectar Señales Windows</span>
            </button>
            <button className="row-icon-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {/* 1. Detected Displays in Windows */}
          <div>
            <div className="insp-label" style={{ marginBottom: 6 }}>
              SALIDAS DE VÍDEO DETECTADAS EN WINDOWS ({displays.length} CONECTADAS)
            </div>
            <div className="detected-displays-grid">
              {displays.map((d, idx) => (
                <div
                  key={d.id}
                  className={`detected-display-card ${d.isPrimary ? 'primary' : 'external'}`}
                >
                  <div className="dd-top">
                    <span className="dd-index">PANTALLA #{idx + 1}</span>
                    {d.isPrimary ? (
                      <span className="dd-badge primary">CABINA / PRINCIPAL</span>
                    ) : d.isCustomFormat ? (
                      <span className="dd-badge custom">FORMATO CUSTOM EDID</span>
                    ) : (
                      <span className="dd-badge ext">SALIDA EXTERNA</span>
                    )}
                  </div>
                  <div className="dd-res">
                    {d.physicalWidth} × {d.physicalHeight} px
                    <span className="dd-hz">@ {d.refreshRate}Hz</span>
                  </div>
                  <div className="dd-meta">
                    <span>Posición Windows: ({d.x}, {d.y})</span>
                    <span>• Escala DPI: {Math.round(d.scaleFactor * 100)}%</span>
                    <span>• {d.colorDepth} bits</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Mosaic Mode Selector */}
          <div>
            <div className="insp-label" style={{ marginBottom: 6 }}>
              MODO DE COMPOSICIÓN DE SALIDA / MOSAICO
            </div>
            <div className="mosaic-mode-cards">
              {(
                [
                  {
                    id: 'single',
                    icon: <Monitor size={18} />,
                    title: '1 Salida Única',
                    desc: '1 proyector o procesador LED (4K / 1080p / Custom EDID)',
                  },
                  {
                    id: 'horizontal_2x1',
                    icon: <Columns size={18} />,
                    title: 'Mosaico Horizontal (2×1)',
                    desc: 'Une Salida 1 (Izquierda) + Salida 2 (Derecha) en sincronía',
                  },
                  {
                    id: 'vertical_1x2',
                    icon: <Rows size={18} />,
                    title: 'Mosaico Vertical (1×2)',
                    desc: 'Une Salida 1 (Arriba) + Salida 2 (Abajo) en sincronía',
                  },
                  {
                    id: 'mirror_2x',
                    icon: <Copy size={18} />,
                    title: 'Doble Espejo (Clon 1+2)',
                    desc: 'Envía el mismo Program a 2 salidas 4K simultáneamente',
                  },
                ] as { id: MosaicMode; icon: React.ReactNode; title: string; desc: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  className={`mosaic-mode-card ${mosaicConfig.mode === m.id ? 'selected' : ''}`}
                  onClick={() =>
                    onChangeMosaicConfig({
                      ...mosaicConfig,
                      mode: m.id,
                      display1Id: d1?.id ?? null,
                      display2Id: d2?.id ?? null,
                    })
                  }
                >
                  <div className="mm-icon">{m.icon}</div>
                  <div className="mm-text">
                    <strong>{m.title}</strong>
                    <small>{m.desc}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Output Mapping & Visual Canvas Preview */}
          <div className="modal-2col">
            <div className="insp-group">
              <label className="insp-label">ASIGNACIÓN DE SALIDAS FÍSICAS</label>

              <div>
                <small style={{ color: '#10b981', fontWeight: 700 }}>
                  {mosaicConfig.mode === 'horizontal_2x1'
                    ? 'SALIDA 1 (MITAD IZQUIERDA DEL MOSAICO)'
                    : mosaicConfig.mode === 'vertical_1x2'
                    ? 'SALIDA 1 (MITAD SUPERIOR DEL MOSAICO)'
                    : 'SALIDA 1 PRINCIPAL'}
                </small>
                <select
                  className="insp-select"
                  style={{ marginTop: 4 }}
                  value={d1?.id || ''}
                  onChange={(e) =>
                    onChangeMosaicConfig({
                      ...mosaicConfig,
                      display1Id: Number(e.target.value),
                    })
                  }
                >
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {mosaicConfig.mode !== 'single' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                    <button
                      className="top-btn"
                      onClick={handleSwapOutputs}
                      title="Intercambiar Salida 1 con Salida 2 sin tocar cables ni ajustes de Windows"
                    >
                      <ArrowLeftRight size={13} />
                      <span>Invertir Orden (Salida 1 ↔ Salida 2)</span>
                    </button>
                  </div>

                  <div>
                    <small style={{ color: '#38bdf8', fontWeight: 700 }}>
                      {mosaicConfig.mode === 'horizontal_2x1'
                        ? 'SALIDA 2 (MITAD DERECHA DEL MOSAICO)'
                        : mosaicConfig.mode === 'vertical_1x2'
                        ? 'SALIDA 2 (MITAD INFERIOR DEL MOSAICO)'
                        : 'SALIDA 2 ESPEJO'}
                    </small>
                    <select
                      className="insp-select"
                      style={{ marginTop: 4 }}
                      value={d2?.id || ''}
                      onChange={(e) =>
                        onChangeMosaicConfig({
                          ...mosaicConfig,
                          display2Id: Number(e.target.value),
                        })
                      }
                    >
                      {displays.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Overlap & Spanned Engine Options */}
              {mosaicConfig.mode !== 'single' && mosaicConfig.mode !== 'mirror_2x' && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="insp-row-2col">
                    <div>
                      <small>Overlap / Solapamiento (px)</small>
                      <input
                        type="number"
                        className="insp-input"
                        min={0}
                        max={1920}
                        step={4}
                        value={mosaicConfig.overlapPx}
                        onChange={(e) =>
                          onChangeMosaicConfig({
                            ...mosaicConfig,
                            overlapPx: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={mosaicConfig.preferSpannedWindow}
                          onChange={(e) =>
                            onChangeMosaicConfig({
                              ...mosaicConfig,
                              preferSpannedWindow: e.target.checked,
                            })
                          }
                        />
                        <span>Superficie Única VRAM (Spanned)</span>
                      </label>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          fontSize: 11,
                          marginTop: 4,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={mosaicConfig.showSeamGuideInPreview}
                          onChange={(e) =>
                            onChangeMosaicConfig({
                              ...mosaicConfig,
                              showSeamGuideInPreview: e.target.checked,
                            })
                          }
                        />
                        <span>Mostrar guía de unión en PGM</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Visual Preview of Virtual Mosaic Canvas */}
            <div className="insp-group" style={{ justifyContent: 'space-between' }}>
              <div className="insp-label-flex">
                <span className="insp-label">LIENZO VIRTUAL RESULTANTE</span>
                <span className="db-readout">
                  {totalW} × {totalH} px ({aspectStr})
                </span>
              </div>

              <div className="mosaic-diagram-stage">
                {mosaicConfig.mode === 'horizontal_2x1' && (
                  <div className="mosaic-vis-horiz">
                    <div className="m-tile slot1">
                      <strong>SALIDA 1 (IZQ)</strong>
                      <span>
                        {d1?.physicalWidth}×{d1?.physicalHeight}
                      </span>
                    </div>
                    <div className="m-tile slot2">
                      <strong>SALIDA 2 (DER)</strong>
                      <span>
                        {d2?.physicalWidth}×{d2?.physicalHeight}
                      </span>
                    </div>
                  </div>
                )}

                {mosaicConfig.mode === 'vertical_1x2' && (
                  <div className="mosaic-vis-vert">
                    <div className="m-tile slot1">
                      <strong>SALIDA 1 (SUPERIOR)</strong>
                      <span>
                        {d1?.physicalWidth}×{d1?.physicalHeight}
                      </span>
                    </div>
                    <div className="m-tile slot2">
                      <strong>SALIDA 2 (INFERIOR)</strong>
                      <span>
                        {d2?.physicalWidth}×{d2?.physicalHeight}
                      </span>
                    </div>
                  </div>
                )}

                {(mosaicConfig.mode === 'single' || mosaicConfig.mode === 'mirror_2x') && (
                  <div className="mosaic-vis-single">
                    <div className="m-tile slot1">
                      <strong>
                        {mosaicConfig.mode === 'mirror_2x'
                          ? 'SALIDA 1 + SALIDA 2 (CLON ESPEJO)'
                          : 'SALIDA ÚNICA'}
                      </strong>
                      <span>
                        {d1?.physicalWidth}×{d1?.physicalHeight} @ {d1?.refreshRate}Hz
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mosaic-sync-note">
                <CheckCircle2 size={14} className="emerald-text" />
                <span>
                  {outputOpen && isSpannedActive
                    ? 'Superficie Única Directa (VRAM Spanned) activa: 0 fotogramas de desfase.'
                    : 'Sincronización Frame-Lock activa para formatos estándar (1080p/4K) y EDID Custom.'}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              className="toolbar-action-btn secondary"
              onClick={() => {
                onApplyAndLaunchOutput(true);
                onClose();
              }}
              title="Abre una ventana de prueba con la proporción exacta del Mosaico en tu monitor principal"
            >
              <ExternalLink size={14} />
              <span>Probar Lienzo Mosaico en Ventana Flotante</span>
            </button>

            <button
              className="toolbar-action-btn primary"
              onClick={() => {
                onApplyAndLaunchOutput(false);
                onClose();
              }}
            >
              <Layers size={15} />
              <span>
                {outputOpen
                  ? 'Actualizar Mosaico en Pantallas de Salida'
                  : 'Activar Salida Mosaico en Pantallas'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
