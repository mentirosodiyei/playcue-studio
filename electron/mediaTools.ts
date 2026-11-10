import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

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

export interface MediaProbeResult {
  filePath: string;
  proxyPath?: string;
  fileName: string;
  fileSize: number;
  duration: number;
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
  isAudioNativeCompatible: boolean;
  container: string;
  isNativeCompatible: boolean;
  thumbnailDataUrl?: string;
  exists: boolean;
}

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

const CHROMIUM_NATIVE_VIDEO_CODECS = new Set([
  'h264',
  'avc1',
  'vp8',
  'vp9',
  'av1',
  'theora',
  'hevc',
  'h265',
]);

// Audio codecs that Chromium HTML5 <video> decodes natively out-of-the-box
const CHROMIUM_NATIVE_AUDIO_CODECS = new Set([
  'aac',
  'mp3',
  'opus',
  'vorbis',
  'flac',
  'pcm_s16le',
  'pcm_f32le',
  'pcm_u8',
  'none',
]);

const CHROMIUM_NATIVE_EXTS = new Set(['.mp4', '.webm', '.m4v', '.mov', '.ogg', '.ogv']);

export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  '.avi',
  '.mxf',
  '.m4v',
  '.wmv',
  '.mpg',
  '.mpeg',
  '.ts',
  '.flv',
  '.ogv',
]);

export function expandPathsToVideoFiles(inputPaths: string[]): string[] {
  const result: string[] = [];
  const visit = (p: string) => {
    try {
      if (!fs.existsSync(p)) return;
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(p);
        for (const entry of entries) {
          visit(path.join(p, entry));
        }
      } else if (stat.isFile()) {
        const ext = path.extname(p).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          result.push(p);
        }
      }
    } catch {}
  };
  for (const p of inputPaths) {
    visit(p);
  }
  return result;
}

export function getFfmpegPath(): string {
  if (ffmpegStatic) {
    const unpacked = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpacked)) return unpacked;
    if (fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  }
  return 'ffmpeg';
}

export function getFfprobePath(): string {
  const p = ffprobeStatic?.path;
  if (p) {
    const unpacked = p.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpacked)) return unpacked;
    if (fs.existsSync(p)) return p;
  }
  return 'ffprobe';
}

let cachedHardwareProfile: HardwareProfileInfo | null = null;
let hardwareDetectionPromise: Promise<HardwareProfileInfo> | null = null;

function classifyGpuDevice(
  rawName: string,
  vramBytes = 0,
  driverVersion = '',
  vendorId?: number
): DetectedGpuDevice {
  const name = (rawName || 'Adaptador Gráfico').trim();
  const lower = name.toLowerCase();
  const vramMB = Math.max(0, Math.round(vramBytes / (1024 * 1024)));
  const vramGB = vramMB / 1024;

  let vendor: DetectedGpuDevice['vendor'] = 'other';
  if (
    vendorId === 0x10de ||
    lower.includes('nvidia') ||
    lower.includes('geforce') ||
    lower.includes('quadro') ||
    lower.includes('rtx') ||
    lower.includes('gtx') ||
    lower.includes('tesla')
  ) {
    vendor = 'nvidia';
  } else if (
    vendorId === 0x1002 ||
    lower.includes('amd') ||
    lower.includes('radeon') ||
    lower.includes('firepro')
  ) {
    vendor = 'amd';
  } else if (
    vendorId === 0x8086 ||
    lower.includes('intel') ||
    lower.includes('iris') ||
    lower.includes('uhd') ||
    lower.includes('hd graphics') ||
    lower.includes('arc')
  ) {
    vendor = 'intel';
  }

  let tier: DetectedGpuDevice['tier'] = 'integrated';
  let score = 40;

  if (
    lower.includes('microsoft basic') ||
    lower.includes('remote desktop') ||
    lower.includes('parsec') ||
    lower.includes('virtual')
  ) {
    tier = 'software';
    score = 5;
  } else if (vendor === 'nvidia') {
    tier = 'discrete';
    score = 100 + Math.min(32, vramGB);
  } else if (vendor === 'amd') {
    const isDiscreteAmd =
      lower.includes('radeon rx') ||
      lower.includes('radeon pro') ||
      lower.includes('firepro') ||
      lower.includes('radeon vii') ||
      /\brx\s?\d{3,4}/i.test(name) ||
      /\bw\d{4}/i.test(name) ||
      (vramMB >= 3072 && !lower.includes('radeon(tm) graphics'));
    if (isDiscreteAmd) {
      tier = 'discrete';
      score = 95 + Math.min(32, vramGB);
    } else {
      tier = 'integrated';
      score = 55 + Math.min(8, vramGB);
    }
  } else if (vendor === 'intel') {
    const isDiscreteIntelArc =
      lower.includes('arc') &&
      (/\ba[357]\d{2}/i.test(name) || /\bb[57]\d{2}/i.test(name) || vramMB >= 4000);
    if (isDiscreteIntelArc) {
      tier = 'discrete';
      score = 90 + Math.min(24, vramGB);
    } else {
      tier = 'integrated';
      score = 50 + Math.min(8, vramGB);
    }
  }

  return {
    name,
    vendor,
    tier,
    vramMB,
    driverVersion,
    score: Math.round(score * 10) / 10,
    isSelected: false,
  };
}

