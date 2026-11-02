import { chmod, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// node-pty's prebuilt macOS spawn-helper can arrive from npm without executable
// permissions. Repair the dependency before development and packaging, not at
// runtime inside a signed/read-only application bundle.
export async function preparePty() {
  if (process.platform === 'win32') return;
  const root = fileURLToPath(new URL('../node_modules/node-pty/', import.meta.url));
  const ideRoot = fileURLToPath(new URL('../ide/', import.meta.url));
  const targets = [
    path.join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    path.join(root, 'build/Release/spawn-helper'),
    path.join(ideRoot, 'node_modules/node-pty/prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    path.join(ideRoot, 'lib/prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    path.join(ideRoot, 'node_modules/node/bin/node'),
    path.join(ideRoot, 'lib/backend/native/rg'),
    path.join(ideRoot, 'lib/backend/macos-trash'),
  ];
  for (const file of targets) {
    try { await access(file); } catch { continue; }
    await chmod(file, 0o755);
  }
}
await preparePty();
