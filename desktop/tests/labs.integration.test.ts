import test from 'node:test';
import assert from 'node:assert/strict';
import { containerOptions, LabRuntime, localDocker } from '../src/labs/runtime';

test(
  'real Docker: start, shared files, terminal, isolation, stop/resume and reset',
  { timeout: 180_000 },
  async (context) => {
    const docker = localDocker();
    const config = containerOptions();
    // Never delete a learner's existing workspace during an integration test.
    const volumes = await docker.listVolumes();
    const containers = await docker.listContainers({ all: true });
    if (
      volumes.Volumes?.some(
        (v) => v.Name === config.HostConfig.Mounts[0].Source,
      ) ||
      containers.some((c) => c.Names.includes('/' + config.name))
    ) {
      context.skip('Existing Edorax lab found; preserving learner data.');
      return;
    }
    let terminalOutput = '';
    const runtime = new LabRuntime(docker, ({ data }) => {
      terminalOutput += data;
    });
    try {
      await runtime.start();
      assert.equal((await runtime.status()).running, true);
      assert.match(await runtime.readFile(), /course exercise/);
      assert.equal(
        JSON.parse(await runtime.readProjectFile('package.json')).private,
        true,
      );
      await runtime.createEntry('src/utils', 'directory');
      await runtime.createEntry('src/utils/math.js', 'file');
      await runtime.saveProjectFile(
        'src/utils/math.js',
        'module.exports = 42;',
      );
      assert.equal(
        await runtime.readProjectFile('src/utils/math.js'),
        'module.exports = 42;',
      );
      assert.ok(
        (await runtime.listFiles()).some(
          (entry) => entry.path === 'src/utils/math.js',
        ),
      );
      assert.throws(
        () => runtime.readProjectFile('../etc/passwd'),
        /relative project path/,
      );

      await runtime.saveFile('console.log(6 * 7);\n');
      await runtime.openTerminal('integration');
      await runtime.resizeTerminal('integration', 100, 30);
      await runtime.terminalInput('integration', 'node exercise.js\n');
      for (let tries = 0; tries < 50 && !terminalOutput.includes('42'); tries++)
        await new Promise((r) => setTimeout(r, 100));
      assert.match(terminalOutput, /42/);
      // Verify terminal and editor access the same actual file.
      await runtime.terminalInput(
        'integration',
        "printf '// changed\\n' > exercise.js\n",
      );
      let value = '';
      for (let tries = 0; tries < 50; tries++) {
        value = await runtime.readFile();
        if (value === '// changed\n') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(value, '// changed\n');
      await runtime.closeTerminal('integration');
      await runtime.stop();
      assert.equal((await runtime.status()).running, false);
      await runtime.start();
      assert.equal(await runtime.readFile(), '// changed\n');
      await runtime.reset();
      assert.equal((await runtime.status()).running, false);
    } finally {
      runtime.dispose();
      await runtime.reset();
    }
  },
);
