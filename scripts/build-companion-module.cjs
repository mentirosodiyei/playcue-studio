const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');

async function buildModule() {
  const rootDir = path.join(__dirname, '..');
  const modDir = path.join(rootDir, 'companion-module');
  const distDir = path.join(modDir, 'dist-module');
  const pkgStagingDir = path.join(modDir, 'package');

  fs.mkdirSync(path.join(distDir, 'companion'), { recursive: true });
  fs.mkdirSync(path.join(pkgStagingDir, 'companion'), { recursive: true });

  console.log('Bundling Companion module with esbuild...');
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

  // Also stage inside "package/" for standard Bitfocus Companion .tgz import
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

  // Create .tgz package for Companion GUI "Import module package"
  const tgzPath = path.join(modDir, 'cuepro-studio-1.2.0.tgz');
  try {
    execSync(`tar -czf "${tgzPath}" -C "${modDir}" package`, { stdio: 'inherit' });
    console.log('Created Companion importable package:', tgzPath);
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
        const target = path.join(companionModsDir, 'cuepro-studio-1.2.0');
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
