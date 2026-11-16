const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const esbuild = require('esbuild');
const ffmpegPath = require('ffmpeg-static');

function ensureDemoMediaInBuild(rootDir) {
  const demoDir = path.join(rootDir, 'build', 'demo_media');
  fs.mkdirSync(demoDir, { recursive: true });

  const specs = [
    {
      name: '01_Opening_Countdown_1080p50.mp4',
      args: [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=1920x1080:rate=50:duration=12',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000:duration=12',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        '-b:v',
        '4500k',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
      ],
    },
    {
      name: '02_SMPTE_HD_Bars_Tone_1080p50.mp4',
      args: [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'smptehdbars=size=1920x1080:rate=50:duration=15',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=528:sample_rate=48000:duration=15',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        '-b:v',
        '4000k',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
      ],
    },
    {
      name: '03_Stage_Motion_Loop_1080p50.mp4',
      args: [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'mandelbrot=size=1280x720:rate=30,scale=1920:1080',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=330:sample_rate=48000:duration=10',
        '-t',
        '10',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        '-b:v',
        '4500k',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
      ],
    },
  ];

  for (const s of specs) {
    const outPath = path.join(demoDir, s.name);
    if (!fs.existsSync(outPath) && ffmpegPath) {
      console.log(`Generating bundled demo clip: ${s.name}...`);
      execFileSync(ffmpegPath, [...s.args, outPath], { stdio: 'ignore' });
    }
  }
}

async function buildModule() {
  const rootDir = path.join(__dirname, '..');
  ensureDemoMediaInBuild(rootDir);

  const modDir = path.join(rootDir, 'companion-module');
  const distDir = path.join(modDir, 'dist-module');
  const releaseDir = path.join(rootDir, 'release');
  const releaseModDir = path.join(releaseDir, 'companion-module-playcue-studio');
  const pkgStagingDir = path.join(modDir, 'package');

  const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const version = pkgJson.version || '1.4.0';

  fs.mkdirSync(path.join(distDir, 'companion'), { recursive: true });
  fs.mkdirSync(path.join(pkgStagingDir, 'companion'), { recursive: true });
  fs.mkdirSync(path.join(releaseModDir, 'companion'), { recursive: true });

  console.log(`Bundling Companion module v${version} with esbuild...`);
  await esbuild.build({
    entryPoints: [path.join(modDir, 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(distDir, 'main.js'),
    logLevel: 'info',
  });

  // Copy metadata files into dist-module
  fs.copyFileSync(path.join(modDir, 'package.json'), path.join(distDir, 'package.json'));
  fs.copyFileSync(
    path.join(modDir, 'companion', 'manifest.json'),
    path.join(distDir, 'companion', 'manifest.json')
  );
  fs.copyFileSync(
    path.join(modDir, 'companion', 'HELP.md'),
    path.join(distDir, 'companion', 'HELP.md')
  );

  // Copy unpacked module into release/companion-module-playcue-studio/
  fs.copyFileSync(path.join(distDir, 'main.js'), path.join(releaseModDir, 'main.js'));
  fs.copyFileSync(path.join(distDir, 'package.json'), path.join(releaseModDir, 'package.json'));
  fs.copyFileSync(
    path.join(distDir, 'companion', 'manifest.json'),
    path.join(releaseModDir, 'companion', 'manifest.json')
  );
  fs.copyFileSync(
    path.join(distDir, 'companion', 'HELP.md'),
    path.join(releaseModDir, 'companion', 'HELP.md')
  );

  // Stage inside "package/" for standard Bitfocus Companion .tgz import
  fs.copyFileSync(path.join(distDir, 'main.js'), path.join(pkgStagingDir, 'main.js'));
  fs.copyFileSync(path.join(distDir, 'package.json'), path.join(pkgStagingDir, 'package.json'));
  fs.copyFileSync(
    path.join(distDir, 'companion', 'manifest.json'),
    path.join(pkgStagingDir, 'companion', 'manifest.json')
  );
  fs.copyFileSync(
    path.join(distDir, 'companion', 'HELP.md'),
    path.join(pkgStagingDir, 'companion', 'HELP.md')
  );

  // Clean old .tgz and old .exe versions from release/
  for (const f of fs.readdirSync(releaseDir)) {
    if (
      (f.endsWith('.exe') || f.endsWith('.blockmap') || f.endsWith('.tgz')) &&
      !f.includes(version)
    ) {
      try {
        fs.rmSync(path.join(releaseDir, f), { force: true });
      } catch {}
    }
  }
  for (const f of fs.readdirSync(modDir)) {
    if (f.endsWith('.tgz')) {
      try {
        fs.rmSync(path.join(modDir, f), { force: true });
      } catch {}
    }
  }

  // Create .tgz package directly in release/ for Companion GUI "Import module package"
  const releaseTgzPath = path.join(releaseDir, `companion-module-playcue-studio-${version}.tgz`);
  try {
    execSync(`tar -czf "${releaseTgzPath}" -C "${modDir}" package`, { stdio: 'inherit' });
    console.log('Created Companion importable package in release:', releaseTgzPath);
  } catch (e) {
    console.warn('Could not create .tgz with tar:', e.message);
  }

  // Clean up temporary package/ staging folder
  fs.rmSync(pkgStagingDir, { recursive: true, force: true });

  // Also install into local Bitfocus Companion modules folder if available
  const appData = process.env.APPDATA;
  if (appData) {
    const companionModsDir = path.join(appData, 'companion', 'modules');
    if (fs.existsSync(path.join(appData, 'companion'))) {
      try {
        const target = path.join(companionModsDir, `playcue-studio-${version}`);
        fs.mkdirSync(path.join(target, 'companion'), { recursive: true });
        fs.copyFileSync(path.join(distDir, 'main.js'), path.join(target, 'main.js'));
        fs.copyFileSync(path.join(distDir, 'package.json'), path.join(target, 'package.json'));
        fs.copyFileSync(
          path.join(distDir, 'companion', 'manifest.json'),
          path.join(target, 'companion', 'manifest.json')
        );
        fs.copyFileSync(
          path.join(distDir, 'companion', 'HELP.md'),
          path.join(target, 'companion', 'HELP.md')
        );
        console.log('Installed directly into local Bitfocus Companion:', target);
      } catch {}
    }
  }
}

buildModule().catch((err) => {
  console.error(err);
  process.exit(1);
});
