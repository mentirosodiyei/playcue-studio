import {
  InstanceBase,
  runEntrypoint,
  InstanceStatus,
  SomeCompanionConfigField,
  combineRgb,
  CompanionPresetDefinitions,
  CompanionVariableDefinition,
} from '@companion-module/base';
import http from 'http';

interface CueProConfig {
  host: string;
  httpPort: number;
  pollInterval: number;
}

interface TelemetryCue {
  index: number;
  id: string;
  cueNumber: string;
  name: string;
  duration: number;
  transitionType: string;
  transitionDuration: number;
  endAction: string;
}

interface CueProTelemetry {
  showName: string;
  isPlaying: boolean;
  isBlackout: boolean;
  isFrozen: boolean;
  isTestPattern: boolean;
  showOSD: boolean;
  programCueId: string | null;
  programIndex: number;
  programCueName: string;
  programCueNumber: string;
  programEndAction: string;
  previewCueId: string | null;
  previewIndex: number;
  previewCueName: string;
  previewCueNumber: string;
  transitionType: string;
  transitionDuration: number;
  mosaicMode: string;
  elapsed: number;
  remaining: number;
  duration: number;
  totalCues: number;
  masterVolume: number;
  isMuted: boolean;
  outputOpen: boolean;
  cues: TelemetryCue[];
}

const MAX_PRESET_CUES = 16;

