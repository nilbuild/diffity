// Regenerates every derived icon in src-tauri/icons from the Icon Composer
// document src-tauri/icons/diffity-logo.icon (the single source of truth):
//
// - Assets.car: compiled by Apple's actool. Listed in bundle.icon, so the Tauri
//   bundler copies it to Contents/Resources and sets CFBundleIconName from it.
//   (Tauri can compile a `.icon` itself, but its in-process actool call crashes:
//   https://github.com/tauri-apps/tauri/issues/15315.)
// - icon.icns + PNGs + icon.ico: rendered by Icon Composer's ictool, then run
//   through `tauri icon`. icon.icns is CFBundleIconFile (pre-Assets.car
//   fallback) and the `tauri dev` Dock icon.
//
// Requires Xcode 26+ (actool 26 and Icon Composer's `ictool`).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(appDir, 'src-tauri', 'icons');
const iconDocument = join(iconsDir, 'diffity-logo.icon');

const developerDir = execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim();
const ictool = join(
  developerDir,
  '..',
  'Applications',
  'Icon Composer.app',
  'Contents',
  'Executables',
  'ictool',
);

// macOS icon grid: the icon shape is 824pt inside a 1024pt canvas.
const canvasSize = 1024;
const shapeSize = 824;

// Keep in sync with bundle.macOS.minimumSystemVersion (Tauri's default).
const minimumSystemVersion = '10.13';

const workDir = mkdtempSync(join(tmpdir(), 'diffity-icons-'));

try {
  const shapePng = join(workDir, 'shape.png');
  const sourceSvg = join(workDir, 'app-icon.svg');
  const tauriOut = join(workDir, 'tauri');
  const catalogOut = join(workDir, 'catalog');
  mkdirSync(catalogOut);

  execFileSync('xcrun', [
    'actool', iconDocument,
    '--compile', catalogOut,
    '--output-format', 'human-readable-text',
    '--notices',
    '--warnings',
    '--output-partial-info-plist', join(catalogOut, 'partial-info.plist'),
    '--app-icon', 'diffity-logo',
    '--include-all-app-icons',
    '--enable-on-demand-resources', 'NO',
    '--development-region', 'en',
    '--target-device', 'mac',
    '--platform', 'macosx',
    '--minimum-deployment-target', minimumSystemVersion,
  ], { stdio: 'inherit' });
  copyFileSync(join(catalogOut, 'Assets.car'), join(iconsDir, 'Assets.car'));

  execFileSync(ictool, [
    iconDocument,
    '--export-image',
    '--output-file', shapePng,
    '--platform', 'macOS',
    '--rendition', 'Default',
    '--width', String(shapeSize),
    '--height', String(shapeSize),
    '--scale', '1',
  ], { stdio: 'inherit' });

  // Center the shape on the transparent canvas. `tauri icon` rasterizes SVG
  // sources, so wrapping the PNG in an SVG keeps this dependency-free.
  const inset = (canvasSize - shapeSize) / 2;
  const shapeData = readFileSync(shapePng).toString('base64');
  writeFileSync(
    sourceSvg,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">` +
      `<image x="${inset}" y="${inset}" width="${shapeSize}" height="${shapeSize}" href="data:image/png;base64,${shapeData}"/>` +
      '</svg>',
  );

  execFileSync('pnpm', ['tauri', 'icon', sourceSvg, '--output', tauriOut], {
    cwd: appDir,
    stdio: 'inherit',
  });

  for (const file of [
    '32x32.png',
    '64x64.png',
    '128x128.png',
    '128x128@2x.png',
    'icon.png',
    'icon.icns',
    'icon.ico',
  ]) {
    copyFileSync(join(tauriOut, file), join(iconsDir, file));
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