function queryWindowsWmiGpus(): Promise<DetectedGpuDevice[]> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }
    const psCmd =
      'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress';
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
      windowsHide: true,
    });
    let stdout = '';
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
      resolve([]);
    }, 3000);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve([]);
    });
    proc.on('close', () => {
      clearTimeout(timer);
      try {
        const trimmed = stdout.trim();
        if (!trimmed) {
          resolve([]);
          return;
        }
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const devices: DetectedGpuDevice[] = [];
        for (const item of arr) {
          if (item && item.Name) {
            devices.push(
              classifyGpuDevice(
                String(item.Name),
                Number(item.AdapterRAM) || 0,
                String(item.DriverVersion || '')
              )
            );
          }
        }
        resolve(devices);
      } catch {
        resolve([]);
      }
    });
  });
}

function testFfmpegHwEncoder(encoderName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = getFfmpegPath();
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=256x256:d=0.04:r=25',
      '-frames:v',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      encoderName,
      '-f',
      'null',
      '-',
    ];
    const proc = spawn(ffmpeg, args, { windowsHide: true });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
      resolve(false);
    }, 2400);

    proc.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export async function detectHardwareProfile(electronGpuInfo?: any): Promise<HardwareProfileInfo> {
  if (cachedHardwareProfile) return cachedHardwareProfile;
  if (hardwareDetectionPromise) return hardwareDetectionPromise;

  hardwareDetectionPromise = (async () => {
    const cpus = os.cpus() || [];
    const cpuModel = (cpus[0]?.model || 'CPU Multi-Core').trim();
    const cpuCores = cpus.length || 4;

    const wmiGpus = await queryWindowsWmiGpus();
    const mergedMap = new Map<string, DetectedGpuDevice>();

    for (const g of wmiGpus) {
      mergedMap.set(g.name.toLowerCase(), g);
    }

    if (electronGpuInfo && Array.isArray(electronGpuInfo.gpuDevice)) {
      for (const dev of electronGpuInfo.gpuDevice) {
        const rawName =
          dev.deviceString ||
          dev.driverDescription ||
          (dev.vendorId === 0x10de
            ? 'NVIDIA GPU'
            : dev.vendorId === 0x1002
            ? 'AMD Radeon GPU'
            : dev.vendorId === 0x8086
            ? 'Intel Graphics GPU'
            : '');
        if (!rawName) continue;
        const key = rawName.toLowerCase().trim();
        if (!mergedMap.has(key)) {
          mergedMap.set(
            key,
            classifyGpuDevice(
              rawName,
              (dev.cudaComputeCapabilityMajor ? 8192 : 0) * 1024 * 1024,
              dev.driverVersion || '',
              dev.vendorId
            )
          );
        }
      }
    }

    let gpus = Array.from(mergedMap.values()).filter((g) => g.tier !== 'software');
    if (gpus.length === 0) {
      gpus = Array.from(mergedMap.values());
    }
    if (gpus.length === 0) {
      gpus = [classifyGpuDevice('GPU Integrada del Sistema', 0, '')];
    }

    // Sort by power score descending: Discrete GPU always beats Integrated GPU
    gpus.sort((a, b) => b.score - a.score);
    gpus[0].isSelected = true;
    const bestGpu = gpus[0];

    // Probe real working FFmpeg hardware encoders in priority order (Discrete GPU -> Integrated GPU -> CPU)
    const candidatePairs: { h264: string; hevc: string; label: string; vendor: string }[] = [
      {
        h264: 'h264_nvenc',
        hevc: 'hevc_nvenc',
        label: 'NVIDIA NVENC (GPU Dedicada)',
        vendor: 'nvidia',
      },
      {
        h264: 'h264_amf',
        hevc: 'hevc_amf',
        label: 'AMD AMF (Aceleración GPU)',
        vendor: 'amd',
      },
      {
        h264: 'h264_qsv',
        hevc: 'hevc_qsv',
        label: 'Intel QuickSync Video (GPU)',
        vendor: 'intel',
      },
    ];

    // Prioritize probing the selected best GPU vendor first
    candidatePairs.sort((a, b) =>
      a.vendor === bestGpu.vendor ? -1 : b.vendor === bestGpu.vendor ? 1 : 0
    );

    const availableHwEncoders: string[] = [];
    let preferredH264Encoder = 'libx264';
    let preferredHevcEncoder = 'libx265';
    let preferredEncoderLabel = `CPU Multi-Core (${cpuCores} hilos)`;

    for (const pair of candidatePairs) {
      const okH264 = await testFfmpegHwEncoder(pair.h264);
      if (okH264) {
        availableHwEncoders.push(pair.h264);
        const okHevc = await testFfmpegHwEncoder(pair.hevc);
        if (okHevc) availableHwEncoders.push(pair.hevc);

        if (preferredH264Encoder === 'libx264') {
          preferredH264Encoder = pair.h264;
          preferredHevcEncoder = okHevc ? pair.hevc : 'libx265';
          preferredEncoderLabel = pair.label;
        }
      }
    }

    const tierLabel =
      bestGpu.tier === 'discrete'
        ? 'GPU Dedicada • Máxima Prioridad'
        : bestGpu.tier === 'integrated'
        ? 'GPU Integrada • Aceleración Hardware'
        : 'Renderizado Software';

    const playbackDecoderLabel =
      bestGpu.vendor === 'nvidia'
        ? `NVDEC / D3D11VA Zero-Copy (${tierLabel})`
        : bestGpu.vendor === 'amd'
        ? `AMD D3D11VA Zero-Copy (${tierLabel})`
        : bestGpu.vendor === 'intel'
        ? `Intel QSV / D3D11VA Zero-Copy (${tierLabel})`
        : `D3D11VA Hardware (${tierLabel})`;

    const profile: HardwareProfileInfo = {
      selectedGpuName: bestGpu.name,
      selectedGpuTier: bestGpu.tier,
      selectedGpuVendor: bestGpu.vendor,
      selectedGpuVramMB: bestGpu.vramMB,
      playbackDecoderLabel,
      preferredH264Encoder,
      preferredHevcEncoder,
      preferredEncoderLabel,
      availableHwEncoders,
      cpuModel,
      cpuCores,
      gpus,
    };

    cachedHardwareProfile = profile;
    return profile;
  })();

  return hardwareDetectionPromise;
}

