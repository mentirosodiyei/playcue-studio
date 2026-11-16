export type EndAction = 'hold' | 'black' | 'loop' | 'next' | 'goto' | 'stop';

export type TransitionType = 'cut' | 'dissolve' | 'dipToBlack' | 'wipe';

export type ScaleMode = 'fit' | 'fill' | 'stretch';

export type AspectRatioMode =
  | 'native'
  | 'output'
  | '16:9'
  | '16:10'
  | '4:3'
  | '21:9'
  | '32:9'
  | '9:16'
  | '1:1';

export type CueColor = 'none' | 'red' | 'amber' | 'emerald' | 'blue' | 'purple' | 'cyan';

export type MosaicMode = 'single' | 'horizontal_2x1' | 'vertical_1x2' | 'mirror_2x';

export interface ConvertVideoOptions {
  targetCodec?: 'copy_video' | 'h264' | 'h264_intra' | 'hevc' | 'prores';
  quality?: 'high' | 'medium' | 'light';
  resolution?: 'original' | '1080p' | '720p';
  audioCodec?:
    | 'aac_320'
    | 'aac_192'
    | 'pcm_s16le'
    | 'pcm_s24le'
    | 'mp3_320'
    | 'copy_audio'
    | 'mute_audio';
  audioSampleRate?: 48000 | 44100;
  audioChannels?: '2' | '1' | 'original';
  audioNormalize?: boolean;
}

export interface MosaicSliceViewport {
  mode: MosaicMode;
  role: 'full' | 'slot1' | 'slot2';
  // Virtual total canvas in pixels
  canvasWidth: number;
  canvasHeight: number;
  // This output's slice rectangle inside the virtual canvas (0..canvasWidth, 0..canvasHeight)
  sliceX: number;
  sliceY: number;
  sliceWidth: number;
  sliceHeight: number;
  label: string;
}

export interface MosaicConfig {
  mode: MosaicMode;
  display1Id: number | null;
  display2Id: number | null;
  preferSpannedWindow: boolean; // Use single borderless spanned surface when possible
  overlapPx: number; // Edge blending / overlap in pixels
  showSeamGuideInPreview: boolean;
}

export interface VideoCue {
  id: string;
  cueNumber: string;
  name: string;
  filePath: string;
  proxyPath?: string;
  proxyProgress?: number;
  fileName: string;
  fileSize: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  endAction: EndAction;
  /** Target cue id used when endAction === 'goto' (jump to another cue when this one ends). */
  gotoCueId?: string | null;
  nextCueId?: string;
  // Transition settings when taking this cue to Program
  transitionType: TransitionType;
  transitionDuration: number; // seconds, e.g. 1.0
  // Audio settings
  volume: number; // 0 to 150 (%)
  muted: boolean;
  audioFadeIn: number; // seconds
  audioFadeOut: number; // seconds
  // Video & Geometry settings
  scaleMode: ScaleMode;
  aspectRatio?: AspectRatioMode; // 'native' | 'output' | '16:9' | '4:3' etc.
  zoom?: number; // 20 to 300 (%) — default 100
  scaleX?: number; // 10 to 300 (%) — default 100
  scaleY?: number; // 10 to 300 (%) — default 100
  offsetX?: number; // -100 to +100 (%) — default 0
  offsetY?: number; // -100 to +100 (%) — default 0
  // Background Blur Fill Layer (for videos that don't fill the screen)
  bgBlurEnabled?: boolean;
  bgBlurAmount?: number; // 0 to 100 (%) — default 90
  bgBlurBrightness?: number; // 20 to 100 (%) — default 75
  bgBlurZoom?: number; // 100 to 200 (%) — default 125
  opacity: number; // 0 to 100
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  videoFadeIn: number; // seconds
  videoFadeOut: number; // seconds
  playbackRate: number; // 0.25 to 2.0
  // Metadata from FFprobe
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  videoProfile?: string;
  pixelFormat?: string;
  bitrateKbps?: number;
  audioCodec: string;
  audioProfile?: string;
  audioChannels: number;
  audioChannelLayout?: string;
  audioSampleRate: number;
  audioBitrateKbps?: number;
  isAudioNativeCompatible?: boolean;
  container: string;
  isNativeCompatible: boolean;
  thumbnailDataUrl?: string;
  exists: boolean;
  /** Set at runtime when the <video> element fails to decode/load this cue (cleared on success). */
  playbackError?: string;
  color: CueColor;
  notes: string;
}

export interface DisplayInfo {
  id: number;
  label: string;
  width: number; // Logical DIP width
  height: number; // Logical DIP height
  physicalWidth: number; // Real EDID/signal pixel width (width * scaleFactor)
  physicalHeight: number; // Real EDID/signal pixel height (height * scaleFactor)
  refreshRate: number; // Hz (e.g., 50, 60)
  colorDepth: number;
  x: number;
  y: number;
  isPrimary: boolean;
  scaleFactor: number;
  isCustomFormat: boolean;
}

