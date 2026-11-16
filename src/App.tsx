import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FolderOpen,
  Save,
  FilePlus,
  Radio,
  Eye,
  Settings,
} from 'lucide-react';
import {
  VideoCue,
  DisplayInfo,
  TransitionType,
  EndAction,
  ScaleMode,
  AspectRatioMode,
  DeckSyncPayload,
  OutputSyncState,
  ShowFileSchema,
  RemoteCommandLog,
  MosaicConfig,
  ConvertVideoOptions,
  HardwareProfileInfo,
  AutoStartConfig,
  DEFAULT_AUTOSTART,
} from './types/cue';
import {
  formatTimecode,
  toMediaUrl,
} from './utils/timecode';
import {
  attachMeter,
  readPeaks,
  peakToLevel,
  setBoost,
  setAudioOutput,
  listAudioOutputs,
} from './utils/audioMeter';
import { logEvent } from './utils/log';
import { describePlaybackError } from './utils/playbackError';
import { OutputView } from './components/OutputView';
import { DualMonitors } from './components/DualMonitors';
import { CueList } from './components/CueList';
import { CueInspector } from './components/CueInspector';
import { RemoteCompanionModal } from './components/RemoteCompanionModal';
import { MosaicSetupModal } from './components/MosaicSetupModal';

import { tr } from './i18n';
const EMPTY_DECK: DeckSyncPayload = {
  cueId: null,
  mediaUrl: null,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  scaleMode: 'fit',
  aspectRatio: 'native',
  zoom: 100,
  scaleX: 100,
  scaleY: 100,
  offsetX: 0,
  offsetY: 0,
  videoWidth: 1920,
  videoHeight: 1080,
  bgBlurEnabled: false,
  bgBlurAmount: 90,
  bgBlurBrightness: 75,
  bgBlurZoom: 125,
  opacity: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
};

export const App: React.FC = () => {
  // Check if this window is the secondary fullscreen Output Window
  const [isOutputWindow] = useState(() => window.location.hash.includes('output'));

  if (isOutputWindow) {
    return <OutputView />;
  }

  return <OperatorConsole />;
};