/**
 * Fast universal audio remuxer using bundled FFmpeg codec pack:
 * Copies compatible video stream (-c:v copy) and decodes any audio codec
 * (AC-3, E-AC-3, DTS, MP2, PCM 24/32-bit, ALAC, WMA, 5.1 surround) into
 * standard 320 kbps 48kHz Stereo AAC so Chromium plays audio immediately.
 */
export async function ensurePlayableAudioRemux(
  inputPath: string,
  cacheDir: string
): Promise<string | undefined> {
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const stat = fs.statSync(inputPath);
    const hash = crypto
      .createHash('md5')
      .update(inputPath + stat.mtimeMs + '_audioremux_v1')
      .digest('hex')
      .slice(0, 10);
    const baseName = path
      .basename(inputPath, path.extname(inputPath))
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const outputPath = path.join(cacheDir, `${baseName}_${hash}_audiocompat.mp4`);

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
      return outputPath;
    }

    return await new Promise((resolve) => {
      const ffmpeg = getFfmpegPath();
      const args = [
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '320k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        outputPath,
      ];
      const proc = spawn(ffmpeg, args, { windowsHide: true });
      proc.on('error', () => resolve(undefined));
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
          resolve(outputPath);
        } else {
          resolve(undefined);
        }
      });
    });
  } catch {
    return undefined;
  }
}

