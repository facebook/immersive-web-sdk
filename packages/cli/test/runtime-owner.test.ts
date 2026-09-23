/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { createServer, type Socket } from 'net';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  acquireRuntimeOwner,
  probeRuntimeOwner,
  runtimeOwnerEndpoint,
  inspectRuntimeOwner,
  stopRuntimeOwner,
  type RuntimeOwnerLease,
} from '../src/runtime-owner.js';
const roots: string[] = [];
const leases: RuntimeOwnerLease[] = [];
async function root() {
  const dir = await mkdtemp(path.join(tmpdir(), 'iw-owner-test-'));
  roots.push(dir);
  return dir;
}
afterEach(async () => {
  for (const lease of leases.splice(0)) {
    await lease.release();
  }
  for (const dir of roots.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});
describe('workspace runtime ownership', () => {
  test('one winner under concurrent acquisition, including same-process calls', async () => {
    const workspace = await root();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        acquireRuntimeOwner(workspace, `session-${i}`),
      ),
    );
    const winners = results.filter(
      (result): result is PromiseFulfilledResult<RuntimeOwnerLease> =>
        result.status === 'fulfilled',
    );
    expect(winners).toHaveLength(1);
    leases.push(winners[0].value);
    expect(await probeRuntimeOwner(runtimeOwnerEndpoint(workspace))).toEqual(
      winners[0].value.identity,
    );
  });
  test('canonical aliases share ownership; another workspace is independent', async () => {
    const workspace = await root();
    const elsewhere = await root();
    const alias = path.join(elsewhere, 'alias');
    await symlink(workspace, alias, 'dir');
    leases.push(await acquireRuntimeOwner(workspace, 'one'));
    await expect(acquireRuntimeOwner(alias, 'two')).rejects.toThrow(
      'already has a dev runtime',
    );
    leases.push(await acquireRuntimeOwner(elsewhere, 'other-project'));
  });
  test('release is idempotent, and old release cannot remove a successor', async () => {
    const workspace = await root();
    const old = await acquireRuntimeOwner(workspace, 'old');
    await Promise.all([old.release(), old.release()]);
    const next = await acquireRuntimeOwner(workspace, 'next');
    leases.push(next);
    await old.release();
    expect((await probeRuntimeOwner(next.identity.endpoint))?.sessionId).toBe(
      'next',
    );
  });
  test('kernel absence recovers a stale record even when its PID has been reused', async () => {
    const workspace = await root();
    const old = await acquireRuntimeOwner(workspace, 'old');
    await old.release();
    await writeFile(
      path.join(workspace, '.iwsdk/runtime/owner.json'),
      JSON.stringify({
        ...old.identity,
        processStart: 'previous-process-birth',
      }),
    );
    const replacement = await acquireRuntimeOwner(workspace, 'new');
    leases.push(replacement);
    expect(replacement.identity.sessionId).toBe('new');
  });
  test.skipIf(process.platform === 'win32')(
    'does not replace a live owner whose socket file was deleted',
    async () => {
      const workspace = await root();
      const owner = await acquireRuntimeOwner(workspace, 'owner');
      leases.push(owner);
      await rm(owner.identity.endpoint);
      await expect(acquireRuntimeOwner(workspace, 'duplicate')).rejects.toThrow(
        'may still be alive',
      );
    },
  );
  test('an unresponsive live endpoint is unknown, never treated as absent or age-stolen', async () => {
    const workspace = await root();
    const old = await acquireRuntimeOwner(workspace, 'old');
    await old.release();
    const connections = new Set<Socket>();
    const server = createServer((socket) => {
      connections.add(socket);
      socket.on('close', () => connections.delete(socket));
    });
    await new Promise<void>((resolve) =>
      server.listen(old.identity.endpoint, resolve),
    );
    try {
      expect(await inspectRuntimeOwner(old.identity.endpoint)).toMatchObject({
        state: 'unknown',
      });
      await expect(acquireRuntimeOwner(workspace, 'new')).rejects.toThrow(
        'ownership is unknown',
      );
    } finally {
      for (const socket of connections) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('requires the persisted owner identity before signalling', async () => {
    const workspace = await root();
    const lease = await acquireRuntimeOwner(workspace, 'recorded-owner');
    leases.push(lease);
    await writeFile(
      path.join(workspace, '.iwsdk/runtime/owner.json'),
      `${JSON.stringify({
        ...lease.identity,
        sessionId: 'forged-owner',
      })}\n`,
    );

    await expect(
      stopRuntimeOwner(lease.identity, async () => false, {
        graceMs: 0,
        signalMs: 0,
      }),
    ).rejects.toMatchObject({ code: 'runtime_owner_unverified' });
  });

  test('allows a verified owner to clean up even when shutdown acknowledgement is lost', async () => {
    const workspace = await root();
    const lease = await acquireRuntimeOwner(workspace, 'lost-ack-owner');
    leases.push(lease);
    const startedAt = Date.now();

    await expect(
      stopRuntimeOwner(lease.identity, async () => false, {
        graceMs: 75,
        signalMs: 0,
      }),
    ).rejects.toThrow('process identity cannot be safely signalled');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(60);
  });
});

// Kernel liveness, crash recovery, and cross-process contention are exercised
// against the built module too, not just an in-process mock of IPC.
test.each([false, true])(
  'recovers a crashed owner once under cross-process contention (death before metadata: %s)',
  async (beforeMetadata) => {
    const { spawn } = await import('child_process');
    const workspace = await root();
    const moduleUrl = new URL('../dist/runtime-owner.js', import.meta.url).href;
    const code = `import { acquireRuntimeOwner, runtimeOwnerEndpoint } from ${JSON.stringify(moduleUrl)};
    import { createServer } from 'node:net'; import { mkdir } from 'node:fs/promises'; import path from 'node:path';
    try { if (${beforeMetadata} && process.argv[2] === 'crashed') {
      const endpoint = runtimeOwnerEndpoint(process.argv[1]);
      if (process.platform !== 'win32') await mkdir(path.dirname(endpoint), { recursive: true, mode: 0o700 });
      await new Promise(resolve => createServer().listen(endpoint, resolve));
    } else { await acquireRuntimeOwner(process.argv[1], process.argv[2]); }
      process.send({ acquired: true }); setInterval(() => {}, 60000);
    } catch (error) { process.send({ acquired: false, message: String(error) }); process.exit(0); }`;
    const children: import('child_process').ChildProcess[] = [];
    const start = (name: string) => {
      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', code, workspace, name],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      children.push(child);
      return new Promise<{
        child: import('child_process').ChildProcess;
        acquired: boolean;
      }>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Owner child timed out')),
          10000,
        );
        child.once('message', (message: any) => {
          clearTimeout(timer);
          resolve({ child, acquired: message.acquired });
        });
        child.once('error', reject);
      });
    };
    try {
      const first = await start('crashed');
      expect(first.acquired).toBe(true);
      const exited = new Promise<void>((resolve) =>
        first.child.once('exit', () => resolve()),
      );
      first.child.kill('SIGKILL');
      await exited;
      const contenders = await Promise.all(
        Array.from({ length: 8 }, (_, n) => start(`replacement-${n}`)),
      );
      expect(contenders.filter((result) => result.acquired)).toHaveLength(1);
      expect(
        (await probeRuntimeOwner(runtimeOwnerEndpoint(workspace)))?.sessionId,
      ).toMatch(/^replacement-/);
    } finally {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = new Promise<void>((resolve) =>
            child.once('exit', () => resolve()),
          );
          child.kill('SIGTERM');
          await exited;
        }
      }
      // Remove the known dead test owner's Unix socket after all children exit.
      if (process.platform !== 'win32') {
        await rm(runtimeOwnerEndpoint(workspace), { force: true });
      }
    }
  },
  15000,
);