const OperatorConsole: React.FC = () => {
  // Show state
  const [showName, setShowName] = useState<string>('PlayCue Show');
  const [cues, setCues] = useState<VideoCue[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [previewCueId, setPreviewCueId] = useState<string | null>(null);
  const [programCueId, setProgramCueId] = useState<string | null>(null);
  const initialLoadDoneRef = useRef<boolean>(false);
  // Scheduled start of the show (stored inside the show file)
  const [autoStart, setAutoStart] = useState<AutoStartConfig>(DEFAULT_AUTOSTART);
  const autoStartRef = useRef<AutoStartConfig>(DEFAULT_AUTOSTART);
  autoStartRef.current = autoStart;
  const launchStartPendingRef = useRef<boolean>(false);
  const appStartedAtRef = useRef<number>(Date.now());

  // Resizable Workspace Splitters (Monitors vs CueList height, CueList vs Inspector width)
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [upperHeightPct, setUpperHeightPct] = useState<number>(46);
  const [inspectorWidthPx, setInspectorWidthPx] = useState<number>(350);

  // Displays & Output Window state
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<number | undefined>(undefined);
  const [outputOpen, setOutputOpen] = useState<boolean>(false);
  const [isSpannedActive, setIsSpannedActive] = useState<boolean>(false);
  const [showOSD, setShowOSD] = useState<boolean>(false);
  const [isMosaicModalOpen, setIsMosaicModalOpen] = useState<boolean>(false);

  // Audio output device ('' = system default, always the base option)
  const [audioDevices, setAudioDevices] = useState<{ id: string; label: string }[]>([]);
  const [audioOutputId, setAudioOutputId] = useState<string>(() => {
    try {
      return localStorage.getItem('playcue.audioOutputId') || '';
    } catch {
      return '';
    }
  });
  const [mosaicConfig, setMosaicConfig] = useState<MosaicConfig>({
    mode: 'single',
    display1Id: null,
    display2Id: null,
    preferSpannedWindow: true,
    overlapPx: 0,
    showSeamGuideInPreview: true,
  });

  // Preview player state
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [prvPlaying, setPrvPlaying] = useState<boolean>(false);
  const [prvTime, setPrvTime] = useState<number>(0);
  const [prvAudition, setPrvAudition] = useState<boolean>(true);
  const prvAuditionRef = useRef<boolean>(true);
  prvAuditionRef.current = prvAudition;

  // Program Dual-Deck state
  const pgmVideoARef = useRef<HTMLVideoElement | null>(null);
  const pgmVideoBRef = useRef<HTMLVideoElement | null>(null);
  const [activeDeck, setActiveDeck] = useState<'A' | 'B'>('A');
  const [deckACueId, setDeckACueId] = useState<string | null>(null);
  const [deckBCueId, setDeckBCueId] = useState<string | null>(null);
  const [pgmPlaying, setPgmPlaying] = useState<boolean>(false);
  const [pgmTime, setPgmTime] = useState<number>(0);
  const [pgmRemaining, setPgmRemaining] = useState<number>(0);

  // Transitions & Overrides
  const [transitionType, setTransitionType] = useState<TransitionType>('dissolve');
  const [transitionDuration, setTransitionDuration] = useState<number>(1.0);
  const [transitionProgress, setTransitionProgress] = useState<number>(1);
  const [isBlackout, setIsBlackout] = useState<boolean>(false);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [isTestPattern, setIsTestPattern] = useState<boolean>(false);

  // Master Audio & Web Audio API VU Meters
  const [masterVolume, setMasterVolume] = useState<number>(100);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);
  const [vuLevels, setVuLevels] = useState({ left: 0, right: 0, peakL: 0, peakR: 0 });

  // UI Modals & Status
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState<boolean>(false);
  const [remoteInfo, setRemoteInfo] = useState<{
    oscPort: number;
    httpPort: number;
    ips: string[];
  }>({ oscPort: 51000, httpPort: 51080, ips: ['127.0.0.1'] });
  const [remoteLogs, setRemoteLogs] = useState<RemoteCommandLog[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [hardwareInfo, setHardwareInfo] = useState<HardwareProfileInfo | null>(null);

  // Refs for real-time 60fps loop access
  const cuesRef = useRef<VideoCue[]>(cues);
  cuesRef.current = cues;
  const activeDeckRef = useRef<'A' | 'B'>(activeDeck);
  activeDeckRef.current = activeDeck;
  const deckACueIdRef = useRef<string | null>(deckACueId);
  deckACueIdRef.current = deckACueId;
  const deckBCueIdRef = useRef<string | null>(deckBCueId);
  deckBCueIdRef.current = deckBCueId;
  const transProgressRef = useRef<number>(transitionProgress);
  transProgressRef.current = transitionProgress;
  const transTypeRef = useRef<TransitionType>(transitionType);
  transTypeRef.current = transitionType;
  const masterVolRef = useRef<number>(masterVolume);
  masterVolRef.current = masterVolume;
  const masterMutedRef = useRef<boolean>(isMasterMuted);
  masterMutedRef.current = isMasterMuted;
  const isBlackoutRef = useRef<boolean>(isBlackout);
  isBlackoutRef.current = isBlackout;
  const isFrozenRef = useRef<boolean>(isFrozen);
  isFrozenRef.current = isFrozen;
  const isTestPatternRef = useRef<boolean>(isTestPattern);
  isTestPatternRef.current = isTestPattern;
  const showOSDRef = useRef<boolean>(showOSD);
  showOSDRef.current = showOSD;
  const syncSeqRef = useRef<number>(0);
  const transitionRafRef = useRef<number>(0);
  // True while the current blackout was caused by a cue's "BLACK" end action (cleared by the next TAKE)
  const blackoutFromEndActionRef = useRef<boolean>(false);
  const endActionTriggeredRef = useRef<boolean>(false);
  const deckAOpacityRef = useRef<number>(1);
  const deckBOpacityRef = useRef<number>(0);

  // Web Audio API refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const audioConnectedRef = useRef<boolean>(false);

  const previewCue = cues.find((c) => c.id === previewCueId) || null;
  const programCue = cues.find((c) => c.id === programCueId) || null;
  const selectedCue = cues.find((c) => c.id === selectedCueId) || previewCue || null;

  // Ensure native HTML5 WASAPI audio output on Program & Preview video elements
  // (Avoids MediaElementAudioSourceNode cross-scheme file:// -> media:// silence in Electron)
  const ensureAudioGraph = useCallback(() => {
    if (pgmVideoARef.current) {
      pgmVideoARef.current.muted = false;
    }
    if (pgmVideoBRef.current) {
      pgmVideoBRef.current.muted = false;
    }
  }, []);

  // ---- Audio output device selection ----
  const applyAudioOutput = useCallback((deviceId: string) => {
    setAudioOutput(deviceId);
    // Fallback for elements that are not routed through Web Audio
    for (const v of [pgmVideoARef.current, pgmVideoBRef.current, previewVideoRef.current]) {
      const el = v as any;
      if (el && typeof el.setSinkId === 'function') el.setSinkId(deviceId).catch(() => {});
    }
  }, []);

  const handleChangeAudioOutput = (deviceId: string) => {
    setAudioOutputId(deviceId);
    try {
      localStorage.setItem('playcue.audioOutputId', deviceId);
    } catch {}
    applyAudioOutput(deviceId);
  };

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const list = await listAudioOutputs();
      if (cancelled) return;
      setAudioDevices(list);
      // If the chosen device was unplugged, go back to the system default
      setAudioOutputId((current) => {
        if (current && list.length > 0 && !list.some((d) => d.id === current)) {
          applyAudioOutput('');
          return '';
        }
        return current;
      });
    };
    applyAudioOutput(audioOutputId);
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Blackout / Freeze: both PAUSE the program and resume it when released ----
  // Videos paused by each mode are remembered so that releasing the mode (or pressing PLAY)
  // continues playback exactly where it stopped.
  const pausedByBlackoutRef = useRef<HTMLVideoElement[]>([]);
  const pausedByFreezeRef = useRef<HTMLVideoElement[]>([]);

  const pauseProgramDecks = () => {
    const paused: HTMLVideoElement[] = [];
    for (const v of [pgmVideoARef.current, pgmVideoBRef.current]) {
      if (v && v.getAttribute('src') && !v.paused) {
        v.pause();
        paused.push(v);
      }
    }
    return paused;
  };

  const setBlackout = useCallback((on: boolean, skipResume = false) => {
    if (on === isBlackoutRef.current) return;
    logEvent('INFO', 'output', `Blackout ${on ? 'ON' : 'OFF'}`);
    if (on) {
      pausedByBlackoutRef.current = pauseProgramDecks();
    } else {
      const list = pausedByBlackoutRef.current;
      pausedByBlackoutRef.current = [];
      if (!skipResume) list.forEach((v) => v.play().catch(() => {}));
    }
    blackoutFromEndActionRef.current = false;
    isBlackoutRef.current = on;
    setIsBlackout(on);
  }, []);

  // FREEZE = freeze-frame: the picture on the OUTPUT is held while the program keeps running
  // underneath (clock, audio and end actions continue). Releasing it jumps to the live picture.
  // Unlike PAUSE (and Blackout) it never stops the clip. The second argument is kept only so
  // existing call sites stay unchanged.
  const setFreeze = useCallback((on: boolean, _skipResume = false) => {
    if (on === isFrozenRef.current) return;
    logEvent('INFO', 'output', `Freeze ${on ? 'ON' : 'OFF'}`);
    isFrozenRef.current = on;
    setIsFrozen(on);
  }, []);

  // Per-project log: tell the main process which project (show) is active, and capture UI errors
  useEffect(() => {
    void window.electronAPI?.logSetProject?.(showName);
  }, [showName]);
  useEffect(() => {
    const onErr = (e: ErrorEvent) =>
      logEvent('ERROR', 'window', `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
    const onRej = (e: PromiseRejectionEvent) =>
      logEvent('ERROR', 'promise', String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  // Load displays, remote info, and autosaved show (or first-run bundled demo videos) on startup
  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getDisplays().then((list) => {
      setDisplays(list);
      const externals = list.filter((d) => !d.isPrimary);
      const firstTarget = externals[0] || list[0];
      const secondTarget = externals[1] || list.find((d) => d.id !== firstTarget?.id) || firstTarget;
      if (firstTarget) setSelectedDisplayId(firstTarget.id);
      setMosaicConfig((prev) => ({
        ...prev,
        display1Id: prev.display1Id ?? firstTarget?.id ?? null,
        display2Id: prev.display2Id ?? secondTarget?.id ?? null,
      }));
    });

    window.electronAPI.getOutputStatus().then((st) => {
      setOutputOpen(st.isOpen);
      setIsSpannedActive(!!st.isSpanned);
    });

    window.electronAPI.getRemoteInfo().then((info) => {
      setRemoteInfo(info);
    });

    if (window.electronAPI.getHardwareInfo) {
      window.electronAPI
        .getHardwareInfo()
        .then((hw) => setHardwareInfo(hw))
        .catch(() => {});
    }

    window.electronAPI.loadAutosaveShow().then(async (savedJson) => {
      if (savedJson) {
        try {
          const parsed: ShowFileSchema = JSON.parse(savedJson);
          if (parsed && Array.isArray(parsed.cues)) {
            setShowName(parsed.showName || 'PlayCue Show');
            setCues(parsed.cues);
            if (parsed.mosaicConfig) {
              setMosaicConfig(parsed.mosaicConfig);
            }
            if (parsed.autoStart) {
              setAutoStart({ ...DEFAULT_AUTOSTART, ...parsed.autoStart });
              // restoring the show at app launch: evaluate "start when the app opens / late start" once
              launchStartPendingRef.current = parsed.autoStart.mode !== 'off';
            }
            if (parsed.cues.length > 0) {
              setSelectedCueId(parsed.cues[0].id);
              setPreviewCueId(parsed.cues[0].id);
              // Background probe cues to ensure universal audio remux & codec metadata are up to date
              (async () => {
                for (const c of parsed.cues) {
                  if (c.filePath && (!c.isAudioNativeCompatible || !c.audioProfile)) {
                    try {
                      const pr = await window.electronAPI!.probeMedia(c.filePath);
                      if (pr && pr.exists) {
                        setCues((prev) =>
                          prev.map((item) =>
                            item.id === c.id
                              ? {
                                  ...item,
                                  proxyPath: item.proxyPath || pr.proxyPath,
                                  audioCodec: pr.audioCodec || item.audioCodec,
                                  audioProfile: pr.audioProfile,
                                  audioChannels: pr.audioChannels ?? item.audioChannels,
                                  audioChannelLayout: pr.audioChannelLayout,
                                  audioSampleRate: pr.audioSampleRate ?? item.audioSampleRate,
                                  audioBitrateKbps: pr.audioBitrateKbps,
                                  isAudioNativeCompatible: pr.isAudioNativeCompatible,
                                  isNativeCompatible: pr.isNativeCompatible,
                                }
                              : item
                          )
                        );
                      }
                    } catch {}
                  }
                }
              })();
            }
            initialLoadDoneRef.current = true;
            return;
          }
        } catch {}
      }

      // First run ever: load the 3 bundled demo videos
      try {
        const probes = await window.electronAPI!.getFirstRunDemoClips();
        if (probes && probes.length > 0) {
          const demoTitles = [
            tr("Demo 01 - Cuenta Atrás Broadcast 1080p50"),
            tr("Demo 02 - Barras SMPTE HD + Tono 1080p50"),
            tr("Demo 03 - Fondo Loop Escenario 1080p50"),
          ];
          const demoEndActions: EndAction[] = ['hold', 'black', 'loop'];
          const created: VideoCue[] = probes.map((probe: any, i: number) => ({
            id: `demo_init_${Date.now()}_${i}`,
            cueNumber: String(i + 1).padStart(2, '0'),
            name: demoTitles[i] || probe.fileName,
            filePath: probe.filePath,
            fileName: probe.fileName,
            fileSize: probe.fileSize,
            duration: probe.duration || 12,
            inPoint: 0,
            outPoint: probe.duration || 12,
            endAction: demoEndActions[i] || 'hold',
            transitionType: 'dissolve',
            transitionDuration: 1.0,
            volume: 100,
            muted: false,
            audioFadeIn: 0,
            audioFadeOut: 0,
            scaleMode: 'fit',
            aspectRatio: 'native',
            zoom: 100,
            scaleX: 100,
            scaleY: 100,
            offsetX: 0,
            offsetY: 0,
            bgBlurEnabled: false,
            bgBlurAmount: 90,
            bgBlurBrightness: 75,
            bgBlurZoom: 125,
            opacity: 100,
            rotation: 0,
            flipH: false,
            flipV: false,
            videoFadeIn: 0,
            videoFadeOut: 0,
            playbackRate: 1,
            width: probe.width || 1920,
            height: probe.height || 1080,
            fps: probe.fps || 50,
            videoCodec: probe.videoCodec || 'h264',
            videoProfile: probe.videoProfile,
            pixelFormat: probe.pixelFormat,
            bitrateKbps: probe.bitrateKbps,
            audioCodec: probe.audioCodec || 'aac',
            audioChannels: probe.audioChannels ?? 2,
            audioSampleRate: probe.audioSampleRate ?? 48000,
            container: probe.container || 'mp4',
            isNativeCompatible: true,
            thumbnailDataUrl: probe.thumbnailDataUrl || null,
            exists: true,
            color: 'none',
            notes: '',
          }));
          setCues(created);
          setSelectedCueId(created[0].id);
          setPreviewCueId(created[0].id);
        }
      } catch {}
      initialLoadDoneRef.current = true;
    });

    const unsubDisplays = window.electronAPI.onDisplaysUpdated((list) => {
      setDisplays(list);
    });
    const unsubOutStatus = window.electronAPI.onOutputWindowStatus((st) => {
      setOutputOpen(st.isOpen);
      setIsSpannedActive(!!st.isSpanned);
    });
    const unsubProxy = window.electronAPI.onProxyProgress(({ cueId, percent }) => {
      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, proxyProgress: percent } : c))
      );
    });

    return () => {
      unsubDisplays();
      unsubOutStatus();
      unsubProxy();
    };
  }, []);

  // Autosave show whenever cues change (debounced 800ms so UI interactions never block playback)
  useEffect(() => {
    if (!window.electronAPI || !initialLoadDoneRef.current) return;
    const timer = setTimeout(() => {
      const schema: ShowFileSchema = {
        version: '1.5',
        showName,
        savedAt: new Date().toISOString(),
        masterVolume,
        defaultTransitionType: transitionType,
        defaultTransitionDuration: transitionDuration,
        mosaicConfig,
        autoStart,
        cues,
      };
      window.electronAPI?.autosaveShow(JSON.stringify(schema, null, 2));
    }, 800);
    return () => clearTimeout(timer);
  }, [cues, showName, masterVolume, transitionType, transitionDuration, mosaicConfig, autoStart]);

  // Load cue into Preview player when previewCueId changes
  useEffect(() => {
    const v = previewVideoRef.current;
    const cue = cues.find((c) => c.id === previewCueId);
    if (!v) return;

    if (!cue) {
      v.pause();
      v.removeAttribute('data-cue-id');
      v.removeAttribute('src');
      v.load();
      setPrvPlaying(false);
      setPrvTime(0);
      return;
    }

    const url = toMediaUrl(cue.proxyPath || cue.filePath);
    if (url && v.getAttribute('data-cue-id') !== cue.id) {
      v.setAttribute('data-cue-id', cue.id);
      v.src = url;
      v.playbackRate = cue.playbackRate || 1;
      const inPt = cue.inPoint || 0;
      if (inPt > 0.02) {
        try {
          v.currentTime = inPt;
        } catch {}
      }
      setPrvTime(inPt);
      setPrvPlaying(false);
    }
  }, [previewCueId, cues]);

  // Preview timeupdate listener
  useEffect(() => {
    const v = previewVideoRef.current;
    if (!v) return;
    const onTime = () => {
      const cue = cuesRef.current.find((c) => c.id === previewCueId);
      const t = v.currentTime || 0;
      setPrvTime(t);
      if (cue) {
        const outPt = cue.outPoint > cue.inPoint ? cue.outPoint : cue.duration;
        if (t >= outPt && !v.paused) {
          v.pause();
          v.currentTime = outPt;
          setPrvPlaying(false);
        }
      }
    };
    const onPlay = () => setPrvPlaying(true);
    const onPause = () => setPrvPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [previewCueId]);

  // Surface decode / load failures (missing codec, deleted file...) on the cue instead of failing silently
  useEffect(() => {
    const entries: { el: HTMLVideoElement | null; getId: () => string | null }[] = [
      { el: pgmVideoARef.current, getId: () => deckACueIdRef.current },
      { el: pgmVideoBRef.current, getId: () => deckBCueIdRef.current },
      { el: previewVideoRef.current, getId: () => previewVideoRef.current?.getAttribute('data-cue-id') || null },
    ];
    const cleanups: (() => void)[] = [];
    for (const { el, getId } of entries) {
      if (!el) continue;
      const onError = async () => {
        if (!el.getAttribute('src')) return; // unloading a deck triggers a benign error
        const id = getId();
        if (!id) return;
        const failing = cuesRef.current.find((c) => c.id === id);
        const mediaErr = el.error ? { code: el.error.code, message: el.error.message } : null;
        const playedPath = failing ? failing.proxyPath || failing.filePath : '';
        // Find out what really happened: is the file missing, unreadable, empty, or a codec problem?
        let check = null;
        try {
          check = playedPath ? await window.electronAPI?.checkMediaFile?.(playedPath) ?? null : null;
        } catch {}
        const msg = describePlaybackError(failing, mediaErr, check, playedPath);
        const markMissing = check?.state === 'missing' && !!failing && playedPath === failing.filePath;
        setCues((prev) =>
          prev.map((c) => (c.id === id ? { ...c, playbackError: msg, ...(markMissing ? { exists: false } : {}) } : c))
        );
        logEvent(
          'ERROR',
          'video',
          `${failing?.name ?? id} (${playedPath || '?'}) [media code ${mediaErr?.code ?? '-'}, file ${check?.state ?? '?'}]: ${msg.replace(/\n/g, ' | ')}`
        );
      };
      const onLoaded = () => {
        const id = getId();
        if (!id) return;
        const cue = cuesRef.current.find((c) => c.id === id);
        if (cue?.playbackError) {
          setCues((prev) => prev.map((c) => (c.id === id ? { ...c, playbackError: undefined } : c)));
        }
      };
      el.addEventListener('error', onError);
      el.addEventListener('loadeddata', onLoaded);
      cleanups.push(() => {
        el.removeEventListener('error', onError);
        el.removeEventListener('loadeddata', onLoaded);
      });
    }
    return () => cleanups.forEach((fn) => fn());
  }, []);

  // Compute envelope for a deck (video opacity & audio gain)
  const computeDeckEnvelopes = useCallback(
    (
      cue: VideoCue | undefined,
      currentTime: number,
      isIncomingDeck: boolean,
      tProgress: number,
      tType: TransitionType
    ) => {
      if (!cue) return { videoOpacity: 0, audioGain: 0 };
      const inPt = cue.inPoint || 0;
      const outPt = cue.outPoint > inPt ? cue.outPoint : cue.duration;
      const elapsedInClip = Math.max(0, currentTime - inPt);
      const remInClip = Math.max(0, outPt - currentTime);

      // Video Fade In / Fade Out envelope
      let vFade = 1;
      if (cue.videoFadeIn > 0 && elapsedInClip < cue.videoFadeIn) {
        vFade = Math.min(1, elapsedInClip / cue.videoFadeIn);
      }
      if (cue.videoFadeOut > 0 && remInClip < cue.videoFadeOut) {
        vFade = Math.min(vFade, remInClip / cue.videoFadeOut);
      }

      // Transition alpha
      let transAlpha = isIncomingDeck ? tProgress : 1 - tProgress;
      if (tType === 'dipToBlack') {
        if (tProgress < 0.5) {
          transAlpha = isIncomingDeck ? 0 : 1 - tProgress * 2;
        } else {
          transAlpha = isIncomingDeck ? (tProgress - 0.5) * 2 : 0;
        }
      } else if (tType === 'wipe') {
        transAlpha = 1;
      }

      const videoOpacity = (cue.opacity / 100) * vFade * transAlpha;

      // Audio Fade In / Fade Out envelope
      let aFade = 1;
      if (cue.audioFadeIn > 0 && elapsedInClip < cue.audioFadeIn) {
        aFade = Math.min(1, elapsedInClip / cue.audioFadeIn);
      }
      if (cue.audioFadeOut > 0 && remInClip < cue.audioFadeOut) {
        aFade = Math.min(aFade, remInClip / cue.audioFadeOut);
      }

      const clipGain = cue.muted ? 0 : cue.volume / 100;
      const transAudio = isIncomingDeck ? tProgress : 1 - tProgress;
      const audioGain = clipGain * aFade * transAudio;

      return { videoOpacity, audioGain };
    },
    []
  );

  // Trigger TAKE from a target cue to Program
  const triggerTakeCue = useCallback(
    (targetCueId: string, overrideCut = false) => {
      const targetCue = cuesRef.current.find((c) => c.id === targetCueId);
      if (!targetCue) return;
      logEvent('INFO', 'take', `TAKE: ${targetCue.name}${overrideCut ? tr(" (cut)") : ''}`);

      ensureAudioGraph();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      const currentActive = activeDeckRef.current;
      const nextDeck: 'A' | 'B' = currentActive === 'A' ? 'B' : 'A';
      const incomingVideo = nextDeck === 'A' ? pgmVideoARef.current : pgmVideoBRef.current;
      const outgoingVideo = currentActive === 'A' ? pgmVideoARef.current : pgmVideoBRef.current;

      if (!incomingVideo) return;

      const mediaUrl = toMediaUrl(targetCue.proxyPath || targetCue.filePath);
      if (!mediaUrl) return;

      const targetIn = targetCue.inPoint || 0;
      if (incomingVideo.getAttribute('data-loaded-url') !== mediaUrl) {
        incomingVideo.setAttribute('data-loaded-url', mediaUrl);
        incomingVideo.src = mediaUrl;
        incomingVideo.playbackRate = targetCue.playbackRate || 1;
        if (targetIn > 0.02) {
          try {
            incomingVideo.currentTime = targetIn;
          } catch {}
        }
      } else {
        incomingVideo.playbackRate = targetCue.playbackRate || 1;
        try {
          incomingVideo.currentTime = targetIn;
        } catch {}
      }

      if (nextDeck === 'A') {
        setDeckACueId(targetCue.id);
        deckACueIdRef.current = targetCue.id;
      } else {
        setDeckBCueId(targetCue.id);
        deckBCueIdRef.current = targetCue.id;
      }

      setActiveDeck(nextDeck);
      activeDeckRef.current = nextDeck;
      setProgramCueId(targetCue.id);
      // A new TAKE supersedes any freeze / blackout pause that was holding the old program
      pausedByFreezeRef.current = [];
      pausedByBlackoutRef.current = [];
      setIsFrozen(false);
      isFrozenRef.current = false;
      setIsTestPattern(false);
      isTestPatternRef.current = false;
      endActionTriggeredRef.current = false;

      // A blackout produced by a "BLACK" end action ends as soon as the next cue is taken
      if (blackoutFromEndActionRef.current) {
        blackoutFromEndActionRef.current = false;
        if (isBlackoutRef.current) {
          setIsBlackout(false);
          isBlackoutRef.current = false;
        }
      }

      // Auto-advance Preview to the next cue in the Cue List
      const idx = cuesRef.current.findIndex((c) => c.id === targetCue.id);
      if (idx >= 0 && idx + 1 < cuesRef.current.length) {
        const nextInList = cuesRef.current[idx + 1];
        setPreviewCueId(nextInList.id);
        setSelectedCueId(nextInList.id);
      }

      // Cancel any transition still running so a stale loop can't release the new incoming deck
      cancelAnimationFrame(transitionRafRef.current);

      const effectiveType = overrideCut ? 'cut' : targetCue.transitionType || transitionType;
      const effectiveDur = overrideCut ? 0 : targetCue.transitionDuration || transitionDuration;
      setTransitionType(effectiveType);
      transTypeRef.current = effectiveType;

      incomingVideo.play().catch(() => {});
      setPgmPlaying(true);

      const releaseOutgoingDeck = () => {
        if (outgoingVideo) {
          outgoingVideo.pause();
          outgoingVideo.removeAttribute('data-loaded-url');
          outgoingVideo.removeAttribute('src');
          outgoingVideo.load();
        }
        if (currentActive === 'A') {
          setDeckACueId(null);
          deckACueIdRef.current = null;
        } else {
          setDeckBCueId(null);
          deckBCueIdRef.current = null;
        }
      };

      if (effectiveType === 'cut' || effectiveDur <= 0.05) {
        setTransitionProgress(1);
        transProgressRef.current = 1;
        releaseOutgoingDeck();
      } else {
        setTransitionProgress(0);
        transProgressRef.current = 0;
        const start = performance.now();
        const durMs = effectiveDur * 1000;

        const stepTransition = (now: number) => {
          const p = Math.min(1, (now - start) / durMs);
          setTransitionProgress(p);
          transProgressRef.current = p;
          if (p < 1) {
            transitionRafRef.current = requestAnimationFrame(stepTransition);
          } else {
            releaseOutgoingDeck();
          }
        };
        transitionRafRef.current = requestAnimationFrame(stepTransition);
      }
    },
    [ensureAudioGraph, transitionType, transitionDuration]
  );

  // Main Engine Loop (60Hz envelope & hardware sync, throttled 15Hz React UI state updates)
  useEffect(() => {
    let rafId = 0;
    let peakHoldL = 0;
    let peakHoldR = 0;
    let smoothL = 0;
    let smoothR = 0;
    let lastUiUpdateMs = 0;
    let lastOutputSyncMs = 0;
    let lastPgmPlaying = false;

    const tick = (nowMs: number) => {
      const actDeck = activeDeckRef.current;
      const vA = pgmVideoARef.current;
      const vB = pgmVideoBRef.current;
      const activeVideo = actDeck === 'A' ? vA : vB;
      const cueA = cuesRef.current.find((c) => c.id === deckACueIdRef.current);
      const cueB = cuesRef.current.find((c) => c.id === deckBCueIdRef.current);
      const activeCue = actDeck === 'A' ? cueA : cueB;
      const shouldUpdateUi = nowMs - lastUiUpdateMs >= 65;

      if (activeVideo && activeCue) {
        const curT = activeVideo.currentTime || 0;
        const inPt = activeCue.inPoint || 0;
        const outPt = activeCue.outPoint > inPt ? activeCue.outPoint : activeCue.duration;
        const rem = Math.max(0, outPt - curT);
        const nowPlaying = !activeVideo.paused;

        if (nowPlaying !== lastPgmPlaying) {
          lastPgmPlaying = nowPlaying;
          setPgmPlaying(nowPlaying);
        }
        if (shouldUpdateUi) {
          setPgmTime(curT);
          setPgmRemaining(rem);
        }

        // Check End Action when reaching Out Point
        // `ended` covers files whose real stream is slightly shorter than the probed duration
        const reachedEnd = activeVideo.ended || curT >= outPt - 0.04;
        if (
          (!activeVideo.paused || activeVideo.ended) &&
          outPt > 0 &&
          reachedEnd &&
          !endActionTriggeredRef.current
        ) {
          const action = activeCue.endAction;
          if (action === 'loop') {
            if (!activeVideo.seeking) {
              activeVideo.currentTime = inPt;
              activeVideo.play().catch(() => {});
            }
          } else if (action === 'hold') {
            endActionTriggeredRef.current = true;
            activeVideo.pause();
            activeVideo.currentTime = Math.max(inPt, outPt - 0.02);
            lastPgmPlaying = false;
            setPgmPlaying(false);
          } else if (action === 'black') {
            endActionTriggeredRef.current = true;
            activeVideo.pause();
            setBlackout(true);
            blackoutFromEndActionRef.current = true;
            lastPgmPlaying = false;
            setPgmPlaying(false);
          } else if (action === 'next') {
            endActionTriggeredRef.current = true;
            const currentIdx = cuesRef.current.findIndex((c) => c.id === activeCue.id);
            if (currentIdx >= 0 && currentIdx + 1 < cuesRef.current.length) {
              const nextCue = cuesRef.current[currentIdx + 1];
              triggerTakeCue(nextCue.id, false);
            } else {
              activeVideo.pause();
              lastPgmPlaying = false;
              setPgmPlaying(false);
            }
          } else if (action === 'goto') {
            endActionTriggeredRef.current = true;
            const target = activeCue.gotoCueId
              ? cuesRef.current.find((c) => c.id === activeCue.gotoCueId)
              : undefined;
            if (target) {
              triggerTakeCue(target.id, false);
            } else {
              // No (valid) destination: behave like HOLD
              activeVideo.pause();
              activeVideo.currentTime = Math.max(inPt, outPt - 0.02);
              lastPgmPlaying = false;
              setPgmPlaying(false);
            }
          } else if (action === 'stop') {
            endActionTriggeredRef.current = true;
            activeVideo.pause();
            activeVideo.removeAttribute('data-loaded-url');
            activeVideo.removeAttribute('src');
            activeVideo.load();
            setProgramCueId(null);
            lastPgmPlaying = false;
            setPgmPlaying(false);
          }
        }
      } else {
        if (lastPgmPlaying) {
          lastPgmPlaying = false;
          setPgmPlaying(false);
        }
        if (shouldUpdateUi) {
          setPgmTime(0);
          setPgmRemaining(0);
        }
      }

      // Compute Deck A & Deck B Envelopes
      const tProg = transProgressRef.current;
      const tType = transTypeRef.current;
      const envA = computeDeckEnvelopes(cueA, vA?.currentTime || 0, actDeck === 'A', tProg, tType);
      const envB = computeDeckEnvelopes(cueB, vB?.currentTime || 0, actDeck === 'B', tProg, tType);

      // Update Native Audio Gains on Program Decks A/B & Preview Deck
      const masterGainVal =
        masterMutedRef.current || isBlackoutRef.current
          ? 0
          : masterVolRef.current / 100;

      // Element volume is capped at 1.0; anything above 0 dB is applied by the Web Audio boost stage
      const rawGainA = Math.max(0, envA.audioGain * masterGainVal);
      const rawGainB = Math.max(0, envB.audioGain * masterGainVal);
      const effectiveGainA = Math.min(1, rawGainA);
      const effectiveGainB = Math.min(1, rawGainB);
      attachMeter(vA);
      attachMeter(vB);
      setBoost(vA, rawGainA);
      setBoost(vB, rawGainB);

      if (vA) {
        const nextMutedA = effectiveGainA <= 0.0005;
        if (vA.muted !== nextMutedA) vA.muted = nextMutedA;
        if (Math.abs(vA.volume - effectiveGainA) > 0.004) vA.volume = effectiveGainA;
      }
      if (vB) {
        const nextMutedB = effectiveGainB <= 0.0005;
        if (vB.muted !== nextMutedB) vB.muted = nextMutedB;
        if (Math.abs(vB.volume - effectiveGainB) > 0.004) vB.volume = effectiveGainB;
      }

      const prvVid = previewVideoRef.current;
      const prvCueObj = cuesRef.current.find((c) => c.id === previewCueId);
      const prvClipGain =
        prvCueObj && !prvCueObj.muted && prvAuditionRef.current
          ? (prvCueObj.volume ?? 100) / 100
          : 0;
      const rawPrvGain = Math.max(
        0,
        prvClipGain * (masterMutedRef.current ? 0 : masterVolRef.current / 100)
      );
      const effectivePrvGain = Math.min(1, rawPrvGain);
      attachMeter(prvVid);
      setBoost(prvVid, rawPrvGain);
      if (prvVid) {
        const nextPrvMuted = !prvAuditionRef.current || effectivePrvGain <= 0.0005;
        if (prvVid.muted !== nextPrvMuted) prvVid.muted = nextPrvMuted;
        if (Math.abs(prvVid.volume - effectivePrvGain) > 0.004) prvVid.volume = effectivePrvGain;
      }

      // Update Stereo L/R VU Meters (throttled to ~15Hz UI state updates)
      if (shouldUpdateUi) {
        lastUiUpdateMs = nowMs;
        // Real levels measured with Web Audio analysers on the actual playing elements
        attachMeter(vA);
        attachMeter(vB);
        attachMeter(prvVid);

        const readPlaying = (v: HTMLVideoElement | null, cue: VideoCue | undefined) =>
          v && !v.paused && cue && cue.audioChannels > 0
            ? readPeaks(v, cue.audioChannels === 1)
            : null;
        const pkA = readPlaying(vA, cueA);
        const pkB = readPlaying(vB, cueB);
        let rawL = Math.max(pkA?.l ?? 0, pkB?.l ?? 0);
        let rawR = Math.max(pkA?.r ?? 0, pkB?.r ?? 0);
        if (rawL === 0 && rawR === 0) {
          // Nothing on air: show the Preview audition level instead
          const pkP = readPlaying(prvVid, prvCueObj);
          rawL = pkP?.l ?? 0;
          rawR = pkP?.r ?? 0;
        }

        // Fast attack, smooth release for the bars; slower decay for the peak markers
        smoothL = Math.max(peakToLevel(rawL), smoothL * 0.82);
        smoothR = Math.max(peakToLevel(rawR), smoothR * 0.82);
        if (smoothL < 0.5) smoothL = 0;
        if (smoothR < 0.5) smoothR = 0;
        peakHoldL = Math.max(smoothL, peakHoldL * 0.94);
        peakHoldR = Math.max(smoothR, peakHoldR * 0.94);
        if (peakHoldL < 0.5) peakHoldL = 0;
        if (peakHoldR < 0.5) peakHoldR = 0;

        setVuLevels((prev) =>
          prev.left === smoothL &&
          prev.right === smoothR &&
          prev.peakL === peakHoldL &&
          prev.peakR === peakHoldR
            ? prev
            : { left: smoothL, right: smoothR, peakL: peakHoldL, peakR: peakHoldR }
        );
      }

      // Build DeckSyncPayloads & Sync with 2nd Display Output Window
      // Send at 60Hz during active transition (tProg < 1), otherwise 15Hz (every 65ms)
      const isTransitioning = tProg < 1;
      if (window.electronAPI && (isTransitioning || nowMs - lastOutputSyncMs >= 65)) {
        lastOutputSyncMs = nowMs;
        const payloadA: DeckSyncPayload = cueA
          ? {
              cueId: cueA.id,
              mediaUrl: toMediaUrl(cueA.proxyPath || cueA.filePath),
              currentTime: vA?.currentTime || 0,
              isPlaying: !!(vA && !vA.paused && !isFrozenRef.current),
              playbackRate: cueA.playbackRate || 1,
              scaleMode: cueA.scaleMode,
              aspectRatio: cueA.aspectRatio || 'native',
              zoom: cueA.zoom ?? 100,
              scaleX: cueA.scaleX ?? 100,
              scaleY: cueA.scaleY ?? 100,
              offsetX: cueA.offsetX ?? 0,
              offsetY: cueA.offsetY ?? 0,
              videoWidth: cueA.width || 1920,
              videoHeight: cueA.height || 1080,
              bgBlurEnabled: !!cueA.bgBlurEnabled,
              bgBlurAmount: cueA.bgBlurAmount ?? 90,
              bgBlurBrightness: cueA.bgBlurBrightness ?? 75,
              bgBlurZoom: cueA.bgBlurZoom ?? 125,
              opacity: envA.videoOpacity,
              rotation: cueA.rotation,
              flipH: cueA.flipH,
              flipV: cueA.flipV,
            }
          : { ...EMPTY_DECK };

        const payloadB: DeckSyncPayload = cueB
          ? {
              cueId: cueB.id,
              mediaUrl: toMediaUrl(cueB.proxyPath || cueB.filePath),
              currentTime: vB?.currentTime || 0,
              isPlaying: !!(vB && !vB.paused && !isFrozenRef.current),
              playbackRate: cueB.playbackRate || 1,
              scaleMode: cueB.scaleMode,
              aspectRatio: cueB.aspectRatio || 'native',
              zoom: cueB.zoom ?? 100,
              scaleX: cueB.scaleX ?? 100,
              scaleY: cueB.scaleY ?? 100,
              offsetX: cueB.offsetX ?? 0,
              offsetY: cueB.offsetY ?? 0,
              videoWidth: cueB.width || 1920,
              videoHeight: cueB.height || 1080,
              bgBlurEnabled: !!cueB.bgBlurEnabled,
              bgBlurAmount: cueB.bgBlurAmount ?? 90,
              bgBlurBrightness: cueB.bgBlurBrightness ?? 75,
              bgBlurZoom: cueB.bgBlurZoom ?? 125,
              opacity: envB.videoOpacity,
              rotation: cueB.rotation,
              flipH: cueB.flipH,
              flipV: cueB.flipV,
            }
          : { ...EMPTY_DECK };

        deckAOpacityRef.current = payloadA.opacity;
        deckBOpacityRef.current = payloadB.opacity;

        syncSeqRef.current += 1;
        const effectiveDuration = activeCue
          ? Math.max(
              0,
              (activeCue.outPoint > activeCue.inPoint ? activeCue.outPoint : activeCue.duration) -
                (activeCue.inPoint || 0)
            )
          : 0;
        const syncState: OutputSyncState = {
          deckA: payloadA,
          deckB: payloadB,
          activeDeck: actDeck,
          transitionType: tType,
          transitionProgress: tProg,
          isBlackout: isBlackoutRef.current,
          isFrozen: isFrozenRef.current,
          isTestPattern: isTestPatternRef.current,
          showOSD: showOSDRef.current,
          programCueName: activeCue?.name || '',
          programCueNumber: activeCue?.cueNumber || '',
          programFps: activeCue?.fps || 25,
          remainingTime: activeCue
            ? Math.max(
                0,
                (activeCue.outPoint > activeCue.inPoint ? activeCue.outPoint : activeCue.duration) -
                  (activeVideo?.currentTime || 0)
              )
            : 0,
          syncSeq: syncSeqRef.current,
        };
        window.electronAPI.syncOutputState(syncState);

        // Update Companion / HTTP telemetry every 4 sync ticks (~250ms)
        if (syncSeqRef.current % 4 === 0) {
          const prvC = cuesRef.current.find((c) => c.id === previewCueId);
          const pgmIdx = activeCue ? cuesRef.current.findIndex((c) => c.id === activeCue.id) + 1 : 0;
          const prvIdx = prvC ? cuesRef.current.findIndex((c) => c.id === prvC.id) + 1 : 0;
          window.electronAPI.updateTelemetry({
            showName,
            isPlaying: !!(activeVideo && !activeVideo.paused),
            isBlackout: isBlackoutRef.current,
            isFrozen: isFrozenRef.current,
            isTestPattern: isTestPatternRef.current,
            showOSD: showOSDRef.current,
            programCueId: activeCue?.id || null,
            programIndex: pgmIdx,
            programCueName: activeCue?.name || '-',
            programCueNumber: activeCue?.cueNumber || '-',
            programEndAction: activeCue?.endAction || 'hold',
            previewCueId: prvC?.id || null,
            previewIndex: prvIdx,
            previewCueName: prvC?.name || '-',
            previewCueNumber: prvC?.cueNumber || '-',
            transitionType: transTypeRef.current,
            transitionDuration,
            mosaicMode: mosaicConfig.mode,
            elapsed: activeVideo?.currentTime || 0,
            remaining: syncState.remainingTime,
            duration: effectiveDuration,
            totalCues: cuesRef.current.length,
            masterVolume: masterVolRef.current,
            isMuted: masterMutedRef.current,
            cues: cuesRef.current.slice(0, 32).map((c, idx) => ({
              index: idx + 1,
              id: c.id,
              cueNumber: c.cueNumber,
              name: c.name,
              duration: Math.max(0, (c.outPoint > c.inPoint ? c.outPoint : c.duration) - c.inPoint),
              transitionType: c.transitionType,
              transitionDuration: c.transitionDuration,
              endAction: c.endAction,
            })),
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [computeDeckEnvelopes, triggerTakeCue, previewCueId, showName, transitionDuration, mosaicConfig.mode]);

  // Program transport handlers
  const handleTogglePgmPlay = useCallback(() => {
    ensureAudioGraph();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    const v = activeDeckRef.current === 'A' ? pgmVideoARef.current : pgmVideoBRef.current;
    const cue = cuesRef.current.find((c) => c.id === programCueId);
    if (!v || !cue) {
      if (previewCueId) {
        triggerTakeCue(previewCueId, false);
      }
      return;
    }

    if (v.paused) {
      const outPt = cue.outPoint > cue.inPoint ? cue.outPoint : cue.duration;
      if (v.currentTime >= outPt - 0.05) {
        v.currentTime = cue.inPoint || 0;
      }
      endActionTriggeredRef.current = false;
      // PLAY releases blackout / freeze; we start playback ourselves below
      setFreeze(false, true);
      setBlackout(false, true);
      pausedByFreezeRef.current = [];
      pausedByBlackoutRef.current = [];
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [ensureAudioGraph, programCueId, previewCueId, triggerTakeCue, setFreeze, setBlackout]);

  const handleRestartPgm = useCallback(() => {
    const v = activeDeckRef.current === 'A' ? pgmVideoARef.current : pgmVideoBRef.current;
    const cue = cuesRef.current.find((c) => c.id === programCueId);
    if (!v || !cue) return;
    endActionTriggeredRef.current = false;
    v.currentTime = cue.inPoint || 0;
    v.play().catch(() => {});
  }, [programCueId]);

  const handleSeekPgm = useCallback((time: number) => {
    const v = activeDeckRef.current === 'A' ? pgmVideoARef.current : pgmVideoBRef.current;
    if (!v) return;
    endActionTriggeredRef.current = false;
    v.currentTime = time;
    setPgmTime(time);
  }, []);

  const handlePgmGotoEnd = useCallback(
    (secBeforeEnd: number) => {
      const v = activeDeckRef.current === 'A' ? pgmVideoARef.current : pgmVideoBRef.current;
      const cue = cuesRef.current.find((c) => c.id === programCueId);
      if (!v || !cue) return;
      const outPt = cue.outPoint > cue.inPoint ? cue.outPoint : cue.duration;
      const target = Math.max(cue.inPoint || 0, outPt - secBeforeEnd);
      endActionTriggeredRef.current = false;
      v.currentTime = target;
      if (v.paused) {
        v.play().catch(() => {});
      }
    },
    [programCueId]
  );

  const handlePanic = useCallback(() => {
    // PANIC (ESC) = CLEAR OUTPUT: stop and unload the program so the output is empty (black screen
    // with nothing playing). It is not a blackout: blackout / freeze / test pattern are released too.
    logEvent('INFO', 'panic', 'ESC: salida limpiada');
    pausedByBlackoutRef.current = [];
    pausedByFreezeRef.current = [];
    setBlackout(false, true);
    setFreeze(false, true);
    resetPlayback();
    setIsTestPattern(false);
    isTestPatternRef.current = false;
  }, [setBlackout, setFreeze]);

  // Handle incoming OSC / HTTP commands from Bitfocus Companion
  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onRemoteCommand((cmd: RemoteCommandLog) => {
      setRemoteLogs((prev) => [cmd, ...prev.slice(0, 39)]);
      switch (cmd.action) {
        case 'play': {
          const v = activeDeckRef.current === 'A' ? pgmVideoARef.current : pgmVideoBRef.current;
          v?.play().catch(() => {});
          break;
        }
        case 'pause': {
          const v = activeDeckRef.current === 'A' ? pgmVideoARef.current : pgmVideoBRef.current;
          v?.pause();
          break;
        }
        case 'togglePlay':
          handleTogglePgmPlay();
          break;
        case 'take':
          if (previewCueId) triggerTakeCue(previewCueId, false);
          break;
        case 'cut':
          if (previewCueId) triggerTakeCue(previewCueId, true);
          break;
        case 'panic':
          handlePanic();
          break;
        case 'blackout':
          setBlackout(!isBlackoutRef.current);
          break;
        case 'freeze':
          setFreeze(!isFrozenRef.current);
          break;
        case 'testPattern':
          setIsTestPattern((t) => {
            isTestPatternRef.current = !t;
            return !t;
          });
          break;
        case 'gotoEnd':
          handlePgmGotoEnd(Number(cmd.value) || 10);
          break;
        case 'restart':
          handleRestartPgm();
          break;
        case 'toggleLoop':
          if (programCueId) {
            setCues((prev) =>
              prev.map((c) =>
                c.id === programCueId
                  ? { ...c, endAction: c.endAction === 'loop' ? 'hold' : 'loop' }
                  : c
              )
            );
          }
          break;
        case 'nextCue': {
          const idx = cuesRef.current.findIndex((c) => c.id === previewCueId);
          if (idx + 1 < cuesRef.current.length) {
            const nxt = cuesRef.current[idx + 1];
            setPreviewCueId(nxt.id);
            setSelectedCueId(nxt.id);
          }
          break;
        }
        case 'prevCue': {
          const idx = cuesRef.current.findIndex((c) => c.id === previewCueId);
          if (idx > 0) {
            const prv = cuesRef.current[idx - 1];
            setPreviewCueId(prv.id);
            setSelectedCueId(prv.id);
          }
          break;
        }
        case 'loadCueIndex': {
          const idx = Math.max(0, Number(cmd.value) - 1);
          const target = cuesRef.current[idx];
          if (target) {
            setPreviewCueId(target.id);
            setSelectedCueId(target.id);
          }
          break;
        }
        case 'takeCueIndex': {
          const idx = Math.max(0, Number(cmd.value) - 1);
          const target = cuesRef.current[idx];
          if (target) {
            triggerTakeCue(target.id, false);
          }
          break;
        }
        case 'cutCueIndex': {
          const idx = Math.max(0, Number(cmd.value) - 1);
          const target = cuesRef.current[idx];
          if (target) {
            triggerTakeCue(target.id, true);
          }
          break;
        }
        case 'setGotoTarget': {
          // /cue/goto <index>: make the program (or preview) cue jump to cue #index when it ends
          const dest = cuesRef.current[Math.max(0, Number(cmd.value) - 1)];
          const srcId = programCueId || previewCueId;
          if (dest && srcId) {
            endActionTriggeredRef.current = false;
            setCues((prev) =>
              prev.map((c) => (c.id === srcId ? { ...c, endAction: 'goto', gotoCueId: dest.id } : c))
            );
          }
          break;
        }
        case 'setTransitionType': {
          const t = String(cmd.value || 'dissolve') as TransitionType;
          setTransitionType(t);
          transTypeRef.current = t;
          if (previewCueId) {
            setCues((prev) =>
              prev.map((c) => (c.id === previewCueId ? { ...c, transitionType: t } : c))
            );
          }
          break;
        }
        case 'setTransitionDuration': {
          const d = Math.max(0.1, Number(cmd.value) || 1.0);
          setTransitionDuration(d);
          if (previewCueId) {
            setCues((prev) =>
              prev.map((c) => (c.id === previewCueId ? { ...c, transitionDuration: d } : c))
            );
          }
          break;
        }
        case 'setEndAction': {
          const act = String(cmd.value || 'hold') as EndAction;
          const targetId = programCueId || previewCueId;
          const targetCueObj = cuesRef.current.find((c) => c.id === targetId);
          // 'goto' needs a destination; set it from the UI (or /cue/goto) first
          if (act === 'goto' && !targetCueObj?.gotoCueId) break;
          if (targetId) {
            endActionTriggeredRef.current = false;
            setCues((prev) =>
              prev.map((c) => (c.id === targetId ? { ...c, endAction: act } : c))
            );
          }
          break;
        }
        case 'setMosaicMode': {
          const m = String(cmd.value || 'single') as MosaicConfig['mode'];
          setMosaicConfig((prev) => {
            const next = { ...prev, mode: m };
            if (window.electronAPI && outputOpen) {
              window.electronAPI.setOutputWindow({
                open: true,
                displayId: next.display1Id ?? selectedDisplayId,
                windowed: false,
                mosaicConfig: next,
              });
            }
            return next;
          });
          break;
        }
        case 'toggleOutput': {
          if (window.electronAPI) {
            window.electronAPI
              .setOutputWindow({
                open: !outputOpen,
                displayId: mosaicConfig.display1Id ?? selectedDisplayId,
                windowed: false,
                mosaicConfig,
              })
              .then((res) => {
                setOutputOpen(res.isOpen);
                setIsSpannedActive(!!res.isSpanned);
              });
          }
          break;
        }
        case 'toggleOSD': {
          setShowOSD((prev) => {
            showOSDRef.current = !prev;
            return !prev;
          });
          break;
        }
        case 'toggleMute': {
          setIsMasterMuted((prev) => {
            masterMutedRef.current = !prev;
            return !prev;
          });
          break;
        }
        case 'adjustVolume': {
          const delta = Number(cmd.value) || 0;
          setMasterVolume((prev) => Math.max(0, Math.min(125, prev + delta)));
          break;
        }
        case 'setVolume':
          {
            const vol = Number(cmd.value);
            setMasterVolume(Math.max(0, Math.min(125, Number.isFinite(vol) ? vol : 100)));
          }
          break;
        case 'toggleBgBlur': {
          const targetId = programCueId || previewCueId;
          if (targetId) {
            setCues((prev) =>
              prev.map((c) =>
                c.id === targetId
                  ? {
                      ...c,
                      bgBlurEnabled: !c.bgBlurEnabled,
                      bgBlurAmount: c.bgBlurAmount ?? 90,
                      bgBlurBrightness: c.bgBlurBrightness ?? 75,
                      bgBlurZoom: c.bgBlurZoom ?? 125,
                    }
                  : c
              )
            );
          }
          break;
        }
        case 'setScaleMode': {
          const sm = String(cmd.value || 'fit') as ScaleMode;
          const targetId = programCueId || previewCueId;
          if (targetId) {
            setCues((prev) =>
              prev.map((c) => (c.id === targetId ? { ...c, scaleMode: sm } : c))
            );
          }
          break;
        }
        case 'setAspectRatio': {
          const ar = String(cmd.value || 'native') as AspectRatioMode;
          const targetId = programCueId || previewCueId;
          if (targetId) {
            setCues((prev) =>
              prev.map((c) => (c.id === targetId ? { ...c, aspectRatio: ar } : c))
            );
          }
          break;
        }
        case 'setZoom': {
          const zRaw = Number(cmd.value);
          const z = Math.max(50, Math.min(300, Number.isFinite(zRaw) ? zRaw : 100));
          const targetId = programCueId || previewCueId;
          if (targetId) {
            setCues((prev) =>
              prev.map((c) => (c.id === targetId ? { ...c, zoom: z } : c))
            );
          }
          break;
        }
        case 'adjustZoom': {
          const delta = Number(cmd.value) || 0;
          const targetId = programCueId || previewCueId;
          if (targetId) {
            setCues((prev) =>
              prev.map((c) =>
                c.id === targetId
                  ? { ...c, zoom: Math.max(50, Math.min(300, (c.zoom ?? 100) + delta)) }
                  : c
              )
            );
          }
          break;
        }
      }
    });
    return () => unsub();
  }, [
    handleTogglePgmPlay,
    handlePanic,
    handlePgmGotoEnd,
    handleRestartPgm,
    previewCueId,
    programCueId,
    triggerTakeCue,
    outputOpen,
    mosaicConfig,
    selectedDisplayId,
  ]);

  // Global Keyboard Shortcuts in Operator UI
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Ignore key auto-repeat and Ctrl/Alt/Meta combos so they can't fire show actions by accident
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePgmPlay();
      } else if (e.code === 'Enter' || e.code === 'F1') {
        e.preventDefault();
        if (previewCueId) triggerTakeCue(previewCueId, false);
      } else if (e.code === 'F2') {
        e.preventDefault();
        if (previewCueId) triggerTakeCue(previewCueId, true);
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handlePgmGotoEnd(10);
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setBlackout(!isBlackoutRef.current);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setFreeze(!isFrozenRef.current);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRestartPgm();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if (programCueId) {
          setCues((prev) =>
            prev.map((c) =>
              c.id === programCueId
                ? { ...c, endAction: c.endAction === 'loop' ? 'hold' : 'loop' }
                : c
            )
          );
        }
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        if (previewCue) {
          const outPt = previewCue.outPoint > previewCue.inPoint ? previewCue.outPoint : previewCue.duration;
          updateCue(previewCue.id, { inPoint: Math.min(prvTime, outPt - 0.1) });
        }
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        if (previewCue) {
          updateCue(previewCue.id, { outPoint: Math.max(prvTime, previewCue.inPoint + 0.1) });
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        handlePanic();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const idx = cuesRef.current.findIndex((c) => c.id === previewCueId);
        if (idx + 1 < cuesRef.current.length) {
          const nxt = cuesRef.current[idx + 1];
          setPreviewCueId(nxt.id);
          setSelectedCueId(nxt.id);
        }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const idx = cuesRef.current.findIndex((c) => c.id === previewCueId);
        if (idx > 0) {
          const prv = cuesRef.current[idx - 1];
          setPreviewCueId(prv.id);
          setSelectedCueId(prv.id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleTogglePgmPlay,
    handlePgmGotoEnd,
    handleRestartPgm,
    handlePanic,
    previewCueId,
    previewCue,
    programCueId,
    prvTime,
    triggerTakeCue,
  ]);

  // Multi-selection (Shift / Ctrl in the Cue List). selectedCueId stays the "primary" cue shown in the inspector.
  const selectedCueIds =
    multiSelectedIds.length > 0 ? multiSelectedIds : selectedCueId ? [selectedCueId] : [];

  // Selecting a cue by any other means (arrow keys, TAKE auto-advance...) ends the multi-selection
  useEffect(() => {
    setMultiSelectedIds((prev) =>
      prev.length > 0 && selectedCueId && prev.includes(selectedCueId) ? prev : prev.length ? [] : prev
    );
  }, [selectedCueId]);

  const deleteCues = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    if (programCueId && idSet.has(programCueId)) resetPlayback();
    setCues((prev) =>
      prev
        .filter((c) => !idSet.has(c.id))
        .map((c) =>
          c.gotoCueId && idSet.has(c.gotoCueId)
            ? { ...c, gotoCueId: null, endAction: c.endAction === 'goto' ? 'hold' : c.endAction }
            : c
        )
    );
    if (previewCueId && idSet.has(previewCueId)) setPreviewCueId(null);
    if (selectedCueId && idSet.has(selectedCueId)) setSelectedCueId(null);
    setMultiSelectedIds([]);
  };

  // Move a group of cues one position up/down keeping their relative order
  const moveCues = (ids: string[], dir: -1 | 1) => {
    const idSet = new Set(ids);
    const next = [...cues];
    if (dir === -1) {
      for (let i = 1; i < next.length; i++) {
        if (idSet.has(next[i].id) && !idSet.has(next[i - 1].id)) {
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
        }
      }
    } else {
      for (let i = next.length - 2; i >= 0; i--) {
        if (idSet.has(next[i].id) && !idSet.has(next[i + 1].id)) {
          [next[i + 1], next[i]] = [next[i], next[i + 1]];
        }
      }
    }
    setCues(next);
  };

  // Helper to update a cue
  const updateCue =(id: string, patch: Partial<VideoCue>) => {
    setCues((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  // Apply geometry / aspect ratio / zoom / blur settings of a cue to all cues in the Cue List
  const handleApplyGeometryToAllCues = (sourceCue: VideoCue) => {
    setCues((prev) =>
      prev.map((c) => ({
        ...c,
        scaleMode: sourceCue.scaleMode,
        aspectRatio: sourceCue.aspectRatio ?? 'native',
        zoom: sourceCue.zoom ?? 100,
        scaleX: sourceCue.scaleX ?? 100,
        scaleY: sourceCue.scaleY ?? 100,
        offsetX: sourceCue.offsetX ?? 0,
        offsetY: sourceCue.offsetY ?? 0,
        bgBlurEnabled: !!sourceCue.bgBlurEnabled,
        bgBlurAmount: sourceCue.bgBlurAmount ?? 90,
        bgBlurBrightness: sourceCue.bgBlurBrightness ?? 75,
        bgBlurZoom: sourceCue.bgBlurZoom ?? 125,
      }))
    );
  };

  // Import video files by paths
  const importFilePaths = async (paths: string[]) => {
    if (!window.electronAPI || paths.length === 0) return;
    const newCues: VideoCue[] = [];
    const baseCount = cues.length;

    for (let i = 0; i < paths.length; i++) {
      const filePath = paths[i];
      let probe;
      try {
        probe = await window.electronAPI.probeMedia(filePath);
      } catch {
        continue; // skip files that fail to probe instead of aborting the whole import
      }
      const cueNum = String(baseCount + i + 1).padStart(2, '0');
      const cleanName = probe.fileName.replace(/\.[^/.]+$/, '');

      const cue: VideoCue = {
        id: `cue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cueNumber: cueNum,
        name: cleanName,
        filePath: probe.filePath,
        proxyPath: probe.proxyPath,
        fileName: probe.fileName,
        fileSize: probe.fileSize,
        duration: probe.duration || 10,
        inPoint: 0,
        outPoint: probe.duration || 10,
        endAction: 'hold',
        transitionType: 'dissolve',
        transitionDuration: 1.0,
        volume: 100,
        muted: false,
        audioFadeIn: 0,
        audioFadeOut: 0,
        scaleMode: 'fit',
        aspectRatio: 'native',
        zoom: 100,
        scaleX: 100,
        scaleY: 100,
        offsetX: 0,
        offsetY: 0,
        bgBlurEnabled: false,
        bgBlurAmount: 90,
        bgBlurBrightness: 75,
        bgBlurZoom: 125,
        opacity: 100,
        rotation: 0,
        flipH: false,
        flipV: false,
        videoFadeIn: 0,
        videoFadeOut: 0,
        playbackRate: 1,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        videoCodec: probe.videoCodec,
        videoProfile: probe.videoProfile,
        pixelFormat: probe.pixelFormat,
        bitrateKbps: probe.bitrateKbps,
        audioCodec: probe.audioCodec,
        audioProfile: probe.audioProfile,
        audioChannels: probe.audioChannels,
        audioChannelLayout: probe.audioChannelLayout,
        audioSampleRate: probe.audioSampleRate,
        audioBitrateKbps: probe.audioBitrateKbps,
        isAudioNativeCompatible: probe.isAudioNativeCompatible,
        container: probe.container,
        isNativeCompatible: probe.isNativeCompatible,
        thumbnailDataUrl: probe.thumbnailDataUrl,
        exists: probe.exists,
        color: 'none',
        notes: '',
      };
      newCues.push(cue);
    }

    if (newCues.length === 0) return;
    setCues((prev) => [...prev, ...newCues]);
    if (!previewCueId) {
      setPreviewCueId(newCues[0].id);
      setSelectedCueId(newCues[0].id);
    }
  };

  const handleAddVideos = async () => {
    if (!window.electronAPI) return;
    const paths = await window.electronAPI.selectVideoFiles();
    if (paths && paths.length > 0) {
      await importFilePaths(paths);
    }
  };

  const handleAddFolder = async () => {
    if (!window.electronAPI) return;
    const paths = await window.electronAPI.selectVideoFolder();
    if (paths && paths.length > 0) {
      await importFilePaths(paths);
    }
  };

  const handleLocateCue = async (cue: VideoCue) => {
    if (!window.electronAPI) return;
    await window.electronAPI.locateFileInFolder(cue.filePath);
  };

  const handleOptimizeProxy = async (cue: VideoCue, options?: ConvertVideoOptions) => {
    if (!window.electronAPI) return;
    updateCue(cue.id, { proxyProgress: 1 });
    try {
      const proxyPath = await window.electronAPI.transcodeProxy({
        cueId: cue.id,
        filePath: cue.filePath,
        duration: cue.duration,
        options,
      });
      const convertedProbe = await window.electronAPI.probeMedia(proxyPath);
      updateCue(cue.id, {
        proxyPath,
        proxyProgress: 100,
        isNativeCompatible: true,
        isAudioNativeCompatible: true,
        width: convertedProbe?.width || cue.width,
        height: convertedProbe?.height || cue.height,
        videoCodec: convertedProbe?.videoCodec || cue.videoCodec,
        videoProfile: convertedProbe?.videoProfile || cue.videoProfile,
        audioCodec: convertedProbe?.audioCodec || cue.audioCodec,
        audioProfile: convertedProbe?.audioProfile || cue.audioProfile,
        audioChannels: convertedProbe?.audioChannels ?? cue.audioChannels,
        audioChannelLayout: convertedProbe?.audioChannelLayout || cue.audioChannelLayout,
        audioSampleRate: convertedProbe?.audioSampleRate || cue.audioSampleRate,
        audioBitrateKbps: convertedProbe?.audioBitrateKbps || cue.audioBitrateKbps,
      });

      // Reload Preview video if this cue is currently in Preview
      if (previewCueId === cue.id && previewVideoRef.current) {
        const newUrl = toMediaUrl(proxyPath);
        if (newUrl) {
          previewVideoRef.current.src = newUrl;
          previewVideoRef.current.currentTime = cue.inPoint || 0;
        }
      }
    } catch {
      updateCue(cue.id, { proxyProgress: undefined });
    }
  };

  const handleRelinkCue = async (cue: VideoCue) => {
    if (!window.electronAPI) return;
    const newPath = await window.electronAPI.relinkVideoFile(cue.fileName);
    if (!newPath) return;
    const probe = await window.electronAPI.probeMedia(newPath);
    updateCue(cue.id, {
      filePath: probe.filePath,
      fileName: probe.fileName,
      fileSize: probe.fileSize,
      duration: probe.duration || cue.duration,
      outPoint: probe.duration || cue.outPoint,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      videoCodec: probe.videoCodec,
      videoProfile: probe.videoProfile,
      pixelFormat: probe.pixelFormat,
      bitrateKbps: probe.bitrateKbps,
      audioCodec: probe.audioCodec,
      isNativeCompatible: probe.isNativeCompatible,
      thumbnailDataUrl: probe.thumbnailDataUrl,
      exists: probe.exists,
    });
  };

  // Stop and unload everything on air / in preview (used when replacing or deleting content)
  const resetPlayback = () => {
    cancelAnimationFrame(transitionRafRef.current);
    for (const v of [pgmVideoARef.current, pgmVideoBRef.current]) {
      if (!v) continue;
      v.pause();
      v.removeAttribute('data-loaded-url');
      v.removeAttribute('src');
      v.load();
    }
    const pv = previewVideoRef.current;
    if (pv) {
      pv.pause();
      pv.removeAttribute('data-cue-id');
    }
    setDeckACueId(null);
    deckACueIdRef.current = null;
    setDeckBCueId(null);
    deckBCueIdRef.current = null;
    setProgramCueId(null);
    setPgmPlaying(false);
    setTransitionProgress(1);
    transProgressRef.current = 1;
    endActionTriggeredRef.current = false;
  };

  const handleSaveShow = async () => {
    if (!window.electronAPI) return;
    try {
      const schema: ShowFileSchema = {
        version: '1.5',
        showName,
        savedAt: new Date().toISOString(),
        masterVolume,
        defaultTransitionType: transitionType,
        defaultTransitionDuration: transitionDuration,
        mosaicConfig,
        autoStart,
        cues,
      };
      await window.electronAPI.saveShowFile(JSON.stringify(schema, null, 2), showName);
    } catch (err: any) {
      logEvent('ERROR', 'project', `No se pudo guardar el proyecto: ${err?.message || err}`);
      window.alert(tr("No se pudo guardar el proyecto: {err}", { err: err?.message || err }));
    }
  };

  const handleOpenShow = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.openShowFile();
    if (!res) return;
    try {
      const parsed: ShowFileSchema = JSON.parse(res.content);
      if (!parsed || !Array.isArray(parsed.cues)) {
        throw new Error(tr("el archivo no contiene una lista de cues válida"));
      }
      resetPlayback();
      setShowName(parsed.showName || 'PlayCue Show');
      logEvent('INFO', 'project', `Proyecto abierto: ${res.filePath} (${parsed.cues.length} cues)`);
      setMasterVolume(parsed.masterVolume ?? 100);
      setTransitionType(parsed.defaultTransitionType || 'dissolve');
      setTransitionDuration(parsed.defaultTransitionDuration || 1.0);
      if (parsed.mosaicConfig) {
        setMosaicConfig(parsed.mosaicConfig);
      }
      // A show opened by hand only arms future start times (no late start / no start-on-open)
      launchStartPendingRef.current = false;
      setAutoStart({ ...DEFAULT_AUTOSTART, ...(parsed.autoStart || {}) });
      setCues(parsed.cues);
      setPreviewCueId(parsed.cues.length > 0 ? parsed.cues[0].id : null);
      setSelectedCueId(parsed.cues.length > 0 ? parsed.cues[0].id : null);
    } catch (err: any) {
      logEvent('ERROR', 'project', `No se pudo abrir el proyecto: ${err?.message || err}`);
      window.alert(tr("No se pudo abrir el proyecto: {err}", { err: err?.message || err }));
    }
  };

  const handleNewShow = () => {
    resetPlayback();
    pausedByBlackoutRef.current = [];
    pausedByFreezeRef.current = [];
    setBlackout(false, true);
    setFreeze(false, true);
    setCues([]);
    setPreviewCueId(null);
    setProgramCueId(null);
    setSelectedCueId(null);
    setShowName(tr("Nuevo Show"));
    launchStartPendingRef.current = false;
    setAutoStart(DEFAULT_AUTOSTART);
  };

  const handleToggleOutputWindow = async (windowed = false, forceOpen = false) => {
    if (!window.electronAPI) return;
    const shouldOpen = forceOpen ? true : !outputOpen || windowed;
    const res = await window.electronAPI.setOutputWindow({
      open: shouldOpen,
      displayId: mosaicConfig.display1Id ?? selectedDisplayId,
      windowed,
      mosaicConfig,
    });
    setOutputOpen(res.isOpen);
    setIsSpannedActive(!!res.isSpanned);
  };

  const handleRefreshDisplays = async () => {
    if (!window.electronAPI) return;
    const list = await window.electronAPI.getDisplays();
    setDisplays(list);
  };

  // ---- Scheduled show start: enable the output screens and TAKE the first cue ----
  const runAutoStart = async (reason: string) => {
    logEvent('INFO', 'autostart', `Inicio automático del show (${reason})`);
    try {
      await handleToggleOutputWindow(false, true);
    } catch (e: any) {
      logEvent('ERROR', 'autostart', `No se pudo activar la salida: ${e?.message || e}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
    const first = cuesRef.current[0];
    if (!first) {
      logEvent('WARN', 'autostart', 'El show no tiene cues');
      return;
    }
    triggerTakeCue(first.id, true);
  };
  const runAutoStartRef = useRef(runAutoStart);
  runAutoStartRef.current = runAutoStart;

  useEffect(() => {
    const LATE_START_LIMIT_MS = 12 * 60 * 60 * 1000;
    const pad = (n: number) => String(n).padStart(2, '0');
    const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const wasFired = (k: string) => {
      try {
        return localStorage.getItem('playcue.autostart.fired') === k;
      } catch {
        return false;
      }
    };
    const markFired = (k: string) => {
      try {
        localStorage.setItem('playcue.autostart.fired', k);
      } catch {}
    };
    const targetFor = (cfg: AutoStartConfig, now: Date): Date | null => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(cfg.time || '');
      if (!m) return null;
      if (cfg.mode === 'daily') {
        const t = new Date(now);
        t.setHours(Number(m[1]), Number(m[2]), 0, 0);
        return t;
      }
      if (cfg.mode === 'atDateTime') {
        const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cfg.date || '');
        if (!d) return null;
        return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(m[1]), Number(m[2]), 0, 0);
      }
      return null;
    };
    let last = Date.now();
    const tick = () => {
      const nowMs = Date.now();
      const now = new Date(nowMs);
      const cfg = autoStartRef.current;
      if (cfg.mode === 'off' || cuesRef.current.length === 0) {
        last = nowMs;
        return;
      }
      // Evaluated once, a few seconds after the app opened (displays and decks are ready by then)
      if (launchStartPendingRef.current && nowMs - appStartedAtRef.current > 6000) {
        launchStartPendingRef.current = false;
        if (cfg.mode === 'onLaunch') {
          void runAutoStartRef.current('al abrir la app');
        } else {
          const t = targetFor(cfg, now);
          const key = t ? `${cfg.mode}:${dayKey(t)}:${cfg.time}` : '';
          if (t && t.getTime() <= nowMs && nowMs - t.getTime() <= LATE_START_LIMIT_MS && !wasFired(key)) {
            markFired(key);
            void runAutoStartRef.current('hora ya pasada al abrir: arranque inmediato');
          } else if (t && t.getTime() <= nowMs) {
            logEvent('INFO', 'autostart', 'Hora programada ya pasada al abrir la app: no se inicia');
          }
        }
        last = nowMs;
        return;
      }
      if (cfg.mode !== 'onLaunch') {
        const t = targetFor(cfg, now);
        if (t && last < t.getTime() && t.getTime() <= nowMs) {
          const key = `${cfg.mode}:${dayKey(t)}:${cfg.time}`;
          if (!wasFired(key)) {
            markFired(key);
            void runAutoStartRef.current('hora programada');
          }
        }
      }
      last = nowMs;
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Drag and drop files or folders onto the app
  const handleDropFiles = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!window.electronAPI) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const rawPaths = files
      .map((f) => window.electronAPI!.getPathForFile(f))
      .filter((p) => !!p);
    if (rawPaths.length > 0) {
      const expanded = await window.electronAPI.expandDroppedPaths(rawPaths);
      if (expanded && expanded.length > 0) {
        await importFilePaths(expanded);
      }
    }
  };

  // Resizable Horizontal Splitter (Monitors Height vs CueList Height)
  const startResizeHorizontal = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startPct = upperHeightPct;
    const totalH = workspaceRef.current?.clientHeight || window.innerHeight - 48;

    const onMove = (ev: MouseEvent) => {
      const deltaY = ev.clientY - startY;
      const deltaPct = (deltaY / totalH) * 100;
      const next = Math.max(26, Math.min(72, startPct + deltaPct));
      setUpperHeightPct(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Resizable Vertical Splitter (CueList Width vs Inspector Width)
  const startResizeVertical = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidthPx;

    const onMove = (ev: MouseEvent) => {
      const deltaX = startX - ev.clientX;
      const maxW = Math.min(620, Math.floor(window.innerWidth * 0.48));
      const next = Math.max(280, Math.min(maxW, startW + deltaX));
      setInspectorWidthPx(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const deckACue = cues.find((c) => c.id === deckACueId);
  const deckBCue = cues.find((c) => c.id === deckBCueId);
  const activeOutputDisplay =
    displays.find((d) => d.id === (mosaicConfig.display1Id ?? selectedDisplayId)) ||
    displays.find((d) => !d.isPrimary) ||
    displays[0];
  const basePhysW = activeOutputDisplay?.physicalWidth || 2560;
  const basePhysH = activeOutputDisplay?.physicalHeight || 1440;

  const totalCanvasWidth =
    mosaicConfig.mode === 'horizontal_2x1'
      ? basePhysW * 2 - (mosaicConfig.overlapPx || 0)
      : basePhysW;
  const totalCanvasHeight =
    mosaicConfig.mode === 'vertical_1x2'
      ? basePhysH * 2 - (mosaicConfig.overlapPx || 0)
      : basePhysH;

  const currentDeckAPayload: DeckSyncPayload = {
    cueId: deckACueId,
    mediaUrl: toMediaUrl(deckACue?.proxyPath || deckACue?.filePath),
    currentTime: pgmVideoARef.current?.currentTime || 0,
    isPlaying: !!(pgmVideoARef.current && !pgmVideoARef.current.paused),
    playbackRate: deckACue?.playbackRate || 1,
    scaleMode: deckACue?.scaleMode || 'fit',
    aspectRatio: deckACue?.aspectRatio || 'native',
    zoom: deckACue?.zoom ?? 100,
    scaleX: deckACue?.scaleX ?? 100,
    scaleY: deckACue?.scaleY ?? 100,
    offsetX: deckACue?.offsetX ?? 0,
    offsetY: deckACue?.offsetY ?? 0,
    videoWidth: deckACue?.width || 1920,
    videoHeight: deckACue?.height || 1080,
    bgBlurEnabled: !!deckACue?.bgBlurEnabled,
    bgBlurAmount: deckACue?.bgBlurAmount ?? 90,
    bgBlurBrightness: deckACue?.bgBlurBrightness ?? 75,
    bgBlurZoom: deckACue?.bgBlurZoom ?? 125,
    opacity: deckAOpacityRef.current,
    rotation: deckACue?.rotation || 0,
    flipH: deckACue?.flipH || false,
    flipV: deckACue?.flipV || false,
  };

  const currentDeckBPayload: DeckSyncPayload = {
    cueId: deckBCueId,
    mediaUrl: toMediaUrl(deckBCue?.proxyPath || deckBCue?.filePath),
    currentTime: pgmVideoBRef.current?.currentTime || 0,
    isPlaying: !!(pgmVideoBRef.current && !pgmVideoBRef.current.paused),
    playbackRate: deckBCue?.playbackRate || 1,
    scaleMode: deckBCue?.scaleMode || 'fit',
    aspectRatio: deckBCue?.aspectRatio || 'native',
    zoom: deckBCue?.zoom ?? 100,
    scaleX: deckBCue?.scaleX ?? 100,
    scaleY: deckBCue?.scaleY ?? 100,
    offsetX: deckBCue?.offsetX ?? 0,
    offsetY: deckBCue?.offsetY ?? 0,
    videoWidth: deckBCue?.width || 1920,
    videoHeight: deckBCue?.height || 1080,
    bgBlurEnabled: !!deckBCue?.bgBlurEnabled,
    bgBlurAmount: deckBCue?.bgBlurAmount ?? 90,
    bgBlurBrightness: deckBCue?.bgBlurBrightness ?? 75,
    bgBlurZoom: deckBCue?.bgBlurZoom ?? 125,
    opacity: deckBOpacityRef.current,
    rotation: deckBCue?.rotation || 0,
    flipH: deckBCue?.flipH || false,
    flipV: deckBCue?.flipV || false,
  };

  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        e.preventDefault();
        if (Array.from(e.dataTransfer.types).includes('Files')) {
          setIsDraggingOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingOver(false);
      }}
      onDrop={handleDropFiles}
    >
      {isDraggingOver && (
        <div className="dropzone-overlay">
          <div className="dropzone-box">
            <h2>{tr("SOLTAR VÍDEOS O CARPETAS PARA AÑADIR AL CUE LIST")}</h2>
            <p>{tr("Soporte directo para MP4, MOV (ProRes/H.264), MKV, WebM, AVI, MXF")}</p>
          </div>
        </div>
      )}

      {/* ================= CLEAN TOP BAR (macOS Style) ================= */}
      <header className="top-broadcast-bar">
        <div className="brand-and-show">
          <div className="show-file-btns">
            <button className="top-btn" onClick={handleNewShow} title={tr("Nuevo Show")}>
              <FilePlus size={14} />
              <span>{tr("Nuevo")}</span>
            </button>
            <button className="top-btn" onClick={handleOpenShow} title={tr("Abrir Show (.cueshow)")}>
              <FolderOpen size={14} />
              <span>{tr("Abrir")}</span>
            </button>
            <button className="top-btn" onClick={handleSaveShow} title={tr("Guardar Show (.cueshow)")}>
              <Save size={14} />
              <span>{tr("Guardar")}</span>
            </button>
          </div>
        </div>

        {/* Center Master Clocks (Elapsed & Remaining) */}
        <div className="master-clocks-strip">
          <div className="clock-box">
            <span className="clock-label">{tr("TRANSCURRIDO (PGM)")}</span>
            <span className="clock-digits elapsed">
              {formatTimecode(pgmTime, programCue?.fps || 25, true)}
            </span>
          </div>

          <div
            className={`clock-box countdown-box ${
              pgmPlaying && pgmRemaining <= 5
                ? 'critical'
                : pgmPlaying && pgmRemaining <= 15
                ? 'warning'
                : ''
            }`}
          >
            <span className="clock-label">{tr("TIEMPO RESTANTE (REMAINING)")}</span>
            <span className="clock-digits remaining">
              -{formatTimecode(pgmRemaining, programCue?.fps || 25, true)}
            </span>
          </div>
        </div>

        {/* Right Output Display, Mosaic & Companion Controls */}
        <div className="output-display-controls">
          {hardwareInfo && (
            <div
              className="top-btn"
              style={{ cursor: 'default', opacity: 0.92 }}
              title={`${tr("Prioridad Hardware Activa")}: ${hardwareInfo.selectedGpuName} (${
                hardwareInfo.selectedGpuTier === 'discrete'
                  ? tr("GPU Dedicada — Máxima Potencia")
                  : hardwareInfo.selectedGpuTier === 'integrated'
                  ? tr("GPU Integrada")
                  : tr("Software")
              })\n${tr("Reproducción")}: ${hardwareInfo.playbackDecoderLabel}\n${tr("Conversión")}: ${
                hardwareInfo.preferredEncoderLabel
              }`}
            >
              <span
                className="tally-dot"
                style={{
                  backgroundColor:
                    hardwareInfo.selectedGpuTier === 'discrete' ? '#10b981' : '#38bdf8',
                }}
              />
              <span>
                GPU:{' '}
                {hardwareInfo.selectedGpuName
                  .replace(/NVIDIA\s+/i, '')
                  .replace(/AMD\s+/i, '')
                  .replace(/Intel\(R\)\s+/i, 'Intel ')
                  .slice(0, 22)}
              </span>
            </div>
          )}

          <button
            className="top-btn"
            onClick={() => setIsMosaicModalOpen(true)}
            title={tr("Configuración: pantallas de salida, modo de salida y salida de audio")}
          >
            <Settings size={14} />
            <span>{tr("Configuración")}</span>
          </button>

          <button
            className={`output-live-btn ${outputOpen ? 'live' : ''}`}
            onClick={() => handleToggleOutputWindow(false)}
            title={tr("Activar / Desactivar Salida Fullscreen automática en la pantalla seleccionada")}
          >
            <span className="live-indicator" />
            <span>
              {outputOpen
                ? mosaicConfig.mode === 'single'
                  ? tr("SALIDA: ON")
                  : tr("MOSAICO: ON")
                : tr("ACTIVAR SALIDA")}
            </span>
          </button>

          <button
            className={`top-btn ${showOSD ? 'active-cyan' : ''}`}
            onClick={() => setShowOSD(!showOSD)}
            title={tr("Mostrar / Ocultar Timecode y Resolución OSD en las pantallas de salida")}
          >
            <Eye size={14} />
            <span>OSD</span>
          </button>

          <button
            className="top-btn companion-btn"
            onClick={() => setIsRemoteModalOpen(true)}
            title={tr("Configurar Bitfocus Companion (OSC / HTTP) y Atajos")}
          >
            <Radio size={14} />
            <span>{tr("Companion")}</span>
          </button>
        </div>
      </header>

      {/* ================= RESIZABLE WORKSPACE BODY ================= */}
      <div className="workspace-body" ref={workspaceRef}>
        {/* UPPER SECTION: DUAL MONITORS (PRV + BRIDGE + PGM + AUDIO) */}
        <section
          className="upper-monitors-section"
          style={{ height: `${upperHeightPct}%` }}
        >
          <DualMonitors
            previewCue={previewCue}
            programCue={programCue}
            previewVideoRef={previewVideoRef}
            pgmVideoARef={pgmVideoARef}
            pgmVideoBRef={pgmVideoBRef}
            deckA={currentDeckAPayload}
            deckB={currentDeckBPayload}
            activeDeck={activeDeck}
            transitionProgress={transitionProgress}
            prvPlaying={prvPlaying}
            prvTime={prvTime}
            prvAudition={prvAudition}
            onTogglePrvPlay={() => {
              const v = previewVideoRef.current;
              if (!v || !previewCue) return;
              if (v.paused) {
                const outPt =
                  previewCue.outPoint > previewCue.inPoint
                    ? previewCue.outPoint
                    : previewCue.duration;
                if (v.currentTime >= outPt - 0.05) {
                  v.currentTime = previewCue.inPoint || 0;
                }
                v.play().catch(() => {});
              } else {
                v.pause();
              }
            }}
            onSeekPrv={(t) => {
              if (previewVideoRef.current) {
                previewVideoRef.current.currentTime = t;
                setPrvTime(t);
              }
            }}
            onSetPrvIn={() => {
              if (!previewCue) return;
              const outPt =
                previewCue.outPoint > previewCue.inPoint
                  ? previewCue.outPoint
                  : previewCue.duration;
              updateCue(previewCue.id, { inPoint: Math.min(prvTime, outPt - 0.1) });
            }}
            onSetPrvOut={() => {
              if (!previewCue) return;
              updateCue(previewCue.id, {
                outPoint: Math.max(prvTime, previewCue.inPoint + 0.1),
              });
            }}
            onResetPrvInOut={() => {
              if (!previewCue) return;
              updateCue(previewCue.id, { inPoint: 0, outPoint: previewCue.duration });
            }}
            onStepPrvFrame={(dir) => {
              const v = previewVideoRef.current;
              if (!v || !previewCue) return;
              v.pause();
              const step = 1 / (previewCue.fps || 25);
              v.currentTime = Math.max(
                0,
                Math.min(previewCue.duration, (v.currentTime || 0) + dir * step)
              );
              setPrvTime(v.currentTime);
            }}
            onTogglePrvAudition={() => setPrvAudition((a) => !a)}
            onPrvGotoEnd={(sec) => {
              const v = previewVideoRef.current;
              if (!v || !previewCue) return;
              const outPt =
                previewCue.outPoint > previewCue.inPoint
                  ? previewCue.outPoint
                  : previewCue.duration;
              v.currentTime = Math.max(previewCue.inPoint || 0, outPt - sec);
              setPrvTime(v.currentTime);
              v.play().catch(() => {});
            }}
            transitionType={transitionType}
            transitionDuration={transitionDuration}
            onChangeTransitionType={(t) => {
              setTransitionType(t);
              if (previewCue) updateCue(previewCue.id, { transitionType: t });
            }}
            onChangeTransitionDuration={(d) => {
              setTransitionDuration(d);
              if (previewCue) updateCue(previewCue.id, { transitionDuration: d });
            }}
            onTake={() => {
              if (previewCueId) triggerTakeCue(previewCueId, false);
            }}
            onCutImmediate={() => {
              if (previewCueId) triggerTakeCue(previewCueId, true);
            }}
            isBlackout={isBlackout}
            onToggleBlackout={() => setBlackout(!isBlackoutRef.current)}
            isFrozen={isFrozen}
            onToggleFreeze={() => setFreeze(!isFrozenRef.current)}
            isTestPattern={isTestPattern}
            onToggleTestPattern={() =>
              setIsTestPattern((t) => {
                isTestPatternRef.current = !t;
                return !t;
              })
            }
            pgmPlaying={pgmPlaying}
            pgmTime={pgmTime}
            pgmRemaining={pgmRemaining}
            onTogglePgmPlay={handleTogglePgmPlay}
            onRestartPgm={handleRestartPgm}
            onSeekPgm={handleSeekPgm}
            onPgmGotoEnd={handlePgmGotoEnd}
            onChangePgmEndAction={(act: EndAction) => {
              if (programCueId) {
                endActionTriggeredRef.current = false;
                updateCue(programCueId, { endAction: act });
              }
            }}
            onUpdateCue={updateCue}
            masterVolume={masterVolume}
            isMasterMuted={isMasterMuted}
            onChangeMasterVolume={(val) => {
              setMasterVolume(val);
              if (isMasterMuted && val > 0) setIsMasterMuted(false);
            }}
            onToggleMasterMute={() => setIsMasterMuted((m) => !m)}
            vuLevels={vuLevels}
            mosaicConfig={mosaicConfig}
            totalCanvasWidth={totalCanvasWidth}
            totalCanvasHeight={totalCanvasHeight}
          />
        </section>

        {/* Horizontal Splitter Handle */}
        <div
          className="resizer-horizontal"
          onMouseDown={startResizeHorizontal}
          title={tr("Arrastra arriba o abajo para ajustar el tamaño de los monitores y del Cue List")}
        >
          <div className="resizer-grip-pill" />
        </div>

        {/* LOWER SECTION: CUE LIST + VERTICAL SPLITTER + INSPECTOR */}
        <section className="lower-workspace-section">
          <div className="cuelist-container-flex">
            <CueList
              cues={cues}
              selectedCueId={selectedCueId}
              selectedCueIds={selectedCueIds}
              previewCueId={previewCueId}
              programCueId={programCueId}
              onSelectCue={(id) => {
                setMultiSelectedIds([]);
                setSelectedCueId(id);
              }}
              onSelectCues={(ids, primaryId) => {
                setMultiSelectedIds(ids.length > 1 ? ids : []);
                setSelectedCueId(primaryId);
              }}
              onLoadToPreview={(id) => {
                setPreviewCueId(id);
                setSelectedCueId(id);
              }}
              onTakeCueToProgram={(id) => triggerTakeCue(id, false)}
              onUpdateCue={updateCue}
              onDeleteCues={deleteCues}
              onDuplicateCue={(id) => {
                const idx = cues.findIndex((c) => c.id === id);
                if (idx < 0) return;
                const orig = cues[idx];
                const copy: VideoCue = {
                  ...orig,
                  id: `cue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  cueNumber: `${orig.cueNumber}B`,
                  name: `${orig.name} ${tr("(Copia)")}`,
                };
                const next = [...cues];
                next.splice(idx + 1, 0, copy);
                setCues(next);
              }}
              onMoveCues={moveCues}
              onReorderCues={(from, to) => {
                const next = [...cues];
                const [item] = next.splice(from, 1);
                next.splice(to, 0, item);
                setCues(next);
              }}
              onAddVideos={handleAddVideos}
              onAddFolder={handleAddFolder}
              onLocateCue={handleLocateCue}
              onOptimizeProxy={(cue) => handleOptimizeProxy(cue)}
              onRelinkCue={handleRelinkCue}
            />
          </div>

          {/* Vertical Splitter Handle */}
          <div
            className="resizer-vertical"
            onMouseDown={startResizeVertical}
            title={tr("Arrastra a izquierda o derecha para ampliar o reducir el panel de ajustes")}
          >
            <div className="resizer-grip-pill-v" />
          </div>

          <div
            className="inspector-container-fixed"
            style={{ width: `${inspectorWidthPx}px` }}
          >
            <CueInspector
              cue={selectedCue}
              allCues={cues}
              prvCurrentTime={prvTime}
              totalCanvasWidth={totalCanvasWidth}
              totalCanvasHeight={totalCanvasHeight}
              hardwareInfo={hardwareInfo}
              onUpdateCue={updateCue}
              onApplyGeometryToAllCues={handleApplyGeometryToAllCues}
              onOptimizeProxy={handleOptimizeProxy}
              onRelinkCue={handleRelinkCue}
            />
          </div>
        </section>
      </div>

      {/* Remote Companion / Shortcuts Modal */}
      <RemoteCompanionModal
        isOpen={isRemoteModalOpen}
        onClose={() => setIsRemoteModalOpen(false)}
        remoteInfo={remoteInfo}
        logs={remoteLogs}
      />

      {/* Multi-Monitor & Custom Format Mosaic Setup Modal */}
      <MosaicSetupModal
        isOpen={isMosaicModalOpen}
        onClose={() => setIsMosaicModalOpen(false)}
        displays={displays}
        mosaicConfig={mosaicConfig}
        outputOpen={outputOpen}
        isSpannedActive={isSpannedActive}
        onChangeMosaicConfig={(next) => {
          setMosaicConfig(next);
        }}
        audioDevices={audioDevices}
        audioOutputId={audioOutputId}
        onChangeAudioOutput={handleChangeAudioOutput}
        autoStart={autoStart}
        onChangeAutoStart={setAutoStart}
        onRefreshDisplays={handleRefreshDisplays}
        onApplyAndLaunchOutput={(windowed) => {
          handleToggleOutputWindow(!!windowed, true);
        }}
      />
    </div>
  );
};
export default App;