export async function probeMediaFile(
  filePath: string,
  cacheDir?: string
): Promise<MediaProbeResult> {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const exists = fs.existsSync(filePath);

  if (!exists) {
    return {
      filePath,
      fileName,
      fileSize: 0,
      duration: 0,
      width: 1920,
      height: 1080,
      fps: 25,
      videoCodec: 'missing',
      audioCodec: 'none',
      audioChannels: 0,
      audioSampleRate: 48000,
      isAudioNativeCompatible: true,
      container: ext.replace('.', ''),
      isNativeCompatible: false,
      exists: false,
    };
  }

  const stat = fs.statSync(filePath);

  return new Promise((resolve) => {
    const ffprobe = getFfprobePath();
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    const proc = spawn(ffprobe, args, { windowsHide: true });
    let stdout = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.on('error', () => {
      resolve({
        filePath,
        fileName,
        fileSize: stat.size,
        duration: 10,
        width: 1920,
        height: 1080,
        fps: 30,
        videoCodec: 'unknown',
        audioCodec: 'unknown',
        audioChannels: 2,
        audioSampleRate: 48000,
        isAudioNativeCompatible: true,
        container: ext.replace('.', ''),
        isNativeCompatible: CHROMIUM_NATIVE_EXTS.has(ext),
        exists: true,
      });
    });

    proc.on('close', async () => {
      try {
        const data = JSON.parse(stdout || '{}');
        const streams: any[] = data.streams || [];
        const format = data.format || {};

        const vStream = streams.find((s) => s.codec_type === 'video') || {};
        const aStream = streams.find((s) => s.codec_type === 'audio') || {};

        const duration =
          parseFloat(format.duration) ||
          parseFloat(vStream.duration) ||
          parseFloat(aStream.duration) ||
          0;
        const width = parseInt(vStream.width, 10) || 1920;
        const height = parseInt(vStream.height, 10) || 1080;

        let fps = 25;
        if (vStream.r_frame_rate && typeof vStream.r_frame_rate === 'string') {
          const parts = vStream.r_frame_rate.split('/');
          if (parts.length === 2 && parseFloat(parts[1]) > 0) {
            fps = Math.round((parseFloat(parts[0]) / parseFloat(parts[1])) * 100) / 100;
          }
        }

        const videoCodec = (vStream.codec_name || 'unknown').toLowerCase();
        const videoProfile = vStream.profile || '';
        const pixelFormat = vStream.pix_fmt || 'yuv420p';
        const bitrateKbps = format.bit_rate
          ? Math.round(parseInt(format.bit_rate, 10) / 1000)
          : undefined;

        const audioCodec = (aStream.codec_name || 'none').toLowerCase();
        const audioProfile = aStream.profile || aStream.codec_long_name || '';
        const audioChannels = parseInt(aStream.channels, 10) || 0;
        const audioChannelLayout =
          aStream.channel_layout ||
          (audioChannels === 2
            ? 'stereo'
            : audioChannels === 1
            ? 'mono'
            : audioChannels === 6
            ? '5.1'
            : audioChannels > 0
            ? `${audioChannels}ch`
            : 'none');
        const audioSampleRate = parseInt(aStream.sample_rate, 10) || 48000;
        const audioBitrateKbps = aStream.bit_rate
          ? Math.round(parseInt(aStream.bit_rate, 10) / 1000)
          : undefined;

        const isVideoNative =
          CHROMIUM_NATIVE_VIDEO_CODECS.has(videoCodec) && CHROMIUM_NATIVE_EXTS.has(ext);

        const isAudioNativeCompatible =
          audioChannels === 0 ||
          (CHROMIUM_NATIVE_AUDIO_CODECS.has(audioCodec) &&
            audioChannels <= 2 &&
            !(ext === '.mov' && audioCodec.startsWith('pcm_')));

        let autoProxyPath: string | undefined = undefined;
        // If video is H.264/HEVC but audio uses a codec Chromium can't decode natively (e.g. AC3, EAC3, MP2, PCM 24-bit, ALAC, DTS, 5.1, or MKV container),
        // automatically remux audio to AAC 320k stereo using bundled FFmpeg so audio plays immediately!
        if (
          cacheDir &&
          audioChannels > 0 &&
          (!isAudioNativeCompatible || ext === '.mkv' || ext === '.ts') &&
          (videoCodec === 'h264' || videoCodec === 'hevc' || videoCodec === 'h265')
        ) {
          autoProxyPath = await ensurePlayableAudioRemux(filePath, cacheDir);
        }

        const isNativeCompatible =
          (isVideoNative && isAudioNativeCompatible) || Boolean(autoProxyPath);

        const thumbnailDataUrl = await extractThumbnail(
          filePath,
          Math.min(Math.max(duration * 0.15, 0.5), 5)
        );

        resolve({
          filePath,
          proxyPath: autoProxyPath,
          fileName,
          fileSize: stat.size,
          duration,
          width,
          height,
          fps,
          videoCodec,
          videoProfile,
          pixelFormat,
          bitrateKbps,
          audioCodec,
          audioProfile,
          audioChannels,
          audioChannelLayout,
          audioSampleRate,
          audioBitrateKbps,
          isAudioNativeCompatible: isAudioNativeCompatible || Boolean(autoProxyPath),
          container: ext.replace('.', '').toUpperCase(),
          isNativeCompatible,
          thumbnailDataUrl,
          exists: true,
        });
      } catch {
        resolve({
          filePath,
          fileName,
          fileSize: stat.size,
          duration: 0,
          width: 1920,
          height: 1080,
          fps: 25,
          videoCodec: 'unknown',
          audioCodec: 'unknown',
          audioChannels: 2,
          audioSampleRate: 48000,
          isAudioNativeCompatible: true,
          container: ext.replace('.', '').toUpperCase(),
          isNativeCompatible: CHROMIUM_NATIVE_EXTS.has(ext),
          exists: true,
        });
      }
    });
  });
}

