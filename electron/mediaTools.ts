import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

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

  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpegPath();
    const crf = quality === 'high' ? '18' : quality === 'medium' ? '22' : '26';
    const vfArgs: string[] = [];

    if (targetCodec !== 'copy_video') {
      if (resolution === '1080p') {
        vfArgs.push('-vf', 'scale=-2:1080');
      } else if (resolution === '720p') {
        vfArgs.push('-vf', 'scale=-2:720');
      }
    }

    let videoArgs: string[] = [];
    if (targetCodec === 'copy_video') {
      videoArgs = ['-c:v', 'copy'];
    } else if (targetCodec === 'prores') {
      videoArgs = [
        '-c:v',
        'prores_ks',
        '-profile:v',
        quality === 'high' ? '2' : '0',
        '-pix_fmt',
        'yuv422p10le',
      ];
    } else if (targetCodec === 'hevc') {
      videoArgs = [
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
    } else if (targetCodec === 'h264_intra') {
      videoArgs = [
        '-c:v',
        'libx264',
        '-preset',
        'superfast',
        '-crf',
        crf,
        '-pix_fmt',
        'yuv420p',
        '-g',
        '1',
      ];
    } else {
      videoArgs = [
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        crf,
        '-pix_fmt',
        'yuv420p',
        '-g',
        '15',
      ];
    }

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

    const args = [
      '-y',
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
      if (code === 0 && fs.existsSync(outputPath)) {
        onProgress(100);
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
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
