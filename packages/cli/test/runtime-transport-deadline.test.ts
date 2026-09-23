/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RuntimeSession } from '../src/runtime-contract.js';

// A scripted socket makes connect timing exact without a TLS certificate.
class FakeWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static sockets: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: Array<Record<string, unknown>> = [];

  constructor(readonly url: string) {
    super();
    FakeWebSocket.sockets.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  send(payload: string, callback: (error?: Error) => void) {
    this.sent.push(JSON.parse(payload));
    callback();
  }

  respond(result: unknown) {
    const [request] = this.sent;
    this.emit(
      'message',
      Buffer.from(JSON.stringify({ id: request.id, result })),
    );
  }

  close(code = 1005) {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    // Like ws, close is observed asynchronously.
    queueMicrotask(() => this.emit('close', code, Buffer.from('')));
  }
}

vi.mock('ws', () => ({ default: FakeWebSocket }));

const { sendRuntimeCommand } = await import('../src/runtime-transport.js');

function session(
  status: NonNullable<RuntimeSession['browser']>['status'],
): RuntimeSession {
  const now = new Date().toISOString();
  return {
    aiTools: [],
    browser: {
      commandReady: false,
      connected: false,
      connectedClientCount: 0,
      lastTransitionAt: now,
      status,
    },
    localUrl: 'http://localhost:8081',
    networkUrls: [],
    pid: process.pid,
    port: 8081,
    registeredAt: now,
    schemaVersion: 1,
    sessionId: 'deadline-test',
    updatedAt: now,
    workspaceRoot: '/tmp/app',
  };
}

const physicalTarget = {
  deviceClass: 'physical' as const,
  headsetId: '192.168.1.5:5555',
  pageId: 'page-a',
  tabGeneration: 1,
};

describe('runtime command deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.sockets = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('a WSS probe budget covers connecting only, not the command', async () => {
    const startedAt = Date.now();
    const pending = sendRuntimeCommand({
      method: 'ecs_pause',
      port: 8081,
      timeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    const [wss] = FakeWebSocket.sockets;
    expect(wss.url).toMatch(/^wss:/);
    wss.open();
    expect(wss.sent[0].deadline).toBe(startedAt + 10_000);

    // Well past the 1.5s probe budget, the dispatched command is still live.
    await vi.advanceTimersByTimeAsync(3000);
    wss.respond({ ok: true });
    await expect(pending).resolves.toMatchObject({ result: { ok: true } });
    expect(FakeWebSocket.sockets).toHaveLength(1);
  });

  test('a WSS probe that never opens falls back with the original deadline', async () => {
    const startedAt = Date.now();
    const pending = sendRuntimeCommand({
      method: 'ecs_pause',
      port: 8081,
      timeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(1500);
    const [wss, ws] = FakeWebSocket.sockets;
    expect(wss.url).toMatch(/^wss:/);
    expect(wss.sent).toHaveLength(0);
    expect(ws.url).toMatch(/^ws:/);
    ws.open();
    expect(ws.sent[0].deadline).toBe(startedAt + 10_000);
    ws.respond({ ok: true });
    await expect(pending).resolves.toMatchObject({ result: { ok: true } });
  });

  test('a failure after dispatch is outcome_unknown and never replayed', async () => {
    const pending = sendRuntimeCommand({
      method: 'ecs_pause',
      port: 8081,
      timeoutMs: 10_000,
    });
    const settled = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.sockets[0].open();
    FakeWebSocket.sockets[0].close(1006);
    await expect(settled).resolves.toMatchObject({
      details: { outcome: 'outcome_unknown' },
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeWebSocket.sockets).toHaveLength(1);
  });

  test('a timeout after dispatch fires at the original deadline', async () => {
    const pending = sendRuntimeCommand({
      method: 'ecs_pause',
      port: 8081,
      timeoutMs: 4000,
    });
    const settled = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.sockets[0].open();
    await vi.advanceTimersByTimeAsync(3999);
    expect(FakeWebSocket.sockets[0].readyState).toBe(FakeWebSocket.OPEN);
    await vi.advanceTimersByTimeAsync(1);
    await expect(settled).resolves.toMatchObject({
      message: 'Request timeout for ecs_pause',
      details: { outcome: 'outcome_unknown' },
    });
    expect(FakeWebSocket.sockets).toHaveLength(1);
  });

  test('a socket that opens after the deadline dispatches nothing', async () => {
    const pending = sendRuntimeCommand({
      method: 'reload_page',
      port: 8081,
      runtimeSession: session('not_launched'),
      target: physicalTarget,
      timeoutMs: 1000,
    });
    const settled = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    // The event loop stalled past the deadline before the open event ran.
    vi.setSystemTime(Date.now() + 2000);
    FakeWebSocket.sockets[0].open();
    await expect(settled).resolves.toMatchObject({
      message: 'Request timeout for reload_page',
      details: { outcome: 'not_executed' },
    });
    expect(FakeWebSocket.sockets[0].sent).toHaveLength(0);
    expect(FakeWebSocket.sockets).toHaveLength(1);
  });

  test('a headset failure reports its connection, not managed browser state', async () => {
    const send = (target?: typeof physicalTarget) => {
      const pending = sendRuntimeCommand({
        method: 'reload_page',
        port: 8081,
        runtimeSession: session('not_launched'),
        target,
        timeoutMs: 10_000,
      }).catch((error: unknown) => error);
      return vi.advanceTimersByTimeAsync(0).then(() => {
        const socket = FakeWebSocket.sockets.at(-1)!;
        socket.open();
        socket.close(1006);
        return pending;
      });
    };

    await expect(send(physicalTarget)).resolves.toMatchObject({
      issueCause: 'connection_lost',
      browser: undefined,
      details: { outcome: 'outcome_unknown' },
    });
    // The managed browser keeps its own attribution.
    await expect(send()).resolves.toMatchObject({
      issueCause: 'browser_not_launched',
    });
  });
});