export async function extractThumbnail(
  filePath: string,
  timeSec: number
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const ffmpeg = getFfmpegPath();
    const args = [
      '-ss',
      timeSec.toFixed(2),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black',
      '-q:v',
      '4',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1',
    ];

    const proc = spawn(ffmpeg, args, { windowsHide: true });
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    proc.on('error', () => resolve(undefined));
    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        const buf = Buffer.concat(chunks);
        resolve(`data:image/jpeg;base64,${buf.toString('base64')}`);
      } else {
        resolve(undefined);
      }
    });
  });
}

export async function transcodeToPlayableMp4(
  inputPath: string,
  cacheDir: string,
  durationSec: number,
  onProgress: (percent: number) => void,
  options?: ConvertVideoOptions
): Promise<string> {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const targetCodec = options?.targetCodec || 'h264';
  const quality = options?.quality || 'high';
  const resolution = options?.resolution || 'original';
  const audioCodec = options?.audioCodec || 'aac_320';
  const audioSampleRate = options?.audioSampleRate || 48000;
  const audioChannels = options?.audioChannels || '2';
  const audioNormalize = !!options?.audioNormalize;

  const optSig = `${targetCodec}_${quality}_${resolution}_${audioCodec}_${audioSampleRate}_${audioChannels}ch_${
    audioNormalize ? 'norm' : 'raw'
  }`;
  const hash = crypto
    .createHash('md5')
    .update(inputPath + fs.statSync(inputPath).mtimeMs + optSig)
    .digest('hex')
    .slice(0, 10);
  const baseName = path
    .basename(inputPath, path.extname(inputPath))
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  const needsMovContainer =
    targetCodec === 'prores' || audioCodec === 'pcm_s16le' || audioCodec === 'pcm_s24le';
  const extOut = needsMovContainer ? 'mov' : 'mp4';
  const outputPath = path.join(cacheDir, `${baseName}_${hash}_${optSig}.${extOut}`);

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
    onProgress(100);
    return outputPath;
  }

  const hwProfile = await detectHardwareProfile();

  const buildVideoEncoderArgs = (useHardwareGpu: boolean): string[] => {
    const crf = quality === 'high' ? '18' : quality === 'medium' ? '22' : '26';
    if (targetCodec === 'copy_video') {
      return ['-c:v', 'copy'];
    }
    if (targetCodec === 'prores') {
      return [
        '-c:v',
        'prores_ks',
        '-profile:v',
        quality === 'high' ? '2' : '0',
        '-pix_fmt',
        'yuv422p10le',
      ];
    }
    if (targetCodec === 'hevc') {
      if (useHardwareGpu && hwProfile.preferredHevcEncoder !== 'libx265') {
        const enc = hwProfile.preferredHevcEncoder;
        if (enc === 'hevc_nvenc') {
          return ['-c:v', 'hevc_nvenc', '-preset', 'p4', '-cq', crf, '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'];
        }
        if (enc === 'hevc_amf') {
          return ['-c:v', 'hevc_amf', '-quality', 'balanced', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'];
        }
        if (enc === 'hevc_qsv') {
          return ['-c:v', 'hevc_qsv', '-global_quality', crf, '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'];
        }
      }
      return [
        '-c:v',
        'libx265',
        '-preset',
        'fast',
        '-crf',
        crf,
        '-pix_fmt',
        'yuv420p',
        '-tag:v',
        'hvc1',
      ];
    }

    const gop = targetCodec === 'h264_intra' ? '1' : '15';
    if (useHardwareGpu && hwProfile.preferredH264Encoder !== 'libx264') {
      const enc = hwProfile.preferredH264Encoder;
      if (enc === 'h264_nvenc') {
        return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', crf, '-pix_fmt', 'yuv420p', '-g', gop];
      }
      if (enc === 'h264_amf') {
        return ['-c:v', 'h264_amf', '-quality', 'balanced', '-pix_fmt', 'yuv420p', '-g', gop];
      }
      if (enc === 'h264_qsv') {
        return ['-c:v', 'h264_qsv', '-global_quality', crf, '-pix_fmt', 'yuv420p', '-g', gop];
      }
    }

    return [
      '-c:v',
      'libx264',
      '-preset',
      targetCodec === 'h264_intra' ? 'superfast' : 'veryfast',
      '-crf',
      crf,
      '-pix_fmt',
      'yuv420p',
      '-g',
      gop,
    ];
  };

  const runFfmpegTranscode = (useHardwareGpu: boolean): Promise<string> =>
    new Promise((resolve, reject) => {
      const ffmpeg = getFfmpegPath();
      const vfArgs: string[] = [];

      if (targetCodec !== 'copy_video') {
        if (resolution === '1080p') {
          vfArgs.push('-vf', 'scale=-2:1080');
        } else if (resolution === '720p') {
          vfArgs.push('-vf', 'scale=-2:720');
        }
      }

      const videoArgs = buildVideoEncoderArgs(useHardwareGpu);

      // Build Audio Conversion Arguments
      let audioArgs: string[] = [];
      if (audioCodec === 'mute_audio') {
        audioArgs = ['-an'];
      } else if (audioCodec === 'copy_audio' && !audioNormalize) {
        audioArgs = ['-c:a', 'copy'];
      } else {
        if (audioNormalize) {
          audioArgs.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
        }

        if (audioCodec === 'pcm_s16le') {
          audioArgs.push('-c:a', 'pcm_s16le');
        } else if (audioCodec === 'pcm_s24le') {
          audioArgs.push('-c:a', 'pcm_s24le');
        } else if (audioCodec === 'mp3_320') {
          audioArgs.push('-c:a', 'libmp3lame', '-b:a', '320k');
        } else if (audioCodec === 'aac_192') {
          audioArgs.push('-c:a', 'aac', '-b:a', '192k');
        } else {
          // Default: AAC 320 kbps Broadcast Master
          audioArgs.push('-c:a', 'aac', '-b:a', '320k');
        }

        audioArgs.push('-ar', String(audioSampleRate));
        if (audioChannels === '2') {
          audioArgs.push('-ac', '2');
        } else if (audioChannels === '1') {
          audioArgs.push('-ac', '1');
        }
      }

      const containerFlags = extOut === 'mp4' ? ['-movflags', '+faststart'] : [];
      const hwDecodeFlags =
        useHardwareGpu && targetCodec !== 'copy_video' ? ['-hwaccel', 'auto'] : [];

      const args = [
        '-y',
        ...hwDecodeFlags,
        '-i',
        inputPath,
        ...vfArgs,
        ...videoArgs,
        ...audioArgs,
        ...containerFlags,
        '-progress',
        'pipe:1',
        outputPath,
      ];

      const proc = spawn(ffmpeg, args, { windowsHide: true });

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const match = text.match(/out_time_ms=(\d+)/);
        if (match && durationSec > 0) {
          const sec = parseInt(match[1], 10) / 1_000_000;
          const pct = Math.min(99, Math.max(1, Math.round((sec / durationSec) * 100)));
          onProgress(pct);
        }
      });

      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
          onProgress(100);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });

  const canTryHw =
    targetCodec !== 'copy_video' &&
    targetCodec !== 'prores' &&
    (hwProfile.preferredH264Encoder !== 'libx264' || hwProfile.preferredHevcEncoder !== 'libx265');

  if (canTryHw) {
    try {
      return await runFfmpegTranscode(true);
    } catch {
      // Automatic fallback to multi-core CPU if hardware encoder rejects resolution/format
      return await runFfmpegTranscode(false);
    }
  }
  return await runFfmpegTranscode(false);
}

