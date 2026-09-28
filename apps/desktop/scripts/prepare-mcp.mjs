// Builds the diffity-mcp binary and copies it to src-tauri/binaries/diffity-mcp-<target-triple>
// so Tauri can bundle it as an `externalBin` sidecar.
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

const host = hostTriple();
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || host;
const cross = triple !== host;
const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(workspace, 'target');
const args = ['build', '-p', 'diffity-mcp'];
if (cross) {
  args.push('--target', triple);
}
if (release) {
  args.push('--release');
}
execFileSync('cargo', args, { cwd: workspace, stdio: 'inherit' });

const ext = triple.includes('windows') ? '.exe' : '';
const built = join(targetDir, ...(cross ? [triple] : []), release ? 'release' : 'debug', `diffity-mcp${ext}`);
const destDir = join(here, '../src-tauri/binaries');
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, `diffity-mcp-${triple}${ext}`);
copyFileSync(built, dest);
chmodSync(dest, 0o755);
console.log(`diffity-mcp sidecar -> ${dest}`);
