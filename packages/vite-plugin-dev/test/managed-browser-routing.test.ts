/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { EventEmitter } from 'events';
import {
  INTERNAL_RUNTIME_LAUNCH_CLAIM_ENV,
  INTERNAL_RUNTIME_SHUTDOWN_METHOD,
} from '@iwsdk/cli/contract';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { iwsdkDev } from '../src/index.js';

const mocks = vi.hoisted(() => ({
  launchManagedBrowser: vi.fn(),
  registerRuntimeSession: vi.fn().mockResolvedValue(undefined),
  reportSessionEnd: vi.fn(),
  reportSessionStart: vi.fn(),
  servers: [] as any[],
  setRuntimeSessionBrowserAutomation: vi.fn().mockResolvedValue(undefined),
  setRuntimeSessionBrowserState: vi.fn().mockResolvedValue(undefined),
  unregisterRuntimeSession: vi.fn().mockResolvedValue(undefined),
  unregisterRuntimeSessionSync: vi.fn(),
}));

vi.mock('../src/headless-browser.js', () => ({
  launchManagedBrowser: mocks.launchManagedBrowser,
}));

vi.mock('../src/metavr-telemetry.js', () => ({
  reportSessionEnd: mocks.reportSessionEnd,
  reportSessionStart: mocks.reportSessionStart,
}));

vi.mock('../src/runtime-session.js', () => ({
  registerRuntimeSession: mocks.registerRuntimeSession,
  RuntimeSessionOwnershipError: class RuntimeSessionOwnershipError extends Error {},
  setRuntimeSessionBrowserAutomation: mocks.setRuntimeSessionBrowserAutomation,
  setRuntimeSessionBrowserState: mocks.setRuntimeSessionBrowserState,
  unregisterRuntimeSession: mocks.unregisterRuntimeSession,
  unregisterRuntimeSessionSync: mocks.unregisterRuntimeSessionSync,
}));

vi.mock('ws', () => {
  class FakeWebSocketServer {
    clients = new Set<any>();
    private handlers = new Map<string, Array<(...args: any[]) => void>>();

    constructor() {
      mocks.servers.push(this);
    }
    emit(event: string, ...args: any[]) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }
    on(event: string, handler: (...args: any[]) => void) {
      const entries = this.handlers.get(event) ?? [];
      entries.push(handler);
      this.handlers.set(event, entries);
      return this;
    }
    close(callback?: () => void) {
      callback?.();
    }
    handleUpgrade() {}
  }
  return {
    WebSocket: { OPEN: 1 },
    WebSocketServer: FakeWebSocketServer,
  };
});

function createManagedBrowser() {
  let closed = false;
  let onClose = () => {};
  return {
    browser: {
      captureRuntimeScreenshot: vi.fn().mockResolvedValue({
        bytes: Buffer.from('png'),
        metadata: {
          generation: 3,
          id: 'app-page',
          mimeType: 'image/png',
          url: 'http://localhost:4173/',
        },
      }),
      close: vi.fn().mockImplementation(async () => {
        closed = true;
      }),
      getAutomationTarget: vi.fn(() => null),
      getTabMetadata: vi.fn().mockResolvedValue({
        generation: 3,
        id: 'app-page',
      }),
      isClosed: vi.fn(() => closed),
      onClose: vi.fn((callback: () => void) => {
        onClose = callback;
      }),
      runCommandExclusive: vi.fn(async (operation: () => Promise<unknown>) =>
        operation(),
      ),
      snapshotApplication: vi.fn().mockResolvedValue({
        application: {
          generation: 3,
          id: 'app-page',
          outerUrl: 'http://localhost:4173/',
          url: 'http://localhost:4173/',
          workspaceFramed: false,
        },
        elements: [],
        snapshotId: 'snapshot-1',
        truncated: false,
      }),
    },
    closeUnexpectedly() {
      closed = true;
      onClose();
    },
  };
}

async function createHarness(
  managedBrowser: ReturnType<typeof createManagedBrowser>['browser'],
) {
  const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
  const httpServer = {
    address: vi.fn(() => ({ port: 4173 })),
    off: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
      const entries = handlers.get(event) ?? [];
      entries.push(handler);
      handlers.set(event, entries);
    }),
    once: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
      const entries = handlers.get(event) ?? [];
      entries.push(handler);
      handlers.set(event, entries);
    }),
  };
  const close = vi.fn().mockResolvedValue(undefined);
  mocks.launchManagedBrowser.mockResolvedValueOnce(managedBrowser);
  const plugin = iwsdkDev({ workspace: { enabled: true } });
  plugin.configResolved?.({
    command: 'serve',
    root: '/tmp/iwsdk-browser-routing',
    server: {},
  } as never);
  plugin.configureServer?.({
    close,
    config: { server: { port: 4173 } },
    httpServer,
    middlewares: { use: vi.fn() },
    resolvedUrls: { local: ['http://localhost:4173/'], network: [] },
  } as never);
  await handlers.get('listening')?.[0]?.();
  await vi.waitFor(() => expect(mocks.launchManagedBrowser).toHaveBeenCalled());

  const socket = Object.assign(new EventEmitter(), {
    readyState: 1,
    send: vi.fn(),
  });
  mocks.servers.at(-1).emit('connection', socket);
  return { close, handlers, socket };
}

afterEach(() => {
  mocks.servers.length = 0;
  vi.clearAllMocks();
});

