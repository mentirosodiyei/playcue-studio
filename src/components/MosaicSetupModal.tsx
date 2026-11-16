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
  Settings,
  ExternalLink,
  Monitor as MonitorIcon,
} from 'lucide-react';
import { DisplayInfo, MosaicConfig, MosaicMode, AutoStartConfig } from '../types/cue';

import { tr } from '../i18n';

const PROJECT_URL = 'https://github.com/mentirosodiyei/playcue-studio';

export interface AudioOutputDevice {
  id: string;
  label: string;
}

interface MosaicSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  displays: DisplayInfo[];
  mosaicConfig: MosaicConfig;
  outputOpen: boolean;
  isSpannedActive: boolean;
  audioDevices: AudioOutputDevice[];
  /** '' = system default output */
  audioOutputId: string;
  onChangeAudioOutput: (deviceId: string) => void;
  autoStart: AutoStartConfig;
  onChangeAutoStart: (next: AutoStartConfig) => void;
  onChangeMosaicConfig: (next: MosaicConfig) => void;
  onRefreshDisplays: () => void;
  onApplyAndLaunchOutput: (windowed?: boolean) => void;
}

/** Update checks: automatic-check toggle, manual check button and result line. */
const UpdateSection: React.FC = () => {
  const [auto, setAuto] = React.useState(true);
  const [version, setVersion] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    void window.electronAPI?.getUpdateSettings?.().then((s) => {
      if (!s) return;
      setAuto(s.auto);
      setVersion(s.version);
    });
  }, []);

  const check = async () => {
    setBusy(true);
    setMsg(tr('Buscando actualizaciones...'));
    try {
      const r = await window.electronAPI?.checkForUpdates?.();
      if (!r) setMsg(tr('No se pudo comprobar. Revisa tu conexión a Internet.'));
      else if (r.status === 'uptodate') setMsg(tr('Tienes la última versión.'));
      else if (r.status === 'available') setMsg(tr('Hay una versión nueva: {v}', { v: r.latest ?? '' }));
      else if (r.status === 'busy') setMsg(tr('Ya se está buscando...'));
      else setMsg(tr('No se pudo comprobar. Revisa tu conexión a Internet.'));
    } catch {
      setMsg(tr('No se pudo comprobar. Revisa tu conexión a Internet.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 12,
        margin: '14px 0 10px',
        fontSize: 12,
        color: '#cbd5e1',
      }}
    >
      <span style={{ fontWeight: 700, color: '#94a3b8' }}>
        {tr('ACTUALIZACIONES')}
        {version ? ` · v${version}` : ''}
      </span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAuto(e.target.checked);
            void window.electronAPI?.setAutoUpdateCheck?.(e.target.checked);
          }}
        />
        {tr('Buscar actualizaciones automáticamente')}
      </label>
      <button className="top-btn" disabled={busy} onClick={check}>
        <span>{tr('Buscar ahora')}</span>
      </button>
      {msg && <span style={{ color: '#38bdf8' }}>{msg}</span>}
    </div>
  );
};

