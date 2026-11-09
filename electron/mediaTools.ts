import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

export interface MediaProbeResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  duration: number;
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

const CHROMIUM_NATIVE_EXTS = new Set(['.mp4', '.webm', '.m4v', '.mov', '.ogg', '.ogv', '.mkv']);

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

export async function probeMediaFile(filePath: string): Promise<MediaProbeResult> {
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
        const audioCodec = (aStream.codec_name || 'none').toLowerCase();
        const audioChannels = parseInt(aStream.channels, 10) || 0;
        const audioSampleRate = parseInt(aStream.sample_rate, 10) || 48000;

        const isNativeCompatible =
          CHROMIUM_NATIVE_VIDEO_CODECS.has(videoCodec) && CHROMIUM_NATIVE_EXTS.has(ext);

        const thumbnailDataUrl = await extractThumbnail(filePath, Math.min(Math.max(duration * 0.15, 0.5), 5));

        resolve({
          filePath,
          fileName,
          fileSize: stat.size,
          duration,
          width,
          height,
          fps,
          videoCodec,
          audioCodec,
          audioChannels,
          audioSampleRate,
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
          container: ext.replace('.', '').toUpperCase(),
          isNativeCompatible: CHROMIUM_NATIVE_EXTS.has(ext),
          exists: true,
        });
      }
    });
  });
}

export async function extractThumbnail(filePath: string, timeSec: number): Promise<string | undefined> {
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
  onProgress: (percent: number) => void
): Promise<string> {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const hash = crypto.createHash('md5').update(inputPath + fs.statSync(inputPath).mtimeMs).digest('hex').slice(0, 10);
  const baseName = path.basename(inputPath, path.extname(inputPath)).replace(/[^a-zA-Z0-9_-]/g, '_');
  const outputPath = path.join(cacheDir, `${baseName}_${hash}_proxy.mp4`);

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
    onProgress(100);
    return outputPath;
  }

  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpegPath();
    // Broadcast proxy: high quality H.264, short GOP (-g 15) for frame-accurate scrubbing in Mitti/PlaybackPro style, AAC 256k stereo
    const args = [
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '15',
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
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