test.each(['cooperative', 'refused', 'unresponsive'] as const)(
  'stops a positively identified %s owner without mistaking a timeout for exit',
  async (mode) => {
    const { spawn } = await import('child_process');
    const { once } = await import('events');
    const workspace = await root();
    const moduleUrl = new URL('../dist/runtime-owner.js', import.meta.url).href;
    const code = `import { acquireRuntimeOwner } from ${JSON.stringify(moduleUrl)};
    const lease = await acquireRuntimeOwner(process.argv[1], 'stop-child');
    process.on('SIGTERM', () => {});
    process.on('message', async () => {
      if (${JSON.stringify(mode)} === 'cooperative') { await lease.release(); process.exit(0); }
      if (${JSON.stringify(mode)} === 'unresponsive') { process.send('blocked'); while (true) {} }
    });
    process.send(lease.identity); setInterval(() => {}, 60000);`;
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', code, workspace],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    );
    const exited = once(child, 'exit');
    try {
      const [identity] = await once(child, 'message');
      await stopRuntimeOwner(
        identity,
        async () => {
          if (mode === 'refused') {
            return false;
          }
          const blocked =
            mode === 'unresponsive' ? once(child, 'message') : null;
          child.send('shutdown');
          if (blocked) {
            await blocked;
          }
          return true;
        },
        { graceMs: 100, signalMs: 100 },
      );
      await exited;
      expect(await inspectRuntimeOwner(identity.endpoint)).toMatchObject({
        state: 'absent',
      });
      expect(mode === 'cooperative' ? child.exitCode : child.signalCode).toBe(
        mode === 'cooperative' ? 0 : 'SIGKILL',
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      await exited;
      if (process.platform !== 'win32') {
        await rm(runtimeOwnerEndpoint(workspace), { force: true });
      }
    }
  },
  15000,
);

test('shutdown never signals a replacement that acquired the same endpoint', async () => {
  const workspace = await root();
  const first = await acquireRuntimeOwner(workspace, 'first');
  await stopRuntimeOwner(
    first.identity,
    async () => {
      await first.release();
      leases.push(await acquireRuntimeOwner(workspace, 'replacement'));
      return true;
    },
    { graceMs: 0 },
  );
  expect((await probeRuntimeOwner(first.identity.endpoint))?.sessionId).toBe(
    'replacement',
  );
});

test('refuses PID signalling when process-birth identity is unavailable', async () => {
  const { spawn } = await import('child_process');
  const { once } = await import('events');
  const workspace = await root();
  const moduleUrl = new URL('../dist/runtime-owner.js', import.meta.url).href;
  const code = `import { acquireRuntimeOwner } from ${JSON.stringify(moduleUrl)};
    const lease = await acquireRuntimeOwner(process.argv[1], 'unverified-child');
    process.on('SIGTERM', () => {});
    process.send(lease.identity); setInterval(() => {}, 60000);`;
  const child = spawn(
    process.execPath,
    ['--input-type=module', '-e', code, workspace],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  const exited = once(child, 'exit');
  try {
    const [identity] = await once(child, 'message');
    await expect(
      stopRuntimeOwner(
        { ...(identity as RuntimeOwnerLease['identity']), processStart: null },
        async () => false,
        { graceMs: 0, signalMs: 0 },
      ),
    ).rejects.toMatchObject({ code: 'runtime_owner_unverified' });
    expect(child.exitCode).toBeNull();
    expect(child.signalCode).toBeNull();
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await exited;
    if (process.platform !== 'win32') {
      await rm(runtimeOwnerEndpoint(workspace), { force: true });
    }
  }
}, 15000);