function formatShortTc(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

class CueProStudioInstance extends InstanceBase<CueProConfig> {
  private config: CueProConfig = {
    host: '127.0.0.1',
    httpPort: 51080,
    pollInterval: 250,
  };

  private pollTimer: NodeJS.Timeout | null = null;
  private state: CueProTelemetry = {
    showName: 'CuePro Studio',
    isPlaying: false,
    isBlackout: false,
    isFrozen: false,
    isTestPattern: false,
    showOSD: false,
    programCueId: null,
    programIndex: 0,
    programCueName: '-',
    programCueNumber: '-',
    programEndAction: 'hold',
    previewCueId: null,
    previewIndex: 0,
    previewCueName: '-',
    previewCueNumber: '-',
    transitionType: 'dissolve',
    transitionDuration: 1.0,
    mosaicMode: 'single',
    elapsed: 0,
    remaining: 0,
    duration: 0,
    totalCues: 0,
    masterVolume: 100,
    isMuted: false,
    outputOpen: false,
    cues: [],
  };

  public async init(config: CueProConfig): Promise<void> {
    this.config = {
      host: config.host || '127.0.0.1',
      httpPort: Number(config.httpPort) || 51080,
      pollInterval: Math.max(100, Number(config.pollInterval) || 250),
    };

    this.updateStatus(InstanceStatus.Connecting);
    this.initVariables();
    this.initActions();
    this.initFeedbacks();
    this.initPresets();
    this.startPolling();
  }

  public async destroy(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async configUpdated(config: CueProConfig): Promise<void> {
    this.config = {
      host: config.host || '127.0.0.1',
      httpPort: Number(config.httpPort) || 51080,
      pollInterval: Math.max(100, Number(config.pollInterval) || 250),
    };
    this.startPolling();
  }

  public getConfigFields(): SomeCompanionConfigField[] {
    return [
      {
        type: 'static-text',
        id: 'info',
        width: 12,
        label: 'Información',
        value:
          'Conecta Bitfocus Companion con CuePro Studio (v1.2.0+). Asegúrate de que CuePro Studio esté abierto en el PC de vídeo.',
      },
      {
        type: 'textinput',
        id: 'host',
        label: 'IP del PC de CuePro Studio',
        width: 6,
        default: '127.0.0.1',
      },
      {
        type: 'number',
        id: 'httpPort',
        label: 'Puerto HTTP API (Por defecto: 51080)',
        width: 3,
        default: 51080,
        min: 1024,
        max: 65535,
      },
      {
        type: 'number',
        id: 'pollInterval',
        label: 'Refresco Telemetría (ms)',
        width: 3,
        default: 250,
        min: 100,
        max: 2000,
      },
    ];
  }

  private startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollStatus();
    this.pollTimer = setInterval(() => this.pollStatus(), this.config.pollInterval);
  }

  private sendCommand(pathWithQuery: string): void {
    const req = http.get(
      {
        hostname: this.config.host,
        port: this.config.httpPort,
        path: pathWithQuery,
        timeout: 1200,
      },
      (res) => {
        res.resume();
        setTimeout(() => this.pollStatus(), 40);
      }
    );
    req.on('error', () => {});
  }

  private pollStatus(): void {
    const req = http.get(
      {
        hostname: this.config.host,
        port: this.config.httpPort,
        path: '/api/status',
        timeout: 900,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.ok && parsed.telemetry) {
              this.state = { ...this.state, ...parsed.telemetry };
              this.updateStatus(InstanceStatus.Ok);
              this.updateVariablesFromState();
              this.checkFeedbacks();
            }
          } catch {}
        });
      }
    );
    req.on('error', () => {
      this.updateStatus(InstanceStatus.ConnectionFailure, 'Esperando a CuePro Studio...');
    });
    req.on('timeout', () => {
      req.destroy();
    });
  }

  private initVariables(): void {
    const vars: CompanionVariableDefinition[] = [
      { variableId: 'show_name', name: 'Nombre del Show' },
      { variableId: 'pgm_number', name: 'Cue # en Programa (PGM)' },
      { variableId: 'pgm_name', name: 'Nombre del Clip en Programa (PGM)' },
      { variableId: 'pgm_state', name: 'Estado de Programa (PLAY / PAUSE)' },
      { variableId: 'pgm_elapsed', name: 'Tiempo Transcurrido PGM (MM:SS)' },
      { variableId: 'pgm_remaining', name: 'Tiempo Restante PGM (-MM:SS)' },
      { variableId: 'pgm_end_action', name: 'Acción Final activa en PGM' },
      { variableId: 'prv_number', name: 'Cue # en Previo (PRV)' },
      { variableId: 'prv_name', name: 'Nombre del Clip en Previo (PRV)' },
      { variableId: 'transition_type', name: 'Tipo de Transición activa' },
      { variableId: 'transition_duration', name: 'Duración de Transición (s)' },
      { variableId: 'mosaic_mode', name: 'Modo de Salida / Mosaico' },
      { variableId: 'master_volume', name: 'Volumen Master (%)' },
    ];

    for (let i = 1; i <= MAX_PRESET_CUES; i++) {
      vars.push({ variableId: `cue_${i}_name`, name: `Cue ${i}: Nombre del Vídeo` });
      vars.push({ variableId: `cue_${i}_dur`, name: `Cue ${i}: Duración` });
      vars.push({ variableId: `cue_${i}_trans`, name: `Cue ${i}: Transición configurada` });
    }

    this.setVariableDefinitions(vars);
    this.updateVariablesFromState();
  }

  private updateVariablesFromState(): void {
    const s = this.state;
    const values: Record<string, string | number> = {
      show_name: s.showName || 'Show',
      pgm_number: s.programCueNumber || '-',
      pgm_name: (s.programCueName || 'SIN CLIP').slice(0, 18),
      pgm_state: s.isPlaying ? 'ON AIR' : 'PAUSE',
      pgm_elapsed: formatShortTc(s.elapsed),
      pgm_remaining: `-${formatShortTc(s.remaining)}`,
      pgm_end_action: (s.programEndAction || 'hold').toUpperCase(),
      prv_number: s.previewCueNumber || '-',
      prv_name: (s.previewCueName || 'SIN CLIP').slice(0, 18),
      transition_type: (s.transitionType || 'dissolve').toUpperCase(),
      transition_duration: `${(s.transitionDuration || 1.0).toFixed(1)}s`,
      mosaic_mode: (s.mosaicMode || 'single').toUpperCase(),
      master_volume: s.isMuted ? 'MUTE' : `${s.masterVolume}%`,
    };

    for (let i = 1; i <= MAX_PRESET_CUES; i++) {
      const cue = (s.cues || []).find((c) => c.index === i);
      if (cue) {
        values[`cue_${i}_name`] = cue.name.slice(0, 14);
        values[`cue_${i}_dur`] = formatShortTc(cue.duration);
        values[`cue_${i}_trans`] =
          cue.transitionType === 'cut'
            ? 'CUT'
            : `${cue.transitionType.toUpperCase()} ${cue.transitionDuration}s`;
      } else {
        values[`cue_${i}_name`] = `(Vacío #${i})`;
        values[`cue_${i}_dur`] = '--:--';
        values[`cue_${i}_trans`] = '-';
      }
    }

    this.setVariableValues(values);
  }

  private initActions(): void {
    this.setActionDefinitions({
      take: {
        name: 'TAKE: Lanzar Previo a Programa (con Transición de App)',
        options: [],
        callback: () => this.sendCommand('/api/take'),
      },
      cut: {
        name: 'CUT: Corte Directo (0s) de Previo a Programa',
        options: [],
        callback: () => this.sendCommand('/api/cut'),
      },
      load_cue_preview: {
        name: 'PREVIO (PRV): Cargar Vídeo por Número de Cue',
        options: [
          {
            type: 'number',
            id: 'cueIndex',
            label: 'Número de Cue (1 - 32)',
            default: 1,
            min: 1,
            max: 32,
          },
        ],
        callback: (ev) => {
          const idx = Number(ev.options.cueIndex) || 1;
          this.sendCommand(`/cue/${idx}/load`);
        },
      },
      take_cue_program: {
        name: 'PROGRAMA (PGM): Lanzar Vídeo Directo con Transición de App',
        options: [
          {
            type: 'number',
            id: 'cueIndex',
            label: 'Número de Cue (1 - 32)',
            default: 1,
            min: 1,
            max: 32,
          },
        ],
        callback: (ev) => {
          const idx = Number(ev.options.cueIndex) || 1;
          this.sendCommand(`/cue/${idx}/take`);
        },
      },
      cut_cue_program: {
        name: 'PROGRAMA (PGM): Cortar Vídeo Directo al Corte (0s)',
        options: [
          {
            type: 'number',
            id: 'cueIndex',
            label: 'Número de Cue (1 - 32)',
            default: 1,
            min: 1,
            max: 32,
          },
        ],
        callback: (ev) => {
          const idx = Number(ev.options.cueIndex) || 1;
          this.sendCommand(`/cue/${idx}/cut`);
        },
      },
      transport: {
        name: 'Transporte: Play, Pausa, Reiniciar, Siguiente/Anterior Cue',
        options: [
          {
            type: 'dropdown',
            id: 'cmd',
            label: 'Comando de Transporte',
            default: 'toggle-play',
            choices: [
              { id: 'toggle-play', label: 'Play / Pause Programa (Toggle)' },
              { id: 'play', label: 'Play Programa' },
              { id: 'pause', label: 'Pause Programa' },
              { id: 'restart', label: 'Reiniciar Clip al Punto IN' },
              { id: 'next-cue', label: 'Seleccionar Siguiente Cue en Previo' },
              { id: 'prev-cue', label: 'Seleccionar Anterior Cue en Previo' },
            ],
          },
        ],
        callback: (ev) => {
          this.sendCommand(`/api/${ev.options.cmd}`);
        },
      },
      goto_end: {
        name: 'Ir a -Xs del Final en Programa (Test Final)',
        options: [
          {
            type: 'number',
            id: 'seconds',
            label: 'Segundos antes del punto OUT',
            default: 10,
            min: 3,
            max: 120,
          },
        ],
        callback: (ev) => {
          const sec = Number(ev.options.seconds) || 10;
          this.sendCommand(`/api/goto-end?value=${sec}`);
        },
      },
      override: {
        name: 'Salidas y Emergencia: Blackout, Freeze, Carta Ajuste, Panic, OSD',
        options: [
          {
            type: 'dropdown',
            id: 'mode',
            label: 'Acción',
            default: 'blackout',
            choices: [
              { id: 'blackout', label: 'Blackout / Fade to Black (Toggle)' },
              { id: 'freeze', label: 'Freeze / Congelar Salida (Toggle)' },
              { id: 'test-pattern', label: 'Carta de Ajuste SMPTE (Toggle)' },
              { id: 'panic', label: 'PANIC (Detener todo + Blackout)' },
              { id: 'output-toggle', label: 'Activar / Desactivar Pantallas de Salida' },
              { id: 'osd', label: 'Mostrar / Ocultar Timecode OSD en Salida' },
            ],
          },
        ],
        callback: (ev) => {
          this.sendCommand(`/api/${ev.options.mode}`);
        },
      },
      set_transition_type: {
        name: 'Transición: Cambiar Tipo de Transición en la App',
        options: [
          {
            type: 'dropdown',
            id: 'type',
            label: 'Tipo de Transición',
            default: 'dissolve',
            choices: [
              { id: 'cut', label: 'CUT (Corte directo 0s)' },
              { id: 'dissolve', label: 'MIX / Cross Dissolve (Fundido cruzado)' },
              { id: 'dipToBlack', label: 'DIP TO BLACK (Paso por negro)' },
              { id: 'wipe', label: 'WIPE (Cortinilla horizontal)' },
            ],
          },
        ],
        callback: (ev) => {
          this.sendCommand(`/api/transition-type?type=${ev.options.type}`);
        },
      },
      set_transition_duration: {
        name: 'Transición: Cambiar Duración de Transición (Segundos)',
        options: [
          {
            type: 'number',
            id: 'duration',
            label: 'Duración (segundos)',
            default: 1.0,
            min: 0.2,
            max: 10.0,
          },
        ],
        callback: (ev) => {
          this.sendCommand(`/api/transition-duration?value=${ev.options.duration}`);
        },
      },
      set_end_action: {
        name: 'End Action: Cambiar Comportamiento al Terminar el Vídeo',
        options: [
          {
            type: 'dropdown',
            id: 'action',
            label: 'Acción al terminar (End Action)',
            default: 'hold',
            choices: [
              { id: 'hold', label: 'HOLD — Congelar último fotograma (Pause at End)' },
              { id: 'black', label: 'BLACK — Ir a negro al terminar' },
              { id: 'loop', label: 'LOOP — Bucle infinito entre In y Out' },
              { id: 'next', label: 'PLAY NEXT — Lanzar siguiente vídeo automáticamente' },
              { id: 'stop', label: 'STOP — Detener y limpiar salida' },
            ],
          },
        ],
        callback: (ev) => {
          this.sendCommand(`/api/end-action?value=${ev.options.action}`);
        },
      },
      set_mosaic_mode: {
        name: 'Multipantalla: Cambiar Modo de Mosaico (1x1, 2x1 H, 1x2 V, Espejo)',
        options: [
          {
            type: 'dropdown',
            id: 'mode',
            label: 'Modo de Salida / Mosaico',
            default: 'single',
            choices: [
              { id: 'single', label: '1 Salida Única (Single)' },
              { id: 'horizontal_2x1', label: 'Mosaico Horizontal 2×1 (Izquierda + Derecha)' },
              { id: 'vertical_1x2', label: 'Mosaico Vertical 1×2 (Superior + Inferior)' },
              { id: 'mirror_2x', label: 'Doble Salida en Espejo (Clon 1+2)' },
            ],
          },
        ],
        callback: (ev) => {
          this.sendCommand(`/api/mosaic-mode?mode=${ev.options.mode}`);
        },
      },
      audio_control: {
        name: 'Audio Master: Mute y Control de Volumen',
        options: [
          {
            type: 'dropdown',
            id: 'op',
            label: 'Operación de Audio',
            default: 'mute',
            choices: [
              { id: 'mute', label: 'Mute / Unmute Master (Toggle)' },
              { id: 'vol100', label: 'Volumen Master al 100% (0 dB)' },
              { id: 'up5', label: 'Subir Volumen Master (+5%)' },
              { id: 'down5', label: 'Bajar Volumen Master (-5%)' },
            ],
          },
        ],
        callback: (ev) => {
          const op = ev.options.op;
          if (op === 'mute') this.sendCommand('/api/mute');
          else if (op === 'vol100') this.sendCommand('/api/volume?value=100');
          else if (op === 'up5') this.sendCommand('/api/volume-delta?value=5');
          else if (op === 'down5') this.sendCommand('/api/volume-delta?value=-5');
        },
      },
    });
  }

  private initFeedbacks(): void {
    this.setFeedbackDefinitions({
      cue_in_preview: {
        type: 'boolean',
        name: 'Cue está cargado en PREVIO (PRV - Verde)',
        description: 'Ilumina el botón cuando el Cue indicado está en el monitor de Previo',
        defaultStyle: {
          bgcolor: combineRgb(16, 185, 129),
          color: combineRgb(4, 47, 46),
        },
        options: [
          {
            type: 'number',
            id: 'cueIndex',
            label: 'Número de Cue',
            default: 1,
            min: 1,
            max: 32,
          },
        ],
        callback: (fb) => this.state.previewIndex === Number(fb.options.cueIndex),
      },
      cue_in_program: {
        type: 'boolean',
        name: 'Cue está en el aire en PROGRAMA (PGM - Rojo)',
        description: 'Ilumina el botón en rojo Tally cuando el Cue indicado está en Programa',
        defaultStyle: {
          bgcolor: combineRgb(220, 38, 38),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: 'number',
            id: 'cueIndex',
            label: 'Número de Cue',
            default: 1,
            min: 1,
            max: 32,
          },
        ],
        callback: (fb) => this.state.programIndex === Number(fb.options.cueIndex),
      },
      pgm_playing: {
        type: 'boolean',
        name: 'Programa está Reproduciendo (ON AIR)',
        defaultStyle: {
          bgcolor: combineRgb(220, 38, 38),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => this.state.isPlaying,
      },
      remaining_warning: {
        type: 'boolean',
        name: 'Alerta de Tiempo Restante (< 15s Ámbar / < 5s Rojo)',
        defaultStyle: {
          bgcolor: combineRgb(245, 158, 11),
          color: combineRgb(0, 0, 0),
        },
        options: [
          {
            type: 'number',
            id: 'threshold',
            label: 'Segundos de umbral',
            default: 15,
            min: 1,
            max: 60,
          },
        ],
        callback: (fb) =>
          this.state.isPlaying &&
          this.state.remaining > 0 &&
          this.state.remaining <= Number(fb.options.threshold),
      },
      state_active: {
        type: 'boolean',
        name: 'Estado Activo (Blackout / Freeze / Carta Ajuste / Salida / OSD / Mute)',
        defaultStyle: {
          bgcolor: combineRgb(220, 38, 38),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: 'dropdown',
            id: 'flag',
            label: 'Estado a comprobar',
            default: 'isBlackout',
            choices: [
              { id: 'isBlackout', label: 'Blackout Activo' },
              { id: 'isFrozen', label: 'Freeze Activo' },
              { id: 'isTestPattern', label: 'Carta de Ajuste Activa' },
              { id: 'outputOpen', label: 'Pantallas de Salida Abiertas' },
              { id: 'showOSD', label: 'OSD Activo en Salida' },
              { id: 'isMuted', label: 'Audio Master Muteado' },
            ],
          },
        ],
        callback: (fb) => Boolean((this.state as any)[String(fb.options.flag)]),
      },
      transition_type_active: {
        type: 'boolean',
        name: 'Tipo de Transición Activa',
        defaultStyle: {
          bgcolor: combineRgb(2, 132, 199),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: 'dropdown',
            id: 'type',
            label: 'Tipo',
            default: 'dissolve',
            choices: [
              { id: 'cut', label: 'CUT' },
              { id: 'dissolve', label: 'MIX (Dissolve)' },
              { id: 'dipToBlack', label: 'DIP TO BLACK' },
              { id: 'wipe', label: 'WIPE' },
            ],
          },
        ],
        callback: (fb) => this.state.transitionType === fb.options.type,
      },
      end_action_active: {
        type: 'boolean',
        name: 'Acción Final (End Action) Activa en Programa',
        defaultStyle: {
          bgcolor: combineRgb(16, 185, 129),
          color: combineRgb(4, 47, 46),
        },
        options: [
          {
            type: 'dropdown',
            id: 'action',
            label: 'End Action',
            default: 'hold',
            choices: [
              { id: 'hold', label: 'HOLD' },
              { id: 'black', label: 'BLACK' },
              { id: 'loop', label: 'LOOP' },
              { id: 'next', label: 'PLAY NEXT' },
              { id: 'stop', label: 'STOP' },
            ],
          },
        ],
        callback: (fb) => this.state.programEndAction === fb.options.action,
      },
      mosaic_mode_active: {
        type: 'boolean',
        name: 'Modo de Mosaico Activo',
        defaultStyle: {
          bgcolor: combineRgb(6, 182, 212),
          color: combineRgb(4, 47, 46),
        },
        options: [
          {
            type: 'dropdown',
            id: 'mode',
            label: 'Modo',
            default: 'single',
            choices: [
              { id: 'single', label: '1 Salida Única' },
              { id: 'horizontal_2x1', label: 'Mosaico Horizontal 2×1' },
              { id: 'vertical_1x2', label: 'Mosaico Vertical 1×2' },
              { id: 'mirror_2x', label: 'Doble Espejo' },
            ],
          },
        ],
        callback: (fb) => this.state.mosaicMode === fb.options.mode,
      },
    });
  }

  private initPresets(): void {
    const presets: CompanionPresetDefinitions = {};

    // ============================================================================
    // CATEGORY 1: TAKE & TRANSPORTE MASTER
    // ============================================================================
    presets['master_take'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Botón TAKE (Previo → Programa con Transición)',
      style: {
        text: 'TAKE\n$(cuepro:transition_type) $(cuepro:transition_duration)',
        size: '14',
        color: combineRgb(9, 11, 16),
        bgcolor: combineRgb(245, 158, 11),
      },
      steps: [{ down: [{ actionId: 'take', options: {} }], up: [] }],
      feedbacks: [],
    };

    presets['master_cut'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Botón CUT Directo (0s)',
      style: {
        text: 'CUT\nDIRECTO',
        size: '14',
        color: combineRgb(186, 230, 253),
        bgcolor: combineRgb(30, 41, 59),
      },
      steps: [{ down: [{ actionId: 'cut', options: {} }], up: [] }],
      feedbacks: [],
    };

    presets['master_play_pause'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Play / Pause Programa (con Tally)',
      style: {
        text: 'PGM $(cuepro:pgm_state)\n$(cuepro:pgm_remaining)',
        size: '14',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(15, 23, 42),
      },
      steps: [
        {
          down: [{ actionId: 'transport', options: { cmd: 'toggle-play' } }],
          up: [],
        },
      ],
      feedbacks: [
        {
          feedbackId: 'pgm_playing',
          options: {},
          style: {
            bgcolor: combineRgb(220, 38, 38),
            color: combineRgb(255, 255, 255),
          },
        },
      ],
    };

    presets['master_countdown'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Reloj Cuenta Atrás Dinámico (Verde / Ámbar <15s / Rojo <5s)',
      style: {
        text: 'RESTANTE\n$(cuepro:pgm_remaining)',
        size: '14',
        color: combineRgb(52, 211, 153),
        bgcolor: combineRgb(7, 9, 13),
      },
      steps: [{ down: [], up: [] }],
      feedbacks: [
        {
          feedbackId: 'remaining_warning',
          options: { threshold: 15 },
          style: {
            bgcolor: combineRgb(245, 158, 11),
            color: combineRgb(9, 11, 16),
          },
        },
        {
          feedbackId: 'remaining_warning',
          options: { threshold: 5 },
          style: {
            bgcolor: combineRgb(220, 38, 38),
            color: combineRgb(255, 255, 255),
          },
        },
      ],
    };

    presets['master_goto_10'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Test Final: Ir a -10s',
      style: {
        text: 'GOTO\n-10s FIN',
        size: '14',
        color: combineRgb(252, 211, 77),
        bgcolor: combineRgb(22, 31, 46),
      },
      steps: [{ down: [{ actionId: 'goto_end', options: { seconds: 10 } }], up: [] }],
      feedbacks: [],
    };

    presets['master_goto_20'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Test Final: Ir a -20s',
      style: {
        text: 'GOTO\n-20s FIN',
        size: '14',
        color: combineRgb(226, 232, 240),
        bgcolor: combineRgb(22, 31, 46),
      },
      steps: [{ down: [{ actionId: 'goto_end', options: { seconds: 20 } }], up: [] }],
      feedbacks: [],
    };

    presets['master_goto_30'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Test Final: Ir a -30s',
      style: {
        text: 'GOTO\n-30s FIN',
        size: '14',
        color: combineRgb(226, 232, 240),
        bgcolor: combineRgb(22, 31, 46),
      },
      steps: [{ down: [{ actionId: 'goto_end', options: { seconds: 30 } }], up: [] }],
      feedbacks: [],
    };

    presets['master_restart'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Reiniciar Vídeo en Programa al Punto IN',
      style: {
        text: 'REINICIAR\nA INICIO',
        size: '14',
        color: combineRgb(226, 232, 240),
        bgcolor: combineRgb(22, 31, 46),
      },
      steps: [{ down: [{ actionId: 'transport', options: { cmd: 'restart' } }], up: [] }],
      feedbacks: [],
    };

    presets['master_prev_cue'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Cue Anterior en Previo (PRV -)',
      style: {
        text: '◀ CUE ANT\nPRV #$(cuepro:prv_number)',
        size: '14',
        color: combineRgb(110, 231, 183),
        bgcolor: combineRgb(15, 23, 42),
      },
      steps: [{ down: [{ actionId: 'transport', options: { cmd: 'prev-cue' } }], up: [] }],
      feedbacks: [],
    };

    presets['master_next_cue'] = {
      type: 'button',
      category: '1. TAKE y Transporte Master',
      name: 'Cue Siguiente en Previo (PRV +)',
      style: {
        text: 'CUE SIG ▶\nPRV #$(cuepro:prv_number)',
        size: '14',
        color: combineRgb(110, 231, 183),
        bgcolor: combineRgb(15, 23, 42),
      },
      steps: [{ down: [{ actionId: 'transport', options: { cmd: 'next-cue' } }], up: [] }],
      feedbacks: [],
    };

    // ============================================================================
    // CATEGORY 2: LANZAR VÍDEOS EN PREVIO (PRV) — CUES 1..16
    // ============================================================================
    for (let i = 1; i <= MAX_PRESET_CUES; i++) {
      presets[`prv_cue_${i}`] = {
        type: 'button',
        category: '2. Lanzar Vídeos en PREVIO (PRV)',
        name: `Cargar Cue #${i} en Previo`,
        style: {
          text: `PRV #${i}\n$(cuepro:cue_${i}_name)\n$(cuepro:cue_${i}_dur)`,
          size: 'auto',
          color: combineRgb(110, 231, 183),
          bgcolor: combineRgb(13, 24, 22),
        },
        steps: [
          {
            down: [{ actionId: 'load_cue_preview', options: { cueIndex: i } }],
            up: [],
          },
        ],
        feedbacks: [
          {
            feedbackId: 'cue_in_preview',
            options: { cueIndex: i },
            style: {
              bgcolor: combineRgb(16, 185, 129),
              color: combineRgb(4, 47, 46),
            },
          },
          {
            feedbackId: 'cue_in_program',
            options: { cueIndex: i },
            style: {
              bgcolor: combineRgb(185, 28, 28),
              color: combineRgb(255, 255, 255),
            },
          },
        ],
      };
    }

    // ============================================================================
    // CATEGORY 3: LANZAR VÍDEOS DIRECTO A PROGRAMA (CON TRANSICIÓN DE APP) — CUES 1..16
    // ============================================================================
    for (let i = 1; i <= MAX_PRESET_CUES; i++) {
      presets[`pgm_take_cue_${i}`] = {
        type: 'button',
        category: '3. Lanzar Vídeos DIRECTO A PROGRAMA (con Transición App)',
        name: `Lanzar Cue #${i} Directo a Programa (con Transición)`,
        style: {
          text: `PGM #${i}\n$(cuepro:cue_${i}_name)\n$(cuepro:cue_${i}_trans)`,
          size: 'auto',
          color: combineRgb(254, 202, 202),
          bgcolor: combineRgb(32, 14, 18),
        },
        steps: [
          {
            down: [{ actionId: 'take_cue_program', options: { cueIndex: i } }],
            up: [],
          },
        ],
        feedbacks: [
          {
            feedbackId: 'cue_in_preview',
            options: { cueIndex: i },
            style: {
              bgcolor: combineRgb(6, 95, 70),
              color: combineRgb(255, 255, 255),
            },
          },
          {
            feedbackId: 'cue_in_program',
            options: { cueIndex: i },
            style: {
              bgcolor: combineRgb(239, 68, 68),
              color: combineRgb(255, 255, 255),
            },
          },
        ],
      };
    }

    // ============================================================================
    // CATEGORY 4: TRANSICIONES Y ACCIÓN FINAL (END ACTION)
    // ============================================================================
    const transitions: { id: string; label: string }[] = [
      { id: 'cut', label: 'TRANS:\nCUT (0s)' },
      { id: 'dissolve', label: 'TRANS:\nMIX / DISSOLVE' },
      { id: 'dipToBlack', label: 'TRANS:\nDIP TO BLACK' },
      { id: 'wipe', label: 'TRANS:\nWIPE' },
    ];

    for (const t of transitions) {
      presets[`trans_type_${t.id}`] = {
        type: 'button',
        category: '4. Transiciones y Acción Final (End Action)',
        name: `Tipo Transición: ${t.id.toUpperCase()}`,
        style: {
          text: t.label,
          size: '14',
          color: combineRgb(226, 232, 240),
          bgcolor: combineRgb(20, 28, 41),
        },
        steps: [
          {
            down: [{ actionId: 'set_transition_type', options: { type: t.id } }],
            up: [],
          },
        ],
        feedbacks: [
          {
            feedbackId: 'transition_type_active',
            options: { type: t.id },
            style: {
              bgcolor: combineRgb(2, 132, 199),
              color: combineRgb(255, 255, 255),
            },
          },
        ],
      };
    }

    for (const dur of [0.5, 1.0, 1.5, 2.5]) {
      presets[`trans_dur_${dur}`] = {
        type: 'button',
        category: '4. Transiciones y Acción Final (End Action)',
        name: `Duración Transición: ${dur}s`,
        style: {
          text: `TIEMPO\nTRANS: ${dur}s`,
          size: '14',
          color: combineRgb(186, 230, 253),
          bgcolor: combineRgb(15, 23, 42),
        },
        steps: [
          {
            down: [{ actionId: 'set_transition_duration', options: { duration: dur } }],
            up: [],
          },
        ],
        feedbacks: [],
      };
    }

    const endActions: { id: string; label: string }[] = [
      { id: 'hold', label: 'AL TERMINAR:\nHOLD (Pausa)' },
      { id: 'black', label: 'AL TERMINAR:\nIR A NEGRO' },
      { id: 'loop', label: 'AL TERMINAR:\nLOOP (Bucle)' },
      { id: 'next', label: 'AL TERMINAR:\nPLAY NEXT' },
      { id: 'stop', label: 'AL TERMINAR:\nSTOP' },
    ];

    for (const ea of endActions) {
      presets[`end_action_${ea.id}`] = {
        type: 'button',
        category: '4. Transiciones y Acción Final (End Action)',
        name: `End Action: ${ea.id.toUpperCase()}`,
        style: {
          text: ea.label,
          size: 'auto',
          color: combineRgb(226, 232, 240),
          bgcolor: combineRgb(20, 28, 41),
        },
        steps: [
          {
            down: [{ actionId: 'set_end_action', options: { action: ea.id } }],
            up: [],
          },
        ],
        feedbacks: [
          {
            feedbackId: 'end_action_active',
            options: { action: ea.id },
            style: {
              bgcolor: combineRgb(16, 185, 129),
              color: combineRgb(4, 47, 46),
            },
          },
        ],
      };
    }

    // ============================================================================
    // CATEGORY 5: SALIDAS, MOSAICO 4K, EMERGENCIA Y AUDIO
    // ============================================================================
    presets['ovr_blackout'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'Blackout / Fade to Black',
      style: {
        text: 'BLACKOUT\n(FTB)',
        size: '14',
        color: combineRgb(254, 202, 202),
        bgcolor: combineRgb(45, 16, 20),
      },
      steps: [{ down: [{ actionId: 'override', options: { mode: 'blackout' } }], up: [] }],
      feedbacks: [
        {
          feedbackId: 'state_active',
          options: { flag: 'isBlackout' },
          style: {
            bgcolor: combineRgb(220, 38, 38),
            color: combineRgb(255, 255, 255),
          },
        },
      ],
    };

    presets['ovr_freeze'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'Freeze / Congelar Salida',
      style: {
        text: 'FREEZE\nCONGELAR',
        size: '14',
        color: combineRgb(165, 243, 252),
        bgcolor: combineRgb(14, 34, 46),
      },
      steps: [{ down: [{ actionId: 'override', options: { mode: 'freeze' } }], up: [] }],
      feedbacks: [
        {
          feedbackId: 'state_active',
          options: { flag: 'isFrozen' },
          style: {
            bgcolor: combineRgb(8, 145, 178),
            color: combineRgb(255, 255, 255),
          },
        },
      ],
    };

    presets['ovr_test_pattern'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'Carta de Ajuste SMPTE / Mosaico',
      style: {
        text: 'CARTA DE\nAJUSTE',
        size: '14',
        color: combineRgb(221, 214, 254),
        bgcolor: combineRgb(28, 20, 48),
      },
      steps: [{ down: [{ actionId: 'override', options: { mode: 'test-pattern' } }], up: [] }],
      feedbacks: [
        {
          feedbackId: 'state_active',
          options: { flag: 'isTestPattern' },
          style: {
            bgcolor: combineRgb(124, 58, 237),
            color: combineRgb(255, 255, 255),
          },
        },
      ],
    };

    presets['ovr_panic'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'PANIC (Detener Todo y Negro)',
      style: {
        text: 'PANIC\nSTOP ALL',
        size: '14',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(153, 27, 27),
      },
      steps: [{ down: [{ actionId: 'override', options: { mode: 'panic' } }], up: [] }],
      feedbacks: [],
    };

    presets['ovr_output_toggle'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'Activar / Desactivar Pantallas de Salida',
      style: {
        text: 'SALIDA\nPANTALLAS',
        size: '14',
        color: combineRgb(226, 232, 240),
        bgcolor: combineRgb(24, 34, 50),
      },
      steps: [{ down: [{ actionId: 'override', options: { mode: 'output-toggle' } }], up: [] }],
      feedbacks: [
        {
          feedbackId: 'state_active',
          options: { flag: 'outputOpen' },
          style: {
            bgcolor: combineRgb(220, 38, 38),
            color: combineRgb(255, 255, 255),
          },
        },
      ],
    };

    presets['ovr_osd_toggle'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'Mostrar / Ocultar Timecode OSD en Salida',
      style: {
        text: 'OSD INFO\nEN SALIDA',
        size: '14',
        color: combineRgb(165, 243, 252),
        bgcolor: combineRgb(20, 28, 41),
      },
      steps: [{ down: [{ actionId: 'override', options: { mode: 'osd' } }], up: [] }],
      feedbacks: [
        {
          feedbackId: 'state_active',
          options: { flag: 'showOSD' },
          style: {
            bgcolor: combineRgb(6, 182, 212),
            color: combineRgb(4, 47, 46),
          },
        },
      ],
    };

    const mosaicModes: { id: string; label: string }[] = [
      { id: 'single', label: 'SALIDA:\n1 PANTALLA' },
      { id: 'horizontal_2x1', label: 'MOSAICO\n2×1 HORIZ' },
      { id: 'vertical_1x2', label: 'MOSAICO\n1×2 VERT' },
      { id: 'mirror_2x', label: 'DOBLE SALIDA\nESPEJO 1+2' },
    ];

    for (const mm of mosaicModes) {
      presets[`mosaic_${mm.id}`] = {
        type: 'button',
        category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
        name: `Modo Multipantalla: ${mm.id}`,
        style: {
          text: mm.label,
          size: '14',
          color: combineRgb(226, 232, 240),
          bgcolor: combineRgb(20, 28, 41),
        },
        steps: [
          {
            down: [{ actionId: 'set_mosaic_mode', options: { mode: mm.id } }],
            up: [],
          },
        ],
        feedbacks: [
          {
            feedbackId: 'mosaic_mode_active',
            options: { mode: mm.id },
            style: {
              bgcolor: combineRgb(6, 182, 212),
              color: combineRgb(4, 47, 46),
            },
          },
        ],
      };
    }

    presets['audio_mute'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'Mute Master Audio',
      style: {
        text: 'AUDIO\n$(cuepro:master_volume)',
        size: '14',
        color: combineRgb(226, 232, 240),
        bgcolor: combineRgb(22, 31, 46),
      },
      steps: [{ down: [{ actionId: 'audio_control', options: { op: 'mute' } }], up: [] }],
      feedbacks: [
        {
          feedbackId: 'state_active',
          options: { flag: 'isMuted' },
          style: {
            bgcolor: combineRgb(220, 38, 38),
            color: combineRgb(255, 255, 255),
          },
        },
      ],
    };

    presets['audio_up'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'Subir Volumen Master (+5%)',
      style: {
        text: 'VOL +\n$(cuepro:master_volume)',
        size: '14',
        color: combineRgb(110, 231, 183),
        bgcolor: combineRgb(15, 23, 42),
      },
      steps: [{ down: [{ actionId: 'audio_control', options: { op: 'up5' } }], up: [] }],
      feedbacks: [],
    };

    presets['audio_down'] = {
      type: 'button',
      category: '5. Salidas, Mosaico 4K, Emergencia y Audio',
      name: 'Bajar Volumen Master (-5%)',
      style: {
        text: 'VOL -\n$(cuepro:master_volume)',
        size: '14',
        color: combineRgb(252, 211, 77),
        bgcolor: combineRgb(15, 23, 42),
      },
      steps: [{ down: [{ actionId: 'audio_control', options: { op: 'down5' } }], up: [] }],
      feedbacks: [],
    };

    this.setPresetDefinitions(presets);
  }
}

runEntrypoint(CueProStudioInstance, []);
