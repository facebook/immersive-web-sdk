/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import net from 'net';
import { describe, expect, test } from 'vitest';
import { WebSocketServer } from 'ws';
import { sendRuntimeCommand } from '../src/runtime-transport.js';

describe('runtime command transport', () => {
  test('uses one timeout budget across the WSS to WS fallback path', async () => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => {
        sockets.delete(socket);
      });
      socket.on('error', () => {});
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const startedAt = Date.now();

    try {
      await expect(
        sendRuntimeCommand({
          port,
          method: 'never_responds',
          timeoutMs: 2000,
        }),
      ).rejects.toThrow();
    } finally {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(3200);
  });

  test('prefers ws first for http runtime sessions', async () => {
    const server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      server.once('listening', () => resolve());
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    server.on('connection', (socket) => {
      socket.on('message', (chunk) => {
        const request = JSON.parse(chunk.toString()) as { id: string };
        socket.send(
          JSON.stringify({
            id: request.id,
            result: { ok: true },
          }),
        );
      });
    });

    const startedAt = Date.now();
    try {
      const response = await sendRuntimeCommand({
        port,
        method: 'internal_probe',
        timeoutMs: 3000,
        runtimeSession: {
          schemaVersion: 1,
          sessionId: 'session-http',
          workspaceRoot: '/tmp/app',
          pid: process.pid,
          port,
          localUrl: `http://localhost:${port}`,
          networkUrls: [],
          aiTools: [],
          registeredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          browser: {
            status: 'connected',
            connected: true,
            commandReady: false,
            connectedClientCount: 1,
            lastTransitionAt: new Date().toISOString(),
          },
        },
      });
      expect(response.result).toEqual({ ok: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1000);
  });

  test('sends page target metadata with runtime commands', async () => {
    const server = new WebSocketServer({ port: 0 });
    let received: unknown;
    await new Promise<void>((resolve) => {
      server.once('listening', () => resolve());
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    server.on('connection', (socket) => {
      socket.on('message', (chunk) => {
        const request = JSON.parse(chunk.toString()) as { id: string };
        received = request;
        socket.send(
          JSON.stringify({
            id: request.id,
            result: { ok: true },
          }),
        );
      });
    });

    try {
      await sendRuntimeCommand({
        port,
        method: 'scene_screenshot',
        target: { role: 'editor', sceneSessionId: 'scene-a' },
        timeoutMs: 3000,
        runtimeSession: {
          schemaVersion: 1,
          sessionId: 'session-target',
          workspaceRoot: '/tmp/app',
          pid: process.pid,
          port,
          localUrl: `http://localhost:${port}`,
          networkUrls: [],
          aiTools: [],
          registeredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          browser: {
            status: 'connected',
            connected: true,
            commandReady: true,
            connectedClientCount: 2,
            lastTransitionAt: new Date().toISOString(),
          },
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(received).toMatchObject({
      method: 'scene_screenshot',
      target: { role: 'editor', sceneSessionId: 'scene-a' },
    });
  });

  test('classifies closed-before-response as browser_not_ready while warming', async () => {
    const server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      server.once('listening', () => resolve());
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    server.on('connection', (socket) => {
      socket.on('message', () => {
        socket.close();
      });
    });

    try {
      await expect(
        sendRuntimeCommand({
          port,
          method: 'screenshot',
          timeoutMs: 1500,
          runtimeSession: {
            schemaVersion: 1,
            sessionId: 'session-close',
            workspaceRoot: '/tmp/app',
            pid: process.pid,
            port,
            localUrl: `http://localhost:${port}`,
            networkUrls: [],
            aiTools: [],
            registeredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            browser: {
              status: 'connected',
              connected: true,
              commandReady: false,
              connectedClientCount: 1,
              lastTransitionAt: new Date().toISOString(),
            },
          },
        }),
      ).rejects.toMatchObject({
        issueCause: 'browser_not_ready',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