/** Scheduled show start (saved with the show) + start the app with the system. */
const AutoStartSection: React.FC<{
  autoStart: AutoStartConfig;
  onChange: (next: AutoStartConfig) => void;
}> = ({ autoStart, onChange }) => {
  const [login, setLogin] = React.useState<{ supported: boolean; openAtLogin: boolean }>({
    supported: false,
    openAtLogin: false,
  });
  React.useEffect(() => {
    void window.electronAPI?.getLoginItem?.().then((s) => s && setLogin(s));
  }, []);

  const set = (patch: Partial<AutoStartConfig>) => onChange({ ...autoStart, ...patch });
  const needsDate = autoStart.mode === 'atDateTime';
  const needsTime = autoStart.mode === 'atDateTime' || autoStart.mode === 'daily';
  const hint =
    autoStart.mode === 'onLaunch'
      ? tr('Al abrir la aplicación se activarán las salidas y se lanzará el primer cue.')
      : needsTime
      ? tr('A esa hora se activarán las salidas y se lanzará el primer cue. La app debe estar abierta. Se guarda con el show.')
      : '';

  return (
    <div style={{ marginTop: 14 }}>
      <label className="insp-label">{tr('INICIO AUTOMÁTICO DEL SHOW')}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
        <select
          className="insp-select"
          style={{ flex: '1 1 220px', minWidth: 0 }}
          value={autoStart.mode}
          onChange={(e) => set({ mode: e.target.value as AutoStartConfig['mode'] })}
        >
          <option value="off">{tr('Manual (no iniciar solo)')}</option>
          <option value="onLaunch">{tr('Al abrir la aplicación')}</option>
          <option value="atDateTime">{tr('En una fecha y hora concretas')}</option>
          <option value="daily">{tr('Todos los días a una hora')}</option>
        </select>
        {needsDate && (
          <input
            className="insp-select"
            type="date"
            style={{ flex: '0 0 auto' }}
            value={autoStart.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        )}
        {needsTime && (
          <input
            className="insp-select"
            type="time"
            style={{ flex: '0 0 auto' }}
            value={autoStart.time}
            onChange={(e) => set({ time: e.target.value })}
          />
        )}
      </div>
      {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 10,
          fontSize: 12,
          cursor: login.supported ? 'pointer' : 'not-allowed',
          opacity: login.supported ? 1 : 0.5,
        }}
        title={login.supported ? '' : tr('Solo disponible en la versión instalada')}
      >
        <input
          type="checkbox"
          disabled={!login.supported}
          checked={login.openAtLogin}
          onChange={(e) => {
            void window.electronAPI
              ?.setLoginItem?.(e.target.checked)
              .then((v) => setLogin((p) => ({ ...p, openAtLogin: !!v })));
          }}
        />
        {tr('Iniciar la aplicación al arrancar el sistema')}
      </label>
    </div>
  );
};

