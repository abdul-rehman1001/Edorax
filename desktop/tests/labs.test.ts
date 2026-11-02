import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containerOptions,
  workspaceName,
  validateContent,
  LabRuntime,
} from '../src/labs/runtime';

test('lab isolation uses a volume, no network, bounded resources and no privileges', () => {
  const config = containerOptions();
  assert.equal(config.HostConfig.NetworkMode, 'none');
  assert.equal(config.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(config.HostConfig.CapDrop, ['ALL']);
  assert.deepEqual(config.HostConfig.SecurityOpt, ['no-new-privileges:true']);
  assert.equal(config.HostConfig.Mounts.length, 1);
  assert.equal(config.HostConfig.Mounts[0].Type, 'volume');
  assert.equal(config.HostConfig.Mounts[0].Target, '/workspace');
  assert.equal(config.HostConfig.Memory, 256 * 1024 * 1024);
  assert.equal(config.HostConfig.PidsLimit, 64);
});
test('editor validates types, size and binary content at the main-process boundary', () => {
  for (const value of [null, {}, 42, 'x'.repeat(65537), '\0'])
    assert.throws(() => validateContent(value));
  validateContent('echo "Hello, Edorax!"\n');
});
test('reset refuses resources without ownership labels', async () => {
  let removed = false;
  const fake = {
    getVolume: () => ({
      inspect: async () => ({ Labels: {} }),
      remove: async () => {
        removed = true;
      },
    }),
  };
  const runtime = new LabRuntime(fake as any);
  await assert.rejects(runtime.reset(), /not owned/);
  assert.equal(removed, false);
});

test('workspace identity separates both learners and course exercises', () => {
  assert.notEqual(
    workspaceName('alice:exercise-a'),
    workspaceName('alice:exercise-b'),
  );
  assert.notEqual(
    workspaceName('alice:exercise-a'),
    workspaceName('bob:exercise-a'),
  );
  assert.equal(
    workspaceName('alice:exercise-a'),
    workspaceName('alice:exercise-a'),
  );
});

test('workspace account identity requires a live authenticated session', async () => {
  const { createPreviewClient } = await import('../src/api/preview');
  let expired = false;
  const client = createPreviewClient('http://localhost:4000', async (url) => {
    if (String(url).endsWith('/exchange'))
      return Response.json({
        success: true,
        data: {
          user: { id: 'learner-one' },
          session: { token: 'private-token' },
        },
      });
    if (expired)
      return Response.json(
        { success: false, message: 'Expired' },
        { status: 401 },
      );
    return Response.json({ success: true, data: {} });
  });
  assert.equal(client.localLabUser(), null);
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  assert.equal(client.localLabUser(), 'learner-one');
  expired = true;
  await client.courseDetail('systems');
  assert.equal(client.localLabUser(), null);
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  await client.signOut();
  assert.equal(client.localLabUser(), null);
});

test('desktop token-only exchange resolves workspace identity through auth/me', async () => {
  const { createPreviewClient } = await import('../src/api/preview');
  const client = createPreviewClient(
    'http://localhost:4000',
    async (url, init) => {
      if (String(url).endsWith('/exchange'))
        return Response.json({
          success: true,
          data: { session: { token: 'desktop-token' } },
        });
      assert.equal(String(url).endsWith('/auth/me'), true);
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer desktop-token',
      );
      return Response.json({
        success: true,
        data: { user: { id: 'learner-real-shape' } },
      });
    },
  );
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  assert.equal(await client.resolveLocalLabUser(), 'learner-real-shape');
});

test('Docker status distinguishes an unavailable engine from a stopped workspace', async () => {
  const unavailable = new LabRuntime({
    ping: async () => {
      throw new Error('connect ENOENT /private/docker.sock');
    },
  } as any);
  const offline = await unavailable.status();
  assert.equal(offline.available, false);
  assert.match(offline.message, /Docker is unavailable.*Open Docker Desktop/);
  assert.doesNotMatch(offline.message, /ENOENT|private/);
  const fake = {
    ping: async () => 'OK',
    getContainer: () => ({
      inspect: async () => ({
        Config: {
          Labels: { 'com.edorax.lab': workspaceName('integration-test') },
        },
        State: { Running: false },
      }),
    }),
  };
  const stopped = new LabRuntime(fake as any);
  assert.equal((await stopped.status()).available, true);
  assert.match((await stopped.status()).message, /Docker lab stopped/);
  await assert.rejects(
    stopped.openTerminal('stopped-session'),
    /Docker lab stopped.*Start terminal/,
  );
});
