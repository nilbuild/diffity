// Builds the diffity-mcp binary and copies it to src-tauri/binaries/diffity-mcp-<target-triple>
// so Tauri can bundle it as an `externalBin` sidecar. `--target universal-apple-darwin` builds
// both macOS architectures and lipos them into diffity-mcp-universal-apple-darwin.
import { execFileSync } from 'node:child_process';
import { copyFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '../../..');
const release = process.env.TAURI_ENV_DEBUG === 'false' || process.argv.includes('--release');

function hostTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const line = out.split('\n').find((l) => l.startsWith('host:'));
  if (!line) {
    throw new Error('could not determine rustc host triple');
  }
  return line.slice('host:'.length).trim();
}

const UNIVERSAL = 'universal-apple-darwin';
const UNIVERSAL_PARTS = ['aarch64-apple-darwin', 'x86_64-apple-darwin'];

const host = hostTriple();
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || host;
const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(workspace, 'target');
const destDir = join(here, '../src-tauri/binaries');
mkdirSync(destDir, { recursive: true });

function build(target) {
  const cross = target !== host;
  const args = ['build', '-p', 'diffity-mcp'];
  if (cross) {
    args.push('--target', target);
  }
  if (release) {
    args.push('--release');
  }
  execFileSync('cargo', args, { cwd: workspace, stdio: 'inherit' });
  const ext = target.includes('windows') ? '.exe' : '';
  const built = join(targetDir, ...(cross ? [target] : []), release ? 'release' : 'debug', `diffity-mcp${ext}`);
  const dest = join(destDir, `diffity-mcp-${target}${ext}`);
  copyFileSync(built, dest);
  chmodSync(dest, 0o755);
  console.log(`diffity-mcp sidecar -> ${dest}`);
  return dest;
}

// A universal build compiles the app once per architecture (each needs its own sidecar for
// tauri-build) and then bundles `diffity-mcp-universal-apple-darwin`, the lipo of both.
function main() {
  if (triple !== UNIVERSAL) {
    build(triple);
    return;
  }
  const parts = UNIVERSAL_PARTS.map(build);
  const dest = join(destDir, `diffity-mcp-${UNIVERSAL}`);
  execFileSync('lipo', ['-create', '-output', dest, ...parts], { stdio: 'inherit' });
  chmodSync(dest, 0o755);
  console.log(`diffity-mcp sidecar -> ${dest}`);
}

main();
