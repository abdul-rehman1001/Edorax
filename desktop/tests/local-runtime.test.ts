import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as pty from 'node-pty';
import { LocalRuntime } from '../src/labs/local-runtime';
import { validateProjectPath } from '../src/labs/project-files';

test('project paths reject escapes, absolute paths and invalid entries', () => {
  for (const value of [
    '',
    '../outside',
    '/tmp/a',
    'src/../a',
    'src//a',
    'src/a\0b',
    'C:\\Windows\\a',
  ])
    assert.throws(() => validateProjectPath(value));
  validateProjectPath('src/my module.js');
});
test('local project supports folders/files, rejects symlink escapes and never bulk resets', async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'edorax-local-')),
  );
  const runtime = new LocalRuntime(root, pty, () => {});
  try {
    await runtime.createEntry('src', 'directory');
    await runtime.createEntry('src/math.js', 'file');
    await runtime.saveProjectFile('src/math.js', 'module.exports = 42;');
    assert.equal(
      await runtime.readProjectFile('src/math.js'),
      'module.exports = 42;',
    );
    assert.deepEqual(
      (await runtime.listFiles()).map((file) => file.path).sort(),
      ['src', 'src/math.js'],
    );
    await fs.symlink(os.tmpdir(), path.join(root, 'outside'));
    await assert.rejects(
      runtime.saveProjectFile('outside/escape.js', 'bad'),
      /Symbolic/,
    );
    await assert.rejects(
      runtime.readProjectFile('../outside'),
      /relative project path/,
    );
    await assert.rejects(runtime.reset(), /never bulk-deleted/);
    assert.equal(
      await runtime.readProjectFile('src/math.js'),
      'module.exports = 42;',
    );
  } finally {
    runtime.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
});
test(
  'local PTY runs in selected folder and accepts input/resize without Docker or auth',
  { timeout: 15_000 },
  async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'edorax-pty-')),
    );
    let output = '';
    const runtime = new LocalRuntime(root, pty, (event) => {
      output += event.data;
    });
    try {
      await runtime.start();
      await runtime.openTerminal('local-test');
      await runtime.resizeTerminal('local-test', 100, 30);
      await runtime.terminalInput(
        'local-test',
        "printf 'local-%s\\n' verified\npwd\n",
      );
      for (
        let attempt = 0;
        attempt < 100 &&
        (!output.includes('local-verified') || !output.includes(root));
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      assert.match(output, /local-verified/);
      assert.ok(output.includes(root));
      await runtime.stop();
      assert.equal((await runtime.status()).running, false);
    } finally {
      runtime.dispose();
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);
