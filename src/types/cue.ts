export type EndAction = 'hold' | 'black' | 'loop' | 'next' | 'stop';

export type TransitionType = 'cut' | 'dissolve' | 'dipToBlack' | 'wipe';

export type ScaleMode = 'fit' | 'fill' | 'stretch';

export type CueColor = 'none' | 'red' | 'amber' | 'emerald' | 'blue' | 'purple' | 'cyan';

export type MosaicMode = 'single' | 'horizontal_2x1' | 'vertical_1x2' | 'mirror_2x';

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
  audioCodec: string;
  audioChannels: number;
  audioSampleRate: number;
  container: string;
  isNativeCompatible: boolean;
  thumbnailDataUrl?: string;
  exists: boolean;
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
      selectVideoFiles: () => Promise<string[]>;
      relinkVideoFile: (oldName: string) => Promise<string | null>;
      probeMedia: (filePath: string) => Promise<any>;
      transcodeProxy: (payload: {
        cueId: string;
        filePath: string;
        duration: number;
      }) => Promise<string>;
      generateDemoClips: () => Promise<any[]>;
      saveShowFile: (json: string, defaultName: string) => Promise<string | null>;
      openShowFile: () => Promise<{ filePath: string; content: string } | null>;
      autosaveShow: (json: string) => Promise<boolean>;
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