describe('managed browser WebSocket routing', () => {
  test('runs host browser commands without a runtime bridge', async () => {
    const managed = createManagedBrowser();
    const { socket } = await createHarness(managed.browser);

    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({ id: 'snapshot', method: 'browser_snapshot' }),
      ),
    );

    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledOnce());
    const response = JSON.parse(socket.send.mock.calls[0]![0]);
    expect(response).toMatchObject({
      _tabGeneration: 3,
      _tabId: 'app-page',
      id: 'snapshot',
      result: { snapshotId: 'snapshot-1' },
    });
    expect(managed.browser.snapshotApplication).toHaveBeenCalledOnce();
  });

  test('does not combine a new application id with a stale generation', async () => {
    const managed = createManagedBrowser();
    managed.browser.snapshotApplication.mockResolvedValueOnce({
      application: { id: 'replacement-page' },
      elements: [],
      snapshotId: 'snapshot-2',
      truncated: false,
    });
    const { socket } = await createHarness(managed.browser);

    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({ id: 'snapshot', method: 'browser_snapshot' }),
      ),
    );

    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledOnce());
    const response = JSON.parse(socket.send.mock.calls[0]![0]);
    expect(response).toMatchObject({
      _tabId: 'replacement-page',
    });
    expect(response).not.toHaveProperty('_tabGeneration');
  });

  test('rejects a stale target inside the browser command mutex', async () => {
    const managed = createManagedBrowser();
    const { socket } = await createHarness(managed.browser);

    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          id: 'snapshot',
          method: 'browser_snapshot',
          target: { pageId: 'old-page', role: 'app', tabGeneration: 2 },
        }),
      ),
    );

    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledOnce());
    const response = JSON.parse(socket.send.mock.calls[0]![0]);
    expect(response.error.data).toMatchObject({
      code: 'stale_browser_tab',
      currentTab: { generation: 3, id: 'app-page' },
    });
    expect(managed.browser.runCommandExclusive).toHaveBeenCalledOnce();
    expect(managed.browser.snapshotApplication).not.toHaveBeenCalled();
  });

  test('propagates retryable managed-browser coordinator errors', async () => {
    const managed = createManagedBrowser();
    managed.browser.snapshotApplication.mockRejectedValueOnce(
      Object.assign(
        new Error('Managed browser command timed out in the queue'),
        {
          code: 'browser_command_queue_timeout',
          retryable: true,
        },
      ),
    );
    const { socket } = await createHarness(managed.browser);

    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({ id: 'snapshot', method: 'browser_snapshot' }),
      ),
    );

    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledOnce());
    expect(JSON.parse(socket.send.mock.calls[0]![0])).toMatchObject({
      error: {
        code: -32000,
        data: {
          code: 'browser_command_queue_timeout',
          retryable: true,
        },
        message: 'Managed browser command timed out in the queue',
      },
      id: 'snapshot',
    });
  });

  test('reports a lazy relaunch before routing the next host command', async () => {
    const managed = createManagedBrowser();
    const replacement = createManagedBrowser();
    const { socket } = await createHarness(managed.browser);
    mocks.launchManagedBrowser.mockResolvedValueOnce(replacement.browser);
    managed.closeUnexpectedly();

    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({ id: 'snapshot', method: 'browser_snapshot' }),
      ),
    );

    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledOnce());
    expect(JSON.parse(socket.send.mock.calls[0]![0])).toMatchObject({
      id: 'snapshot',
      result: { status: 'browser_relaunched' },
    });
    expect(replacement.browser.snapshotApplication).not.toHaveBeenCalled();
  });

  test('only accepts a runtime shutdown carrying the launch claim', async () => {
    const previousClaim = process.env[INTERNAL_RUNTIME_LAUNCH_CLAIM_ENV];
    process.env[INTERNAL_RUNTIME_LAUNCH_CLAIM_ENV] = 'owned-claim';
    try {
      const managed = createManagedBrowser();
      const { close, socket } = await createHarness(managed.browser);

      socket.emit(
        'message',
        Buffer.from(
          JSON.stringify({
            id: 'bad-shutdown',
            method: INTERNAL_RUNTIME_SHUTDOWN_METHOD,
            params: { claimId: 'foreign-claim' },
          }),
        ),
      );
      await vi.waitFor(() => expect(socket.send).toHaveBeenCalledOnce());
      expect(JSON.parse(socket.send.mock.calls[0]![0])).toMatchObject({
        id: 'bad-shutdown',
        error: { code: -32001 },
      });
      expect(close).not.toHaveBeenCalled();

      socket.send.mockClear();
      socket.emit(
        'message',
        Buffer.from(
          JSON.stringify({
            id: 'owned-shutdown',
            method: INTERNAL_RUNTIME_SHUTDOWN_METHOD,
            params: { claimId: 'owned-claim' },
          }),
        ),
      );
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
      expect(JSON.parse(socket.send.mock.calls[0]![0])).toMatchObject({
        id: 'owned-shutdown',
        result: { accepted: true },
      });
    } finally {
      if (previousClaim == null) {
        delete process.env[INTERNAL_RUNTIME_LAUNCH_CLAIM_ENV];
      } else {
        process.env[INTERNAL_RUNTIME_LAUNCH_CLAIM_ENV] = previousClaim;
      }
    }
  });
});