export async function generateDemoClips(targetDir: string): Promise<string[]> {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const ffmpeg = getFfmpegPath();
  const demos = [
    {
      name: '01_Opening_Countdown_1080p50.mp4',
      duration: 18,
      filterVideo: 'testsrc2=size=1920x1080:rate=50',
      freq: 440,
    },
    {
      name: '02_Ponencia_Principal_SMPTE_1080p50.mp4',
      duration: 24,
      filterVideo: 'smptehdbars=size=1920x1080:rate=50',
      freq: 528,
    },
    {
      name: '03_Bumper_Loop_Fondo_1080p50.mp4',
      duration: 15,
      filterVideo: 'mandelbrot=size=1280x720:rate=50,scale=1920:1080',
      freq: 330,
    },
  ];

  const createdPaths: string[] = [];

  for (const demo of demos) {
    const outPath = path.join(targetDir, demo.name);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 5000) {
      createdPaths.push(outPath);
      continue;
    }

    await new Promise<void>((resolve) => {
      const args = [
        '-y',
        '-f',
        'lavfi',
        '-i',
        demo.filterVideo,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${demo.freq}:sample_rate=48000`,
        '-t',
        String(demo.duration),
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '15',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ac',
        '2',
        outPath,
      ];

      const proc = spawn(ffmpeg, args, { windowsHide: true });
      proc.on('close', () => {
        if (fs.existsSync(outPath)) {
          createdPaths.push(outPath);
        }
        resolve();
      });
      proc.on('error', () => resolve());
    });
  }

  return createdPaths;
}
