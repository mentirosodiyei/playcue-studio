import React from 'react';
import { X, Radio, Terminal, Keyboard, Copy, Check } from 'lucide-react';
import { RemoteCommandLog } from '../types/cue';

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

  if (!isOpen) return null;

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedText(txt);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const primaryIp = remoteInfo.ips.find((ip) => ip !== '127.0.0.1') || '127.0.0.1';

  const endpoints = [
    { label: 'TAKE (Preview → Program)', osc: '/pbp/take', http: '/api/take' },
    { label: 'CUT Directo', osc: '/mitti/cut', http: '/api/cut' },
    { label: 'Play / Pause Program', osc: '/mitti/togglePlay', http: '/api/toggle-play' },
    { label: 'Play Program', osc: '/mitti/play', http: '/api/play' },
    { label: 'Pause Program', osc: '/mitti/pause', http: '/api/pause' },
    { label: 'Ir a -10s del final', osc: '/mitti/goto10', http: '/api/goto-end/10' },
    { label: 'Ir a -20s del final', osc: '/mitti/goto20', http: '/api/goto-end/20' },
    { label: 'Ir a -30s del final', osc: '/mitti/goto30', http: '/api/goto-end/30' },
    { label: 'Blackout (Fade to Black)', osc: '/mitti/blackout', http: '/api/blackout' },
    { label: 'Freeze (Congelar Salida)', osc: '/mitti/freeze', http: '/api/freeze' },
    { label: 'PANIC (Stop & Blackout)', osc: '/mitti/panic', http: '/api/panic' },
    { label: 'Cargar Cue N en Preview', osc: '/mitti/jumpToCue [int]', http: '/cue/1/load' },
    { label: 'Lanzar Cue N a Program', osc: '/mitti/playCue [int]', http: '/cue/1/take' },
    { label: 'Estado JSON en tiempo real', osc: '-', http: '/api/status' },
  ];

  const shortcuts = [
    { key: 'ESPACIO', desc: 'Play / Pause en Program (PGM)' },
    { key: 'ENTER / F1', desc: 'TAKE (Transición de Preview a Program)' },
    { key: 'F2', desc: 'CUT Directo (0s de Preview a Program)' },
    { key: 'T', desc: 'Saltar a -10s antes del final en Program (Test End)' },
    { key: 'B', desc: 'Activar / Desactivar BLACKOUT en Salida' },
    { key: 'F', desc: 'Activar / Desactivar FREEZE (Congelar imagen)' },
    { key: 'ESC', desc: 'PANIC (Pausar y activar Blackout de emergencia)' },
    { key: 'I / O', desc: 'Marcar punto IN / punto OUT en Preview' },
    { key: 'L', desc: 'Alternar modo LOOP en el vídeo actual de Program' },
    { key: 'R', desc: 'Reiniciar clip de Program al punto IN' },
    { key: '↑ / ↓', desc: 'Seleccionar Cue anterior / siguiente en escaleta' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Radio size={18} className="emerald-text" />
            <span>CONTROL REMOTO: BITFOCUS COMPANION (OSC / HTTP) & ATAJOS</span>
          </div>
          <button className="row-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Server Status Banner */}
          <div className="remote-status-cards">
            <div className="remote-card">
              <span className="remote-card-label">SERVIDOR OSC UDP (Mitti / PlaybackPro+)</span>
              <strong className="emerald-text">
                {primaryIp} : {remoteInfo.oscPort}
              </strong>
              <small>Compatible con módulo Generic OSC o Mitti en Companion</small>
            </div>
            <div className="remote-card">
              <span className="remote-card-label">API HTTP REST + TELEMETRÍA JSON</span>
              <strong className="cyan-text">
                http://{primaryIp}:{remoteInfo.httpPort}
              </strong>
              <small>Compatible con Generic HTTP en Bitfocus Companion / StreamDeck</small>
            </div>
          </div>

          <div className="modal-2col">
            {/* Endpoints Table */}
            <div className="modal-col">
              <h4>
                <Terminal size={14} /> Comandos OSC & HTTP
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
                          title="Copiar dirección OSC"
                        >
                          <span>OSC: {ep.osc}</span>
                          {copiedText === ep.osc ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      )}
                      <button
                        className="code-copy-pill http"
                        onClick={() => copy(`http://127.0.0.1:${remoteInfo.httpPort}${ep.http}`)}
                        title="Copiar URL HTTP completa"
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
                <Keyboard size={14} /> Atajos de Teclado en Directo
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
                <Radio size={14} /> Monitor de Comandos Recibidos ({logs.length})
              </h4>
              <div className="osc-log-box">
                {logs.length === 0 ? (
                  <div className="osc-log-empty">
                    Esperando paquetes OSC (UDP {remoteInfo.oscPort}) o peticiones HTTP (
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