export const MosaicSetupModal: React.FC<MosaicSetupModalProps> = ({
  isOpen,
  onClose,
  displays,
  mosaicConfig,
  outputOpen,
  isSpannedActive,
  audioDevices,
  audioOutputId,
  onChangeAudioOutput,
  autoStart,
  onChangeAutoStart,
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

  // The preview box has exactly the aspect ratio of the real output canvas
  const canvasRatio = totalW / Math.max(1, totalH);
  const PREVIEW_MAX_H = 150;
  const previewBoxStyle: React.CSSProperties = {
    aspectRatio: `${totalW} / ${totalH}`,
    height: 'auto',
    width: `min(100%, ${Math.round(canvasRatio * PREVIEW_MAX_H)}px)`,
    maxHeight: PREVIEW_MAX_H,
  };

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
            <Settings size={18} className="cyan-text" />
            <span>{tr("Configuración")}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="top-btn"
              onClick={onRefreshDisplays}
              title={tr("Volver a detectar pantallas y resoluciones en Windows")}
            >
              <RefreshCw size={13} />
              <span>{tr("Detectar pantallas")}</span>
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
              {tr("SALIDAS DE VÍDEO DETECTADAS (")}{displays.length} {tr("CONECTADAS)")}
            </div>
            <div className="detected-displays-grid">
              {displays.map((d, idx) => (
                <div
                  key={d.id}
                  className={`detected-display-card ${d.isPrimary ? 'primary' : 'external'}`}
                >
                  <div className="dd-top">
                    <span className="dd-index">{tr("PANTALLA #")}{idx + 1}</span>
                    {d.isPrimary ? (
                      <span className="dd-badge primary">{tr("CABINA / PRINCIPAL")}</span>
                    ) : d.isCustomFormat ? (
                      <span className="dd-badge custom">{tr("FORMATO CUSTOM EDID")}</span>
                    ) : (
                      <span className="dd-badge ext">{tr("SALIDA EXTERNA")}</span>
                    )}
                  </div>
                  <div className="dd-res">
                    {d.physicalWidth} × {d.physicalHeight} px
                    <span className="dd-hz">@ {d.refreshRate}{tr("Hz")}</span>
                  </div>
                  <div className="dd-meta">
                    <span>{tr("Posición Windows: (")}{d.x}, {d.y})</span>
                    <span>{tr("• Escala DPI:")} {Math.round(d.scaleFactor * 100)}%</span>
                    <span>• {d.colorDepth} {tr("bits")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Output composition mode */}
          <div>
            <div className="insp-label" style={{ marginBottom: 6 }}>
              {tr("MODO DE SALIDA")}
            </div>
            <div className="mosaic-mode-cards">
              {(
                [
                  {
                    id: 'single',
                    icon: <Monitor size={18} />,
                    title: tr("1 Salida Única"),
                    desc: tr("1 proyector o procesador LED (4K / 1080p / Custom EDID)"),
                  },
                  {
                    id: 'horizontal_2x1',
                    icon: <Columns size={18} />,
                    title: tr("Mosaico Horizontal (2×1)"),
                    desc: tr("Une Salida 1 (Izquierda) + Salida 2 (Derecha) en sincronía"),
                  },
                  {
                    id: 'vertical_1x2',
                    icon: <Rows size={18} />,
                    title: tr("Mosaico Vertical (1×2)"),
                    desc: tr("Une Salida 1 (Arriba) + Salida 2 (Abajo) en sincronía"),
                  },
                  {
                    id: 'mirror_2x',
                    icon: <Copy size={18} />,
                    title: tr("Doble Espejo (Clon 1+2)"),
                    desc: tr("Envía el mismo Program a 2 salidas 4K simultáneamente"),
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

          {/* 3. Output mapping (video + audio) & visual canvas preview */}
          <div className="modal-2col">
            <div className="insp-group">
              <label className="insp-label">{tr("ASIGNACIÓN DE SALIDAS FÍSICAS")}</label>

              <div>
                <small style={{ color: '#10b981', fontWeight: 700 }}>
                  {mosaicConfig.mode === 'horizontal_2x1'
                    ? tr("SALIDA 1 (MITAD IZQUIERDA DEL MOSAICO)")
                    : mosaicConfig.mode === 'vertical_1x2'
                    ? tr("SALIDA 1 (MITAD SUPERIOR DEL MOSAICO)")
                    : tr("SALIDA 1 PRINCIPAL")}
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
                      title={tr("Intercambiar Salida 1 con Salida 2 sin tocar cables ni ajustes de Windows")}
                    >
                      <ArrowLeftRight size={13} />
                      <span>{tr("Invertir Orden (Salida 1 ↔ Salida 2)")}</span>
                    </button>
                  </div>

                  <div>
                    <small style={{ color: '#38bdf8', fontWeight: 700 }}>
                      {mosaicConfig.mode === 'horizontal_2x1'
                        ? tr("SALIDA 2 (MITAD DERECHA DEL MOSAICO)")
                        : mosaicConfig.mode === 'vertical_1x2'
                        ? tr("SALIDA 2 (MITAD INFERIOR DEL MOSAICO)")
                        : tr("SALIDA 2 ESPEJO")}
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
                      <small>{tr("Overlap / Solapamiento (px)")}</small>
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
                        <span>{tr("Superficie Única VRAM (Spanned)")}</span>
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
                        <span>{tr("Mostrar guía de unión en PGM")}</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
              {/* Audio output device */}
              <div style={{ marginTop: 10 }}>
                <small style={{ color: '#f59e0b', fontWeight: 700 }}>{tr("SALIDA DE AUDIO")}</small>
                <select
                  className="insp-select"
                  style={{ marginTop: 4 }}
                  value={audioOutputId}
                  onChange={(e) => onChangeAudioOutput(e.target.value)}
                  title={tr("Dispositivo por el que sale el audio de la app")}
                >
                  <option value="">{tr("Predeterminado del sistema")}</option>
                  {audioDevices.map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.label}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Visual Preview of the virtual canvas (same aspect ratio as the real output) */}
            <div className="insp-group" style={{ justifyContent: 'space-between' }}>
              <div className="insp-label-flex">
                <span className="insp-label">{tr("LIENZO VIRTUAL RESULTANTE")}</span>
                <span className="db-readout">
                  {totalW} × {totalH} {tr("px (")}{aspectStr})
                </span>
              </div>

              <div className="mosaic-diagram-stage">
                {mosaicConfig.mode === 'horizontal_2x1' && (
                  <div className="mosaic-vis-horiz" style={previewBoxStyle}>
                    <div className="m-tile slot1" style={{ flex: `${d1?.physicalWidth || 1} 1 0` }}>
                      <strong>{tr("SALIDA 1 (IZQ)")}</strong>
                      <span>
                        {d1?.physicalWidth}×{d1?.physicalHeight}
                      </span>
                    </div>
                    <div className="m-tile slot2" style={{ flex: `${d2?.physicalWidth || 1} 1 0` }}>
                      <strong>{tr("SALIDA 2 (DER)")}</strong>
                      <span>
                        {d2?.physicalWidth}×{d2?.physicalHeight}
                      </span>
                    </div>
                  </div>
                )}

                {mosaicConfig.mode === 'vertical_1x2' && (
                  <div className="mosaic-vis-vert" style={previewBoxStyle}>
                    <div className="m-tile slot1" style={{ flex: `${d1?.physicalHeight || 1} 1 0` }}>
                      <strong>{tr("SALIDA 1 (SUPERIOR)")}</strong>
                      <span>
                        {d1?.physicalWidth}×{d1?.physicalHeight}
                      </span>
                    </div>
                    <div className="m-tile slot2" style={{ flex: `${d2?.physicalHeight || 1} 1 0` }}>
                      <strong>{tr("SALIDA 2 (INFERIOR)")}</strong>
                      <span>
                        {d2?.physicalWidth}×{d2?.physicalHeight}
                      </span>
                    </div>
                  </div>
                )}

                {(mosaicConfig.mode === 'single' || mosaicConfig.mode === 'mirror_2x') && (
                  <div className="mosaic-vis-single" style={previewBoxStyle}>
                    <div className="m-tile slot1">
                      <strong>
                        {mosaicConfig.mode === 'mirror_2x'
                          ? tr("SALIDA 1 + SALIDA 2 (CLON ESPEJO)")
                          : tr("SALIDA ÚNICA")}
                      </strong>
                      <span>
                        {d1?.physicalWidth}×{d1?.physicalHeight} @ {d1?.refreshRate}{tr("Hz")}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mosaic-sync-note">
                <CheckCircle2 size={14} className="emerald-text" />
                <span>
                  {outputOpen && isSpannedActive
                    ? tr("Superficie Única Directa (VRAM Spanned) activa: 0 fotogramas de desfase.")
                    : tr("Sincronización Frame-Lock activa para formatos estándar (1080p/4K) y EDID Custom.")}
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
              title={tr("Abre una ventana de prueba con la proporción exacta de la salida en tu monitor principal")}
            >
              <ExternalLink size={14} />
              <span>{tr("Probar Salida en Ventana Flotante")}</span>
            </button>

            <button
              className="toolbar-action-btn primary"
              onClick={() => {
                onApplyAndLaunchOutput(false);
                onClose();
              }}
            >
              <MonitorIcon size={15} />
              <span>
                {outputOpen
                  ? tr("Actualizar Salida en Pantallas")
                  : tr("Activar Salida en Pantallas")}
              </span>
            </button>
          </div>

          <AutoStartSection autoStart={autoStart} onChange={onChangeAutoStart} />
          <UpdateSection />

          {/* Credits */}
          <div
            style={{
              marginTop: 2,
              paddingTop: 10,
              borderTop: '1px solid rgba(148, 163, 184, 0.18)',
              textAlign: 'center',
              fontSize: 11,
              color: '#94a3b8',
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 700, color: '#cbd5e1' }}>{tr("PlayCue Studio")}</div>
            <div>{tr("David Redondo García")}</div>
            <div>{tr("¿Algún problema? Cuéntalo en la página del proyecto:")}</div>
            <a
              href={PROJECT_URL}
              onClick={(e) => {
                e.preventDefault();
                void window.electronAPI?.openExternal?.(PROJECT_URL);
              }}
              style={{ color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {PROJECT_URL.replace('https://', '')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
