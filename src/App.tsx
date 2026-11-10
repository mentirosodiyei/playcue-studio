import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Monitor,
  FolderOpen,
  Save,
  FilePlus,
  Radio,
  Eye,
  Layers,
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
} from './types/cue';
import {
  formatTimecode,
  toMediaUrl,
} from './utils/timecode';
import { OutputView } from './components/OutputView';
import { DualMonitors } from './components/DualMonitors';
import { CueList } from './components/CueList';
import { CueInspector } from './components/CueInspector';
import { RemoteCompanionModal } from './components/RemoteCompanionModal';
import { MosaicSetupModal } from './components/MosaicSetupModal';

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
  const [showName, setShowName] = useState<string>('CuePro Show');
  const [cues, setCues] = useState<VideoCue[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [previewCueId, setPreviewCueId] = useState<string | null>(null);
  const [programCueId, setProgramCueId] = useState<string | null>(null);
  const initialLoadDoneRef = useRef<boolean>(false);

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

    window.electronAPI.loadAutosaveShow().then(async (savedJson) => {
      if (savedJson) {
        try {
          const parsed: ShowFileSchema = JSON.parse(savedJson);
          if (parsed && Array.isArray(parsed.cues)) {
            setShowName(parsed.showName || 'CuePro Show');
            setCues(parsed.cues);
            if (parsed.mosaicConfig) {
              setMosaicConfig(parsed.mosaicConfig);
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
            'Demo 01 - Cuenta Atrás Broadcast 1080p50',
            'Demo 02 - Barras SMPTE HD + Tono 1080p50',
            'Demo 03 - Fondo Loop Escenario 1080p50',
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

  // Autosave show whenever cues change (including when all cues are deleted)
  useEffect(() => {
    if (!window.electronAPI || !initialLoadDoneRef.current) return;
    const schema: ShowFileSchema = {
      version: '1.4',
      showName,
      savedAt: new Date().toISOString(),
      masterVolume,
      defaultTransitionType: transitionType,
      defaultTransitionDuration: transitionDuration,
      mosaicConfig,
      cues,
    };
    window.electronAPI.autosaveShow(JSON.stringify(schema, null, 2));
  }, [cues, showName, masterVolume, transitionType, transitionDuration, mosaicConfig]);

  // Load cue into Preview player when previewCueId changes
  useEffect(() => {
    const v = previewVideoRef.current;
    const cue = cues.find((c) => c.id === previewCueId);
    if (!v) return;

    if (!cue) {
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
      v.currentTime = cue.inPoint || 0;
      setPrvTime(cue.inPoint || 0);
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

      incomingVideo.src = mediaUrl;
      incomingVideo.playbackRate = targetCue.playbackRate || 1;
      incomingVideo.currentTime = targetCue.inPoint || 0;

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
      setIsFrozen(false);
      isFrozenRef.current = false;
      setIsTestPattern(false);
      isTestPatternRef.current = false;
      endActionTriggeredRef.current = false;

      // Auto-advance Preview to the next cue in the Cue List
      const idx = cuesRef.current.findIndex((c) => c.id === targetCue.id);
      if (idx >= 0 && idx + 1 < cuesRef.current.length) {
        const nextInList = cuesRef.current[idx + 1];
        setPreviewCueId(nextInList.id);
        setSelectedCueId(nextInList.id);
      }

      const effectiveType = overrideCut ? 'cut' : targetCue.transitionType || transitionType;
      const effectiveDur = overrideCut ? 0 : targetCue.transitionDuration || transitionDuration;
      setTransitionType(effectiveType);
      transTypeRef.current = effectiveType;

      incomingVideo.play().catch(() => {});
      setPgmPlaying(true);

      if (effectiveType === 'cut' || effectiveDur <= 0.05) {
        setTransitionProgress(1);
        transProgressRef.current = 1;
        if (outgoingVideo) {
          outgoingVideo.pause();
        }
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
            requestAnimationFrame(stepTransition);
          } else {
            if (outgoingVideo) {
              outgoingVideo.pause();
            }
          }
        };
        requestAnimationFrame(stepTransition);
      }
    },
    [ensureAudioGraph, transitionType, transitionDuration]
  );

  // Main 60Hz Engine Loop
  useEffect(() => {
    let rafId = 0;
    const dataL = new Uint8Array(128);
    const dataR = new Uint8Array(128);
    let peakHoldL = 0;
    let peakHoldR = 0;

    const tick = () => {
      const actDeck = activeDeckRef.current;
      const vA = pgmVideoARef.current;
      const vB = pgmVideoBRef.current;
      const activeVideo = actDeck === 'A' ? vA : vB;
      const cueA = cuesRef.current.find((c) => c.id === deckACueIdRef.current);
      const cueB = cuesRef.current.find((c) => c.id === deckBCueIdRef.current);
      const activeCue = actDeck === 'A' ? cueA : cueB;

      if (activeVideo && activeCue) {
        const curT = activeVideo.currentTime || 0;
        const inPt = activeCue.inPoint || 0;
        const outPt = activeCue.outPoint > inPt ? activeCue.outPoint : activeCue.duration;
        const rem = Math.max(0, outPt - curT);

        setPgmTime(curT);
        setPgmRemaining(rem);
        setPgmPlaying(!activeVideo.paused && !isFrozenRef.current);

        // Check End Action when reaching Out Point
        if (!activeVideo.paused && outPt > 0 && curT >= outPt - 0.04 && !endActionTriggeredRef.current) {
          const action = activeCue.endAction;
          if (action === 'loop') {
            activeVideo.currentTime = inPt;
            activeVideo.play().catch(() => {});
          } else if (action === 'hold') {
            endActionTriggeredRef.current = true;
            activeVideo.pause();
            activeVideo.currentTime = Math.max(inPt, outPt - 0.02);
            setPgmPlaying(false);
          } else if (action === 'black') {
            endActionTriggeredRef.current = true;
            activeVideo.pause();
            setIsBlackout(true);
            isBlackoutRef.current = true;
            setPgmPlaying(false);
          } else if (action === 'next') {
            endActionTriggeredRef.current = true;
            const currentIdx = cuesRef.current.findIndex((c) => c.id === activeCue.id);
            if (currentIdx >= 0 && currentIdx + 1 < cuesRef.current.length) {
              const nextCue = cuesRef.current[currentIdx + 1];
              triggerTakeCue(nextCue.id, false);
            } else {
              activeVideo.pause();
              setPgmPlaying(false);
            }
          } else if (action === 'stop') {
            endActionTriggeredRef.current = true;
            activeVideo.pause();
            activeVideo.removeAttribute('src');
            activeVideo.load();
            setProgramCueId(null);
            setPgmPlaying(false);
          }
        }
      } else {
        setPgmTime(0);
        setPgmRemaining(0);
        setPgmPlaying(false);
      }

      // Compute Deck A & Deck B Envelopes
      const tProg = transProgressRef.current;
      const tType = transTypeRef.current;
      const envA = computeDeckEnvelopes(cueA, vA?.currentTime || 0, actDeck === 'A', tProg, tType);
      const envB = computeDeckEnvelopes(cueB, vB?.currentTime || 0, actDeck === 'B', tProg, tType);

      // Update Native Audio Gains on Program Decks A/B & Preview Deck
      const masterGainVal =
        masterMutedRef.current || isBlackoutRef.current || isFrozenRef.current
          ? 0
          : masterVolRef.current / 100;

      const effectiveGainA = Math.min(1, Math.max(0, envA.audioGain * masterGainVal));
      const effectiveGainB = Math.min(1, Math.max(0, envB.audioGain * masterGainVal));

      if (vA) {
        vA.muted = effectiveGainA <= 0.0005;
        vA.volume = effectiveGainA;
      }
      if (vB) {
        vB.muted = effectiveGainB <= 0.0005;
        vB.volume = effectiveGainB;
      }

      const prvVid = previewVideoRef.current;
      const prvCueObj = cuesRef.current.find((c) => c.id === previewCueId);
      const prvClipGain =
        prvCueObj && !prvCueObj.muted && prvAuditionRef.current
          ? Math.min(1, (prvCueObj.volume ?? 100) / 100)
          : 0;
      const effectivePrvGain = Math.min(
        1,
        Math.max(0, prvClipGain * (masterMutedRef.current ? 0 : masterVolRef.current / 100))
      );
      if (prvVid) {
        prvVid.muted = !prvAuditionRef.current || effectivePrvGain <= 0.0005;
        prvVid.volume = effectivePrvGain;
      }

      // Update Stereo L/R VU Meters in real time
      const pgmIsAudible =
        activeVideo &&
        !activeVideo.paused &&
        !isFrozenRef.current &&
        activeCue &&
        activeCue.audioChannels > 0 &&
        Math.max(effectiveGainA, effectiveGainB) > 0.001;

      const prvIsAudible =
        !pgmIsAudible &&
        prvVid &&
        !prvVid.paused &&
        prvCueObj &&
        prvCueObj.audioChannels > 0 &&
        effectivePrvGain > 0.001;

      if (pgmIsAudible || prvIsAudible) {
        const activeGain = pgmIsAudible
          ? Math.max(effectiveGainA, effectiveGainB)
          : effectivePrvGain;
        const tNow = performance.now() * 0.012;
        const baseMeter = Math.min(96, Math.pow(activeGain, 0.58) * 82);
        const modL = Math.sin(tNow * 1.7) * 4.5 + Math.cos(tNow * 3.1) * 2.8;
        const modR = Math.cos(tNow * 1.9) * 4.5 + Math.sin(tNow * 2.7) * 2.8;
        const levelL = Math.min(100, Math.max(4, baseMeter + modL));
        const levelR = Math.min(100, Math.max(4, baseMeter + modR));
        peakHoldL = Math.max(levelL, peakHoldL * 0.975);
        peakHoldR = Math.max(levelR, peakHoldR * 0.975);
        setVuLevels({ left: levelL, right: levelR, peakL: peakHoldL, peakR: peakHoldR });
      } else {
        peakHoldL *= 0.91;
        peakHoldR *= 0.91;
        setVuLevels({ left: 0, right: 0, peakL: peakHoldL, peakR: peakHoldR });
      }

      // Build DeckSyncPayloads & Sync with 2nd Display Output Window
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

      if (window.electronAPI) {
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

        // Update Companion / HTTP telemetry every 10 frames
        if (syncSeqRef.current % 10 === 0) {
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
      setIsFrozen(false);
      isFrozenRef.current = false;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [ensureAudioGraph, programCueId, previewCueId, triggerTakeCue]);

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
    pgmVideoARef.current?.pause();
    pgmVideoBRef.current?.pause();
    previewVideoRef.current?.pause();
    setIsBlackout(true);
    isBlackoutRef.current = true;
    setIsTestPattern(false);
    isTestPatternRef.current = false;
    setPgmPlaying(false);
  }, []);

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
          setIsBlackout((b) => {
            isBlackoutRef.current = !b;
            return !b;
          });
          break;
        case 'freeze':
          setIsFrozen((f) => {
            isFrozenRef.current = !f;
            return !f;
          });
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
          setMasterVolume(Math.max(0, Math.min(125, Number(cmd.value) || 100)));
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
          const z = Math.max(50, Math.min(300, Number(cmd.value) || 100));
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
        setIsBlackout((prev) => {
          isBlackoutRef.current = !prev;
          return !prev;
        });
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsFrozen((prev) => {
          isFrozenRef.current = !prev;
          return !prev;
        });
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

  // Helper to update a cue
  const updateCue = (id: string, patch: Partial<VideoCue>) => {
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
      const probe = await window.electronAPI.probeMedia(filePath);
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

    setCues((prev) => {
      const updated = [...prev, ...newCues];
      if (!previewCueId && newCues.length > 0) {
        setPreviewCueId(newCues[0].id);
        setSelectedCueId(newCues[0].id);
      }
      return updated;
    });
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

  const handleSaveShow = async () => {
    if (!window.electronAPI) return;
    const schema: ShowFileSchema = {
      version: '1.4',
      showName,
      savedAt: new Date().toISOString(),
      masterVolume,
      defaultTransitionType: transitionType,
      defaultTransitionDuration: transitionDuration,
      mosaicConfig,
      cues,
    };
    await window.electronAPI.saveShowFile(JSON.stringify(schema, null, 2), showName);
  };

  const handleOpenShow = async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.openShowFile();
    if (!res) return;
    try {
      const parsed: ShowFileSchema = JSON.parse(res.content);
      setShowName(parsed.showName || 'CuePro Show');
      setMasterVolume(parsed.masterVolume ?? 100);
      setTransitionType(parsed.defaultTransitionType || 'dissolve');
      setTransitionDuration(parsed.defaultTransitionDuration || 1.0);
      if (parsed.mosaicConfig) {
        setMosaicConfig(parsed.mosaicConfig);
      }
      setCues(parsed.cues || []);
      if (parsed.cues && parsed.cues.length > 0) {
        setPreviewCueId(parsed.cues[0].id);
        setSelectedCueId(parsed.cues[0].id);
      }
    } catch {}
  };

  const handleNewShow = () => {
    handlePanic();
    setCues([]);
    setPreviewCueId(null);
    setProgramCueId(null);
    setSelectedCueId(null);
    setShowName('Nuevo Show');
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
            <h2>SOLTAR VÍDEOS O CARPETAS PARA AÑADIR AL CUE LIST</h2>
            <p>Soporte directo para MP4, MOV (ProRes/H.264), MKV, WebM, AVI, MXF</p>
          </div>
        </div>
      )}

      {/* ================= CLEAN TOP BAR (macOS Style) ================= */}
      <header className="top-broadcast-bar">
        <div className="brand-and-show">
          <div className="show-file-btns">
            <button className="top-btn" onClick={handleNewShow} title="Nuevo Show">
              <FilePlus size={14} />
              <span>Nuevo</span>
            </button>
            <button className="top-btn" onClick={handleOpenShow} title="Abrir Show (.cueshow)">
              <FolderOpen size={14} />
              <span>Abrir</span>
            </button>
            <button className="top-btn" onClick={handleSaveShow} title="Guardar Show (.cueshow)">
              <Save size={14} />
              <span>Guardar</span>
            </button>
          </div>
        </div>

        {/* Center Master Clocks (Elapsed & Remaining) */}
        <div className="master-clocks-strip">
          <div className="clock-box">
            <span className="clock-label">TRANSCURRIDO (PGM)</span>
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
            <span className="clock-label">TIEMPO RESTANTE (REMAINING)</span>
            <span className="clock-digits remaining">
              -{formatTimecode(pgmRemaining, programCue?.fps || 25, true)}
            </span>
          </div>
        </div>

        {/* Right Output Display, Mosaic & Companion Controls */}
        <div className="output-display-controls">
          <div className="display-selector-group">
            <Monitor size={14} className="cyan-text" />
            <select
              className="display-select"
              value={mosaicConfig.display1Id ?? selectedDisplayId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedDisplayId(id);
                const nextMosaic = { ...mosaicConfig, display1Id: id };
                setMosaicConfig(nextMosaic);
                if (outputOpen && window.electronAPI) {
                  window.electronAPI
                    .setOutputWindow({
                      open: true,
                      displayId: id,
                      windowed: false,
                      mosaicConfig: nextMosaic,
                    })
                    .then((res) => {
                      setOutputOpen(res.isOpen);
                      setIsSpannedActive(!!res.isSpanned);
                    });
                }
              }}
              title="Seleccionar Pantalla de Salida Fullscreen"
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className={`top-btn mosaic-top-btn ${mosaicConfig.mode !== 'single' ? 'active-cyan' : ''}`}
            onClick={() => setIsMosaicModalOpen(true)}
            title="Configurar Mosaico Síncrono (Horizontal 2×1, Vertical 1×2, Espejo Dual)"
          >
            <Layers size={14} />
            <span>
              {mosaicConfig.mode === 'horizontal_2x1'
                ? 'Mosaico 2×1 H'
                : mosaicConfig.mode === 'vertical_1x2'
                ? 'Mosaico 1×2 V'
                : mosaicConfig.mode === 'mirror_2x'
                ? 'Espejo Dual'
                : 'Mosaico'}
            </span>
          </button>

          <button
            className={`output-live-btn ${outputOpen ? 'live' : ''}`}
            onClick={() => handleToggleOutputWindow(false)}
            title="Activar / Desactivar Salida Fullscreen automática en la pantalla seleccionada"
          >
            <span className="live-indicator" />
            <span>
              {outputOpen
                ? mosaicConfig.mode === 'single'
                  ? 'SALIDA: ON'
                  : 'MOSAICO: ON'
                : 'ACTIVAR SALIDA'}
            </span>
          </button>

          <button
            className={`top-btn ${showOSD ? 'active-cyan' : ''}`}
            onClick={() => setShowOSD(!showOSD)}
            title="Mostrar / Ocultar Timecode y Resolución OSD en las pantallas de salida"
          >
            <Eye size={14} />
            <span>OSD</span>
          </button>

          <button
            className="top-btn companion-btn"
            onClick={() => setIsRemoteModalOpen(true)}
            title="Configurar Bitfocus Companion (OSC / HTTP) y Atajos"
          >
            <Radio size={14} />
            <span>Companion</span>
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
            onToggleBlackout={() =>
              setIsBlackout((b) => {
                isBlackoutRef.current = !b;
                return !b;
              })
            }
            isFrozen={isFrozen}
            onToggleFreeze={() =>
              setIsFrozen((f) => {
                isFrozenRef.current = !f;
                return !f;
              })
            }
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
          title="Arrastra arriba o abajo para ajustar el tamaño de los monitores y del Cue List"
        >
          <div className="resizer-grip-pill" />
        </div>

        {/* LOWER SECTION: CUE LIST + VERTICAL SPLITTER + INSPECTOR */}
        <section className="lower-workspace-section">
          <div className="cuelist-container-flex">
            <CueList
              cues={cues}
              selectedCueId={selectedCueId}
              previewCueId={previewCueId}
              programCueId={programCueId}
              onSelectCue={(id) => setSelectedCueId(id)}
              onLoadToPreview={(id) => {
                setPreviewCueId(id);
                setSelectedCueId(id);
              }}
              onTakeCueToProgram={(id) => triggerTakeCue(id, false)}
              onUpdateCue={updateCue}
              onDeleteCue={(id) => {
                setCues((prev) => prev.filter((c) => c.id !== id));
                if (previewCueId === id) setPreviewCueId(null);
                if (selectedCueId === id) setSelectedCueId(null);
              }}
              onDuplicateCue={(id) => {
                const idx = cues.findIndex((c) => c.id === id);
                if (idx < 0) return;
                const orig = cues[idx];
                const copy: VideoCue = {
                  ...orig,
                  id: `cue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  cueNumber: `${orig.cueNumber}B`,
                  name: `${orig.name} (Copia)`,
                };
                const next = [...cues];
                next.splice(idx + 1, 0, copy);
                setCues(next);
              }}
              onMoveCue={(index, dir) => {
                const target = index + dir;
                if (target < 0 || target >= cues.length) return;
                const next = [...cues];
                const [item] = next.splice(index, 1);
                next.splice(target, 0, item);
                setCues(next);
              }}
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
            title="Arrastra a izquierda o derecha para ampliar o reducir el panel de ajustes"
          >
            <div className="resizer-grip-pill-v" />
          </div>

          <div
            className="inspector-container-fixed"
            style={{ width: `${inspectorWidthPx}px` }}
          >
            <CueInspector
              cue={selectedCue}
              prvCurrentTime={prvTime}
              totalCanvasWidth={totalCanvasWidth}
              totalCanvasHeight={totalCanvasHeight}
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
        onRefreshDisplays={handleRefreshDisplays}
        onApplyAndLaunchOutput={(windowed) => {
          handleToggleOutputWindow(!!windowed, true);
        }}
      />
    </div>
  );
};
export default App;
