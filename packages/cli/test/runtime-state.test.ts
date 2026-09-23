/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, readFile, realpath, rm, writeFile } from 'fs/promises';
import { createServer } from 'net';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getRuntimeProcessStart,
  getRuntimeFileLockPath,
  withRuntimeFileLock,
  writeRuntimeJson,
} from '../src/runtime-files.js';
import { acquireRuntimeOwner } from '../src/runtime-owner.js';
import {
  claimLaunchMetadata,
  clearLaunchMetadata,
  findNearestIwsdkAppRoot,
  getLaunchMetadata,
  getRuntimeLaunchFilePath,
  getRuntimeSession,
  getRuntimeSessionFilePath,
  getWorkspaceRuntimeState,
  isIwsdkAppRoot,
  resolveWorkspaceRoot,
  setLaunchMetadata,
} from '../src/runtime-state.js';
import {
  registerRuntimeSession,
  setRuntimeSessionBrowserState,
  unregisterRuntimeSession,
} from './runtime-session-fixture.js';

let tempDir: string;
let appA: string;
let nonIwsdkViteApp: string;

async function createAppFixture(
  root: string,
  packageJson: Record<string, unknown> = {},
) {
  await mkdir(root, { recursive: true });
  const manifest = {
    name: 'fixture-app',
    private: true,
    devDependencies: {
      '@iwsdk/vite-plugin-dev': 'workspace:*',
    },
    ...packageJson,
  };
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(root, 'vite.config.ts'),
    'export default {}\n',
    'utf8',
  );
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'main.ts'), 'export {};\n', 'utf8');
}

