import React from 'react';
import { X, Radio, Terminal, Keyboard, Copy, Check } from 'lucide-react';
import { RemoteCommandLog } from '../types/cue';

import { tr } from '../i18n';
interface RemoteCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
  remoteInfo: { oscPort: number; httpPort: number; ips: string[] };
  logs: RemoteCommandLog[];
}

export const RemoteCompanionModal: React.FC<RemoteCompanionModalProps> = ({
  isOpen,
  onClose,
  remoteInfo,
  logs,
}) => {
  const [copiedText, setCopiedText] = React.useState<string | null>(null);
  const [installMsg, setInstallMsg] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedText(txt);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const handleInstallModule = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.installCompanionModule();
    if (res.ok) {
      setInstallMsg(tr("Módulo instalado en: {dir} (Reinicia o recarga módulos en Companion)", { dir: res.targetDir ?? "" }));
    } else {
      setInstallMsg(`Error: ${res.error}`);
    }
  };

  const primaryIp = remoteInfo.ips.find((ip) => ip !== '127.0.0.1') || '127.0.0.1';

  const endpoints = [
    { label: tr("TAKE (Preview → Program)"), osc: '/pbp/take', http: '/api/take' },
    { label: tr("CUT Directo"), osc: '/mitti/cut', http: '/api/cut' },
    { label: tr("Play / Pause Program"), osc: '/mitti/togglePlay', http: '/api/toggle-play' },
    { label: tr("Play Program"), osc: '/mitti/play', http: '/api/play' },
    { label: tr("Pause Program"), osc: '/mitti/pause', http: '/api/pause' },
    { label: tr("Ir a -10s del final"), osc: '/mitti/goto10', http: '/api/goto-end/10' },
    { label: tr("Ir a -20s del final"), osc: '/mitti/goto20', http: '/api/goto-end/20' },
    { label: tr("Ir a -30s del final"), osc: '/mitti/goto30', http: '/api/goto-end/30' },
    { label: tr("Blackout (Fade to Black)"), osc: '/mitti/blackout', http: '/api/blackout' },
    { label: tr("Freeze (Congelar Salida)"), osc: '/mitti/freeze', http: '/api/freeze' },
    { label: tr("PANIC (Stop & Blackout)"), osc: '/mitti/panic', http: '/api/panic' },
    { label: tr("Cargar Cue N en Preview"), osc: '/mitti/jumpToCue [int]', http: '/cue/1/load' },
    { label: tr("Lanzar Cue N a Program"), osc: '/mitti/playCue [int]', http: '/cue/1/take' },
    { label: tr("Fondo Vídeo Ampliado + Blur 90%"), osc: '/mitti/bgblur', http: '/api/blur-toggle' },
    { label: tr("Modo Escala (fit / fill / stretch)"), osc: '/scale/mode [str]', http: '/api/scale-mode?value=fill' },
    { label: tr("Aspect Ratio (native/output/16:9/4:3)"), osc: '/aspect/ratio [str]', http: '/api/aspect-ratio?value=output' },
    { label: tr("Zoom en Salida (50% a 300%)"), osc: '/zoom [int]', http: '/api/zoom?value=133' },
    { label: tr("Estado JSON en tiempo real"), osc: '-', http: '/api/status' },
  ];

  const shortcuts = [
    { key: 'ESPACIO', desc: tr("Play / Pause en Program (PGM)") },
    { key: 'ENTER / F1', desc: tr("TAKE (Transición de Preview a Program)") },
    { key: 'F2', desc: tr("CUT Directo (0s de Preview a Program)") },
    { key: 'T', desc: tr("Saltar a -10s antes del final en Program (Test End)") },
    { key: 'B', desc: tr("Activar / Desactivar BLACKOUT en Salida") },
    { key: 'F', desc: tr("Activar / Desactivar FREEZE (Congelar imagen)") },
    { key: 'ESC', desc: tr("PANIC (Pausar y activar Blackout de emergencia)") },
    { key: 'I / O', desc: tr("Marcar punto IN / punto OUT en Preview") },
    { key: 'L', desc: tr("Alternar modo LOOP en el vídeo actual de Program") },
    { key: 'R', desc: tr("Reiniciar clip de Program al punto IN") },
    { key: '↑ / ↓', desc: tr("Seleccionar Cue anterior / siguiente en escaleta") },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Radio size={18} className="emerald-text" />
            <span>{tr("CONTROL REMOTO: BITFOCUS COMPANION (OSC / HTTP) & ATAJOS")}</span>
          </div>
          <button className="row-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Native Companion Module Auto-Installer Banner */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid #10b981',
              borderRadius: 6,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <strong style={{ color: '#34d399', fontSize: 12 }}>
                {tr("MÓDULO NATIVO BITFOCUS COMPANION (PlayCue Studio v1.6.1)")}
              </strong>
              <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>
                {tr("Incluye Presets listos para arrastrar: Lanzar vídeos a Previo (PRV), Directo a Programa (PGM con transición de la app), Botón TAKE, Cuenta Atrás con colores, Transiciones, End-Actions y Mosaico 2×1/1×2.")}
              </div>
              {installMsg && (
                <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 4, fontWeight: 700 }}>
                  {installMsg}
                </div>
              )}
            </div>
            <button
              className="toolbar-action-btn primary"
              style={{ whiteSpace: 'nowrap' }}
              onClick={handleInstallModule}
            >
              {tr("Instalar en Companion Local")}
            </button>
          </div>

          {/* Server Status Banner */}
          <div className="remote-status-cards">
            <div className="remote-card">
              <span className="remote-card-label">{tr("SERVIDOR OSC UDP (Mitti / PlaybackPro+)")}</span>
              <strong className="emerald-text">
                {primaryIp} : {remoteInfo.oscPort}
              </strong>
              <small>{tr("Compatible con módulo Generic OSC o Mitti en Companion")}</small>
            </div>
            <div className="remote-card">
              <span className="remote-card-label">{tr("API HTTP REST + TELEMETRÍA JSON")}</span>
              <strong className="cyan-text">
                {tr("http://")}{primaryIp}:{remoteInfo.httpPort}
              </strong>
              <small>{tr("Compatible con Generic HTTP en Bitfocus Companion / StreamDeck")}</small>
            </div>
          </div>

          <div className="modal-2col">
            {/* Endpoints Table */}
            <div className="modal-col">
              <h4>
                <Terminal size={14} /> {tr("Comandos OSC & HTTP")}
              </h4>
              <div className="endpoints-list">
                {endpoints.map((ep, i) => (
                  <div key={i} className="endpoint-row">
                    <div className="ep-desc">{ep.label}</div>
                    <div className="ep-codes">
                      {ep.osc !== '-' && (
                        <button
                          className="code-copy-pill"
                          onClick={() => copy(ep.osc)}
                          title={tr("Copiar dirección OSC")}
                        >
                          <span>OSC: {ep.osc}</span>
                          {copiedText === ep.osc ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      )}
                      <button
                        className="code-copy-pill http"
                        onClick={() => copy(`http://127.0.0.1:${remoteInfo.httpPort}${ep.http}`)}
                        title={tr("Copiar URL HTTP completa")}
                      >
                        <span>HTTP: {ep.http}</span>
                        {copiedText?.endsWith(ep.http) ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shortcuts & Live Log */}
            <div className="modal-col">
              <h4>
                <Keyboard size={14} /> {tr("Atajos de Teclado en Directo")}
              </h4>
              <div className="shortcuts-grid">
                {shortcuts.map((s, idx) => (
                  <div key={idx} className="shortcut-item">
                    <kbd>{s.key}</kbd>
                    <span>{s.desc}</span>
                  </div>
                ))}
              </div>

              <h4 style={{ marginTop: 14 }}>
                <Radio size={14} /> {tr("Monitor de Comandos Recibidos (")}{logs.length})
              </h4>
              <div className="osc-log-box">
                {logs.length === 0 ? (
                  <div className="osc-log-empty">
                    {tr("Esperando paquetes OSC (UDP")} {remoteInfo.oscPort}{tr(") o peticiones HTTP (")}
                    {remoteInfo.httpPort})...
                  </div>
                ) : (
                  logs.map((l, i) => (
                    <div key={i} className="osc-log-line">
                      <span className="log-time">[{l.timestamp}]</span>
                      <span className={`log-proto ${l.source.toLowerCase()}`}>{l.source}</span>
                      <span className="log-addr">{l.rawAddress}</span>
                      <span className="log-act">→ {l.action}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