export interface DeckSyncPayload {
  cueId: string | null;
  mediaUrl: string | null;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  scaleMode: ScaleMode;
  aspectRatio: AspectRatioMode;
  zoom: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  videoWidth?: number;
  videoHeight?: number;
  bgBlurEnabled: boolean;
  bgBlurAmount: number;
  bgBlurBrightness: number;
  bgBlurZoom: number;
  opacity: number; // combined clip opacity * fade envelope * transition alpha (0..1)
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface OutputSyncState {
  deckA: DeckSyncPayload;
  deckB: DeckSyncPayload;
  activeDeck: 'A' | 'B';
  transitionType: TransitionType;
  transitionProgress: number; // 0..1 (1 = fully on activeDeck)
  isBlackout: boolean;
  isFrozen: boolean;
  isTestPattern: boolean;
  showOSD: boolean;
  programCueName: string;
  programCueNumber: string;
  remainingTime: number;
  programFps?: number;
  mosaicConfig?: MosaicConfig;
  totalCanvasWidth?: number;
  totalCanvasHeight?: number;
  syncSeq: number;
}

export interface ShowFileSchema {
  version: string;
  showName: string;
  savedAt: string;
  masterVolume: number;
  defaultTransitionType: TransitionType;
  defaultTransitionDuration: number;
  mosaicConfig?: MosaicConfig;
  cues: VideoCue[];
}

export interface DetectedGpuDevice {
  name: string;
  vendor: 'nvidia' | 'amd' | 'intel' | 'other';
  tier: 'discrete' | 'integrated' | 'software';
  vramMB: number;
  driverVersion?: string;
  score: number;
  isSelected: boolean;
}

export interface HardwareProfileInfo {
  selectedGpuName: string;
  selectedGpuTier: 'discrete' | 'integrated' | 'software';
  selectedGpuVendor: 'nvidia' | 'amd' | 'intel' | 'other';
  selectedGpuVramMB: number;
  playbackDecoderLabel: string;
  preferredH264Encoder: string;
  preferredHevcEncoder: string;
  preferredEncoderLabel: string;
  availableHwEncoders: string[];
  cpuModel: string;
  cpuCores: number;
  gpus: DetectedGpuDevice[];
}

export interface RemoteCommandLog {
  action: string;
  value?: number | string | boolean;
  source: 'OSC' | 'HTTP';
  rawAddress: string;
  timestamp: string;
}

declare global {
  interface Window {
    electronAPI?: {
      getDisplays: () => Promise<DisplayInfo[]>;
      getHardwareInfo: () => Promise<HardwareProfileInfo>;
      getOutputStatus: () => Promise<{
        isOpen: boolean;
        displayId: number | null;
        mosaicMode?: MosaicMode;
        isSpanned?: boolean;
        totalWidth?: number;
        totalHeight?: number;
      }>;
      setOutputWindow: (payload: {
        open: boolean;
        displayId?: number;
        windowed?: boolean;
        mosaicConfig?: MosaicConfig;
      }) => Promise<{
        isOpen: boolean;
        displayId: number | null;
        mosaicMode?: MosaicMode;
        isSpanned?: boolean;
        totalWidth?: number;
        totalHeight?: number;
      }>;
      syncOutputState: (state: OutputSyncState) => void;
      updateTelemetry: (telemetry: any) => void;
      getRemoteInfo: () => Promise<{ oscPort: number; httpPort: number; ips: string[] }>;
      installCompanionModule: () => Promise<{ ok: boolean; targetDir?: string; error?: string }>;
      selectVideoFiles: () => Promise<string[]>;
      selectVideoFolder: () => Promise<string[]>;
      expandDroppedPaths: (paths: string[]) => Promise<string[]>;
      locateFileInFolder: (filePath: string) => Promise<boolean>;
      relinkVideoFile: (oldName: string) => Promise<string | null>;
      probeMedia: (filePath: string) => Promise<any>;
      transcodeProxy: (payload: {
        cueId: string;
        filePath: string;
        duration: number;
        options?: ConvertVideoOptions;
      }) => Promise<string>;
      generateDemoClips: () => Promise<any[]>;
      getFirstRunDemoClips: () => Promise<any[]>;
      saveShowFile: (json: string, defaultName: string) => Promise<string | null>;
      openShowFile: () => Promise<{ filePath: string; content: string } | null>;
      autosaveShow: (json: string) => Promise<boolean>;
      logSetProject: (name: string) => Promise<void>;
      logWrite: (level: string, source: string, message: string) => Promise<void>;
      openLogsFolder: () => Promise<string>;
      openExternal: (url: string) => Promise<boolean>;
      loadAutosaveShow: () => Promise<string | null>;
      getPathForFile: (file: File) => string;
      onDisplaysUpdated: (cb: (displays: DisplayInfo[]) => void) => () => void;
      onOutputWindowStatus: (
        cb: (status: {
          isOpen: boolean;
          displayId: number | null;
          mosaicMode?: MosaicMode;
          isSpanned?: boolean;
          totalWidth?: number;
          totalHeight?: number;
        }) => void
      ) => () => void;
      onOutputState: (cb: (state: OutputSyncState) => void) => () => void;
      onProxyProgress: (cb: (data: { cueId: string; percent: number }) => void) => () => void;
      onRemoteCommand: (cb: (cmd: RemoteCommandLog) => void) => () => void;
    };
  }
}