beforeEach(async () => {
  tempDir = path.join(
    os.tmpdir(),
    `iwsdk-runtime-state-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  appA = path.join(tempDir, 'apps', 'app-a');
  nonIwsdkViteApp = path.join(tempDir, 'apps', 'plain-vite-app');
  await createAppFixture(appA);
  await createAppFixture(nonIwsdkViteApp, {
    devDependencies: {
      vite: '^7.0.0',
    },
  });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('workspace detection', () => {
  test('detects IWSDK app roots with nearest-parent resolution', async () => {
    expect(isIwsdkAppRoot(appA)).toBe(true);
    expect(findNearestIwsdkAppRoot(path.join(appA, 'src'))).toBe(
      await realpath(appA),
    );
    expect(isIwsdkAppRoot(nonIwsdkViteApp)).toBe(false);
    expect(findNearestIwsdkAppRoot(tempDir)).toBeNull();
  });

  test('accepts a manifest-first IWSDK app without a Vite config', async () => {
    const manifestApp = path.join(tempDir, 'apps', 'manifest-app');
    await createAppFixture(manifestApp);
    await rm(path.join(manifestApp, 'vite.config.ts'));
    await writeFile(
      path.join(manifestApp, 'iwsdk.config.json'),
      '{"version":"iwsdk.project.v1"}\n',
      'utf8',
    );

    expect(isIwsdkAppRoot(manifestApp)).toBe(true);
    expect(findNearestIwsdkAppRoot(path.join(manifestApp, 'src'))).toBe(
      await realpath(manifestApp),
    );
  });

  test('does not treat an unrelated project manifest as an IWSDK app', async () => {
    await writeFile(
      path.join(nonIwsdkViteApp, 'iwsdk.config.json'),
      '{"version":"iwsdk.project.v1"}\n',
      'utf8',
    );
    await rm(path.join(nonIwsdkViteApp, 'vite.config.ts'));

    expect(isIwsdkAppRoot(nonIwsdkViteApp)).toBe(false);
  });

  test('still requires a project or Vite config beside the IWSDK dependency', async () => {
    const packageOnlyApp = path.join(tempDir, 'apps', 'package-only');
    await createAppFixture(packageOnlyApp);
    await rm(path.join(packageOnlyApp, 'vite.config.ts'));

    expect(isIwsdkAppRoot(packageOnlyApp)).toBe(false);
  });
});

describe('project-local runtime state', () => {
  test('IPC verification does not hold the registration file lock', async () => {
    const lease = await acquireRuntimeOwner(appA, 'respond-after-write');
    const identity = lease.identity;
    await lease.release();
    const file = getRuntimeSessionFilePath(appA);
    const snapshot = { ...identity, browser: { lifecycle: { state: 'idle' } } };
    await writeRuntimeJson(file, snapshot);
    const server = createServer((socket) => {
      socket.on('error', () => {});
      void withRuntimeFileLock(file, async () => {
        socket.end(`${JSON.stringify(identity)}\n`);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(identity.endpoint, resolve),
    );
    try {
      expect(await getRuntimeSession(appA)).toMatchObject(snapshot);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  test('removes lifecycle records for reused PIDs and outdated generations', async () => {
    const file = getRuntimeSessionFilePath(appA);
    const record = {
      sessionId: 'old',
      pid: process.pid,
      processStart: 'previous-birth',
      workspaceRoot: await realpath(appA),
      browser: { lifecycle: { state: 'idle' } },
    };
    await writeRuntimeJson(file, record);
    expect(await getRuntimeSession(appA)).toBeNull();
    const owner = await acquireRuntimeOwner(appA, 'new');
    try {
      await writeRuntimeJson(file, {
        ...record,
        processStart: getRuntimeProcessStart(process.pid),
      });
      expect(await getRuntimeSession(appA)).toBeNull();
    } finally {
      await owner.release();
    }
  });
  test('a missing endpoint with matching process birth fails closed with remediation', async () => {
    await writeRuntimeJson(getRuntimeSessionFilePath(appA), {
      sessionId: 'lost-endpoint',
      pid: process.pid,
      processStart: getRuntimeProcessStart(process.pid),
      browser: { lifecycle: { state: 'idle' } },
    });
    await expect(getRuntimeSession(appA)).rejects.toThrow(
      'Stop that dev process',
    );
  });
  test('reclaims a launch claim whose PID has been reused', async () => {
    await setLaunchMetadata({
      workspaceRoot: appA,
      pid: process.pid,
      command: 'test',
      claimId: 'old',
    });
    const file = getRuntimeLaunchFilePath(appA);
    const old = JSON.parse(await readFile(file, 'utf8'));
    await writeRuntimeJson(file, { ...old, processStart: 'previous-birth' });
    expect(await getLaunchMetadata(appA)).toBeNull();
    await writeRuntimeJson(file, { ...old, processStart: 'previous-birth' });
    expect(
      (
        await claimLaunchMetadata({
          workspaceRoot: appA,
          pid: process.pid,
          command: 'test',
          claimId: 'new',
        })
      ).acquired,
    ).toBe(true);
  });
  test('registers a running session and resolves the workspace from a child directory', async () => {
    await registerRuntimeSession({
      sessionId: 'session-a',
      workspaceRoot: appA,
      pid: process.pid,
      port: 8081,
      localUrl: 'https://localhost:8081',
      aiMode: 'agent',
    });

    const session = await getRuntimeSession(appA);
    expect(session?.port).toBe(8081);

    const resolved = await resolveWorkspaceRoot({
      cwd: path.join(appA, 'src'),
      requireRunning: true,
    });
    expect(resolved).toBe(await realpath(appA));

    await unregisterRuntimeSession(appA);
  });

  test('records launch metadata in workspace runtime state', async () => {
    const logPath = path.join(appA, '.iwsdk', 'runtime', 'logs', 'dev.log');
    await setLaunchMetadata({
      workspaceRoot: appA,
      pid: process.pid,
      command: 'pnpm',
      args: ['run', 'dev:runtime'],
      logPath,
      scriptName: 'dev:runtime',
      port: 5173,
      openBrowser: true,
    });

    const launch = await getLaunchMetadata(appA);
    expect(launch).toMatchObject({
      workspaceRoot: await realpath(appA),
      pid: process.pid,
      command: 'pnpm',
      args: ['run', 'dev:runtime'],
      logPath,
      scriptName: 'dev:runtime',
      port: 5173,
      openBrowser: true,
    });

    const state = await getWorkspaceRuntimeState(appA);
    expect(state.launch?.scriptName).toBe('dev:runtime');
    expect(state.launch?.port).toBe(5173);
    expect(state.launch?.openBrowser).toBe(true);
  });

  test('atomically claims startup and protects the owner from stale writers', async () => {
    const first = await claimLaunchMetadata({
      claimId: 'claim-a',
      workspaceRoot: appA,
      pid: process.pid,
      processGroupId: process.pid + 1,
      command: 'pnpm',
      args: ['run', 'dev:runtime'],
    });
    const duplicate = await claimLaunchMetadata({
      claimId: 'claim-b',
      workspaceRoot: appA,
      pid: process.pid,
      command: 'pnpm',
      args: ['run', 'dev:runtime'],
    });

    expect(first.acquired).toBe(true);
    expect(first.metadata.phase).toBe('starting');
    expect(duplicate).toMatchObject({
      acquired: false,
      metadata: { claimId: 'claim-a' },
    });
    expect(
      await setLaunchMetadata(
        {
          claimId: 'claim-b',
          phase: 'running',
          workspaceRoot: appA,
          pid: process.pid,
          command: 'npm',
        },
        'claim-b',
      ),
    ).toBeNull();

    await clearLaunchMetadata(appA, 'claim-b');
    expect(await getLaunchMetadata(appA)).toMatchObject({
      claimId: 'claim-a',
      phase: 'starting',
      processGroupId: process.pid + 1,
    });
    await expect(clearLaunchMetadata(appA, 'claim-a', 'running')).resolves.toBe(
      false,
    );
    expect(await getLaunchMetadata(appA)).toMatchObject({ claimId: 'claim-a' });
    await expect(
      clearLaunchMetadata(appA, 'claim-a', 'starting'),
    ).resolves.toBe(true);
    expect(await getLaunchMetadata(appA)).toBeNull();
  });

  test('reports browser command readiness as false without a runtime session', async () => {
    const state = await getWorkspaceRuntimeState(appA);
    expect(state.running).toBe(false);
    expect(state.browserConnected).toBe(false);
    expect(state.browserCommandReady).toBe(false);
  });

  test('updates persisted browser readiness state', async () => {
    await registerRuntimeSession({
      sessionId: 'session-browser',
      workspaceRoot: appA,
      pid: process.pid,
      port: 5173,
      localUrl: 'http://localhost:5173',
      aiMode: 'agent',
      browser: {
        status: 'launching',
        connected: false,
        commandReady: false,
        connectedClientCount: 0,
        lastTransitionAt: new Date().toISOString(),
      },
    });

    await setRuntimeSessionBrowserState(appA, {
      status: 'connected',
      connected: true,
      commandReady: true,
      connectedClientCount: 1,
      lastTransitionAt: new Date().toISOString(),
      lastBridgeConnectedAt: new Date().toISOString(),
      lastCommandReadyAt: new Date().toISOString(),
    });

    const session = await getRuntimeSession(appA);
    const state = await getWorkspaceRuntimeState(appA);
    expect(session?.browser?.status).toBe('connected');
    expect(state.browserConnected).toBe(true);
    expect(state.browserCommandReady).toBe(true);
  });

  test('surfaces the reason a managed browser was intentionally not launched', async () => {
    const issue = {
      cause: 'browser_not_launched' as const,
      message: 'Started with --no-open; run iwsdk dev restart --open.',
      at: new Date().toISOString(),
    };
    await registerRuntimeSession({
      sessionId: 'session-no-open',
      workspaceRoot: appA,
      pid: process.pid,
      port: 5173,
      localUrl: 'http://localhost:5173',
      browser: {
        status: 'not_launched',
        connected: false,
        commandReady: false,
        connectedClientCount: 0,
        lastTransitionAt: new Date().toISOString(),
        lastError: issue,
      },
    });

    expect(await getWorkspaceRuntimeState(appA)).toMatchObject({
      running: true,
      browserConnected: false,
      browserCommandReady: false,
      browserIssue: issue,
    });
  });

  test('treats legacy connected browser sessions as command ready', async () => {
    const sessionFile = getRuntimeSessionFilePath(appA);
    await mkdir(path.dirname(sessionFile), { recursive: true });
    await writeFile(
      sessionFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          sessionId: 'legacy-browser-session',
          workspaceRoot: await realpath(appA),
          pid: process.pid,
          port: 5173,
          localUrl: 'http://localhost:5173',
          networkUrls: [],
          aiTools: [],
          browser: {
            status: 'connected',
            connected: true,
            connectedClientCount: 1,
            lastTransitionAt: new Date().toISOString(),
          },
          registeredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const state = await getWorkspaceRuntimeState(appA);
    expect(state.browserConnected).toBe(true);
    expect(state.browserCommandReady).toBe(true);
  });

  test('treats legacy connected browser sessions as command ready', async () => {
    const sessionFile = getRuntimeSessionFilePath(appA);

    await mkdir(path.dirname(sessionFile), { recursive: true });
    await writeFile(
      sessionFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          sessionId: 'legacy-session',
          workspaceRoot: await realpath(appA),
          pid: process.pid,
          port: 5173,
          localUrl: 'http://localhost:5173',
          networkUrls: [],
          aiTools: [],
          browser: {
            status: 'connected',
            connected: true,
            connectedClientCount: 1,
            lastTransitionAt: new Date().toISOString(),
          },
          registeredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const session = await getRuntimeSession(appA);
    const state = await getWorkspaceRuntimeState(appA);
    expect(session?.browser?.connected).toBe(true);
    expect(state.browserConnected).toBe(true);
    expect(state.browserCommandReady).toBe(true);
  });

  test('cleans stale session and launch files', async () => {
    const stalePid = 999_999_999;
    const sessionFile = getRuntimeSessionFilePath(appA);
    const launchFile = getRuntimeLaunchFilePath(appA);

    await mkdir(path.dirname(sessionFile), { recursive: true });
    await writeFile(
      sessionFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          sessionId: 'stale-session',
          workspaceRoot: await realpath(appA),
          pid: stalePid,
          port: 5173,
          localUrl: 'http://localhost:5173',
          networkUrls: [],
          aiTools: [],
          registeredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    await writeFile(
      launchFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          workspaceRoot: await realpath(appA),
          pid: stalePid,
          command: 'npm',
          args: ['run', 'dev:runtime'],
          logPath: null,
          scriptName: 'dev:runtime',
          port: null,
          openBrowser: false,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    expect(await getRuntimeSession(appA)).toBeNull();
    expect(await getLaunchMetadata(appA)).toBeNull();

    await expect(readFile(sessionFile, 'utf8')).rejects.toThrow();
    await expect(readFile(launchFile, 'utf8')).rejects.toThrow();
  });

  test('does not prune a replacement session registered behind the same lock', async () => {
    const sessionFile = getRuntimeSessionFilePath(appA);
    const workspaceRoot = await realpath(appA);
    let releaseWriter!: () => void;
    let writerHasLock!: () => void;
    const writerLocked = new Promise<void>((resolve) => {
      writerHasLock = resolve;
    });
    const writerGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const writer = withRuntimeFileLock(sessionFile, async () => {
      await writeRuntimeJson(sessionFile, {
        schemaVersion: 2,
        sessionId: 'stale-session',
        workspaceRoot,
        pid: 999_999_999,
        port: 5173,
        localUrl: 'http://localhost:5173',
        networkUrls: [],
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      writerHasLock();
      await writerGate;
      await writeRuntimeJson(sessionFile, {
        schemaVersion: 2,
        sessionId: 'replacement-session',
        workspaceRoot,
        pid: process.pid,
        port: 5174,
        localUrl: 'http://localhost:5174',
        networkUrls: [],
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    await writerLocked;
    const read = getRuntimeSession(appA);
    releaseWriter();
    await writer;

    await expect(read).resolves.toMatchObject({
      sessionId: 'replacement-session',
      pid: process.pid,
      port: 5174,
    });
  });

  test('serializes contenders while recovering a stale lock', async () => {
    const launchFile = getRuntimeLaunchFilePath(appA);
    const lockPath = getRuntimeFileLockPath(launchFile);
    await mkdir(lockPath, { recursive: true });
    await writeFile(
      path.join(lockPath, 'owner.json'),
      `${JSON.stringify({
        acquiredAt: Date.now() - 60_000,
        lockId: 'orphaned-lock',
        pid: 999_999_999,
      })}\n`,
      'utf8',
    );

    const claims = await Promise.all(
      ['claim-a', 'claim-b', 'claim-c'].map((claimId) =>
        claimLaunchMetadata({
          claimId,
          workspaceRoot: appA,
          pid: process.pid,
          command: 'pnpm',
        }),
      ),
    );

    expect(claims.filter((claim) => claim.acquired)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.acquired)).toHaveLength(2);
  });

  test.each([
    'empty',
    'unique-owner',
    'pid-reuse',
    'empty-guard',
    'dead-guard',
  ])('recovers interrupted file-lock publication: %s', async (mode) => {
    const file = getRuntimeSessionFilePath(appA);
    const lock = getRuntimeFileLockPath(file);
    const abandoned = mode.includes('guard') ? `${lock}.recovery` : lock;
    await mkdir(abandoned, { recursive: true });
    if (!mode.startsWith('empty')) {
      const filename =
        mode === 'dead-guard' ? 'owner.json' : 'owner-abcdef.json';
      await writeFile(
        path.join(abandoned, filename),
        JSON.stringify({
          pid: mode === 'pid-reuse' ? process.pid : 999_999_999,
          processStart:
            mode === 'pid-reuse' ? 'previous-process-birth' : undefined,
        }),
      );
    }
    let entered = 0;
    await withRuntimeFileLock(file, async () => {
      entered++;
    });
    expect(entered).toBe(1);
    await expect(
      readFile(path.join(abandoned, 'owner.json')),
    ).rejects.toThrow();
  });

  test('prunes interrupted atomic-write files after taking the lock', async () => {
    const sessionFile = getRuntimeSessionFilePath(appA);
    const orphanedTempFile = `${sessionFile}.123.456.1.tmp`;
    await mkdir(path.dirname(sessionFile), { recursive: true });
    await writeFile(orphanedTempFile, 'partial', 'utf8');

    await getRuntimeSession(appA);

    await expect(readFile(orphanedTempFile, 'utf8')).rejects.toThrow();
  });
});
