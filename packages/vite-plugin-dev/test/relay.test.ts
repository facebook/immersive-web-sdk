/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, test, expect, vi } from 'vitest';
import { createRelayHandler, type RelayWebSocket } from '../src/mcp-relay.js';

/** Create a mock WebSocket in the OPEN state. */
function createMockWs(): RelayWebSocket & { send: ReturnType<typeof vi.fn> } {
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
  };
}

describe('createRelayHandler', () => {
  test('request from one client is broadcast to all others, not echoed to sender', () => {
    const relay = createRelayHandler();
    const sender = createMockWs();
    const clientA = createMockWs();
    const clientB = createMockWs();
    const clients = new Set<RelayWebSocket>([sender, clientA, clientB]);

    const request = JSON.stringify({
      id: '1',
      method: 'get_transform',
      params: {},
    });
    relay.onMessage(sender, request, clients);

    // Sender should NOT receive its own request
    expect(sender.send).not.toHaveBeenCalled();
    // Both other clients should receive the request
    expect(clientA.send).toHaveBeenCalledWith(request);
    expect(clientB.send).toHaveBeenCalledWith(request);
  });

  test('first response for an ID is forwarded to the original requester only', () => {
    const relay = createRelayHandler();
    const mcpServer = createMockWs();
    const tab1 = createMockWs();
    const tab2 = createMockWs();
    const clients = new Set<RelayWebSocket>([mcpServer, tab1, tab2]);

    // MCP server sends request
    const request = JSON.stringify({
      id: '42',
      method: 'get_session_status',
      params: {},
    });
    relay.onMessage(mcpServer, request, clients);
    expect(relay.pendingCount()).toBe(1);

    // Clear send mocks from the broadcast phase so we only track response routing
    mcpServer.send.mockClear();
    tab1.send.mockClear();
    tab2.send.mockClear();

    // tab1 responds first
    const response = JSON.stringify({ id: '42', result: { active: true } });
    relay.onMessage(tab1, response, clients);

    // Original requester (mcpServer) should receive the response
    expect(mcpServer.send).toHaveBeenCalledWith(response);
    // tab2 should NOT receive the response (only the requester gets it)
    expect(tab2.send).not.toHaveBeenCalled();
    // Pending should be cleared
    expect(relay.pendingCount()).toBe(0);
  });

  test('second response for the same ID is silently dropped', () => {
    const relay = createRelayHandler();
    const mcpServer = createMockWs();
    const tab1 = createMockWs();
    const tab2 = createMockWs();
    const clients = new Set<RelayWebSocket>([mcpServer, tab1, tab2]);

    // MCP server sends request
    relay.onMessage(
      mcpServer,
      JSON.stringify({ id: '7', method: 'get_transform', params: {} }),
      clients,
    );

    // tab1 responds
    const response1 = JSON.stringify({ id: '7', result: { pos: [0, 0, 0] } });
    relay.onMessage(tab1, response1, clients);
    expect(mcpServer.send).toHaveBeenCalledTimes(1);

    // tab2 also responds (duplicate) — should be dropped
    const response2 = JSON.stringify({ id: '7', result: { pos: [1, 1, 1] } });
    relay.onMessage(tab2, response2, clients);
    expect(mcpServer.send).toHaveBeenCalledTimes(1); // Still 1
  });

  test('response with unknown ID (no pending entry) is silently dropped', () => {
    const relay = createRelayHandler();
    const tab = createMockWs();
    const other = createMockWs();
    const clients = new Set<RelayWebSocket>([tab, other]);

    // Send a response without a prior request
    const orphanResponse = JSON.stringify({ id: 'unknown-99', result: {} });
    relay.onMessage(tab, orphanResponse, clients);

    // Neither client should receive anything
    expect(tab.send).not.toHaveBeenCalled();
    expect(other.send).not.toHaveBeenCalled();
  });

  test('non-JSON message is broadcast to all others', () => {
    const relay = createRelayHandler();
    const sender = createMockWs();
    const clientA = createMockWs();
    const clientB = createMockWs();
    const clients = new Set<RelayWebSocket>([sender, clientA, clientB]);

    const badData = 'this is not json {{{';
    relay.onMessage(sender, badData, clients);

    expect(sender.send).not.toHaveBeenCalled();
    expect(clientA.send).toHaveBeenCalledWith(badData);
    expect(clientB.send).toHaveBeenCalledWith(badData);
  });

  test('message with ID but no method/result/error is broadcast (unknown shape)', () => {
    const relay = createRelayHandler();
    const sender = createMockWs();
    const client = createMockWs();
    const clients = new Set<RelayWebSocket>([sender, client]);

    // Has an id but is neither a request nor a response
    const weirdMessage = JSON.stringify({ id: '5', foo: 'bar' });
    relay.onMessage(sender, weirdMessage, clients);

    expect(sender.send).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(weirdMessage);
  });

  test('error response is forwarded as first-wins just like success response', () => {
    const relay = createRelayHandler();
    const mcpServer = createMockWs();
    const tab = createMockWs();
    const clients = new Set<RelayWebSocket>([mcpServer, tab]);

    // Request
    relay.onMessage(
      mcpServer,
      JSON.stringify({ id: '10', method: 'set_transform', params: {} }),
      clients,
    );

    // Tab responds with error
    const errorResponse = JSON.stringify({
      id: '10',
      error: { code: -32000, message: 'device not connected' },
    });
    relay.onMessage(tab, errorResponse, clients);

    expect(mcpServer.send).toHaveBeenCalledWith(errorResponse);
    expect(relay.pendingCount()).toBe(0);
  });

  test('does not send to clients with non-OPEN readyState', () => {
    const relay = createRelayHandler();
    const sender = createMockWs();
    const openClient = createMockWs();
    const closedClient = createMockWs();
    closedClient.readyState = 3; // CLOSED
    const clients = new Set<RelayWebSocket>([sender, openClient, closedClient]);

    const request = JSON.stringify({ id: '1', method: 'test', params: {} });
    relay.onMessage(sender, request, clients);

    expect(openClient.send).toHaveBeenCalled();
    expect(closedClient.send).not.toHaveBeenCalled();
  });

  test('cleanStale removes entries older than maxAgeMs', async () => {
    const relay = createRelayHandler();
    const ws = createMockWs();
    const clients = new Set<RelayWebSocket>([ws, createMockWs()]);

    // Send a request to create a pending entry
    relay.onMessage(
      ws,
      JSON.stringify({ id: 'stale-1', method: 'test', params: {} }),
      clients,
    );
    expect(relay.pendingCount()).toBe(1);

    // Wait a tick so the entry is at least 1ms old
    await new Promise((r) => setTimeout(r, 5));

    // Clean with 1ms max age — should remove the entry
    relay.cleanStale(1);
    expect(relay.pendingCount()).toBe(0);
  });

  test('defaults command requests to app browser clients when page roles are registered', () => {
    const relay = createRelayHandler();
    const command = createMockWs();
    const app = createMockWs();
    const editor = createMockWs();
    const clients = new Set<RelayWebSocket>([command, app, editor]);
    relay.registerBrowserClient(app, {
      pageId: 'app-tab',
      role: 'app',
      tabGeneration: 1,
    });
    relay.registerBrowserClient(editor, {
      pageId: 'editor-tab',
      role: 'editor',
      tabGeneration: 1,
    });

    const request = JSON.stringify({
      id: 'target-default',
      method: 'get_session_status',
      params: {},
    });
    relay.onMessage(command, request, clients);

    expect(app.send).toHaveBeenCalledWith(request);
    expect(editor.send).not.toHaveBeenCalled();
  });

  test('routes explicit editor-targeted requests only to matching editor clients', () => {
    const relay = createRelayHandler();
    const command = createMockWs();
    const app = createMockWs();
    const editor = createMockWs();
    const clients = new Set<RelayWebSocket>([command, app, editor]);
    relay.registerBrowserClient(app, {
      pageId: 'app-tab',
      role: 'app',
      tabGeneration: 1,
    });
    relay.registerBrowserClient(editor, {
      pageId: 'editor-tab',
      role: 'editor',
      sceneSessionId: 'scene-1',
      tabGeneration: 3,
    });

    const request = JSON.stringify({
      id: 'target-editor',
      method: 'scene_screenshot',
      params: {},
      target: {
        role: 'editor',
        pageId: 'editor-tab',
        tabGeneration: 3,
        sceneSessionId: 'scene-1',
      },
    });
    relay.onMessage(command, request, clients);

    expect(app.send).not.toHaveBeenCalled();
    expect(editor.send).toHaveBeenCalledWith(request);
  });

  test('fails targeted requests when generation is stale', () => {
    const relay = createRelayHandler();
    const command = createMockWs();
    const app = createMockWs();
    const clients = new Set<RelayWebSocket>([command, app]);
    relay.registerBrowserClient(app, {
      pageId: 'app-tab',
      role: 'app',
      tabGeneration: 2,
    });

    relay.onMessage(
      command,
      JSON.stringify({
        id: 'stale-target',
        method: 'get_session_status',
        params: {},
        target: {
          role: 'app',
          pageId: 'app-tab',
          tabGeneration: 1,
        },
      }),
      clients,
    );

    expect(app.send).not.toHaveBeenCalled();
    expect(command.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(command.send.mock.calls[0][0])).toMatchObject({
      id: 'stale-target',
      error: {
        code: -32004,
      },
    });
    expect(relay.pendingCount()).toBe(0);
  });

  test('drops responses from non-target browser clients', () => {
    const relay = createRelayHandler();
    const command = createMockWs();
    const app = createMockWs();
    const editor = createMockWs();
    const clients = new Set<RelayWebSocket>([command, app, editor]);
    relay.registerBrowserClient(app, {
      pageId: 'app-tab',
      role: 'app',
      tabGeneration: 1,
    });
    relay.registerBrowserClient(editor, {
      pageId: 'editor-tab',
      role: 'editor',
      tabGeneration: 1,
    });

    relay.onMessage(
      command,
      JSON.stringify({
        id: 'target-response',
        method: 'scene_screenshot',
        params: {},
        target: { role: 'editor' },
      }),
      clients,
    );

    relay.onMessage(
      app,
      JSON.stringify({ id: 'target-response', result: { wrong: true } }),
      clients,
    );
    expect(command.send).not.toHaveBeenCalled();

    const editorResponse = JSON.stringify({
      id: 'target-response',
      result: { ok: true },
    });
    relay.onMessage(editor, editorResponse, clients);
    expect(command.send).toHaveBeenCalledWith(editorResponse);
  });

  test('keeps a pending request alive when one broadcast target disconnects', () => {
    const relay = createRelayHandler();
    const command = createMockWs();
    const appA = createMockWs();
    const appB = createMockWs();
    const clients = new Set<RelayWebSocket>([command, appA, appB]);
    relay.registerBrowserClient(appA, {
      pageId: 'app-a',
      role: 'app',
      tabGeneration: 1,
    });
    relay.registerBrowserClient(appB, {
      pageId: 'app-b',
      role: 'app',
      tabGeneration: 1,
    });

    relay.onMessage(
      command,
      JSON.stringify({
        id: 'multi-target',
        method: 'get_session_status',
        params: {},
      }),
      clients,
    );
    expect(relay.pendingCount()).toBe(1);

    relay.unregisterClient(appA);
    clients.delete(appA);
    expect(relay.pendingCount()).toBe(1);
    expect(command.send).not.toHaveBeenCalled();

    const response = JSON.stringify({
      id: 'multi-target',
      result: { active: true },
    });
    relay.onMessage(appB, response, clients);
    expect(command.send).toHaveBeenCalledWith(response);
    expect(relay.pendingCount()).toBe(0);
  });

  test('notifies the requester when every pending target disconnects', () => {
    const relay = createRelayHandler();
    const command = createMockWs();
    const app = createMockWs();
    const clients = new Set<RelayWebSocket>([command, app]);
    relay.registerBrowserClient(app, {
      pageId: 'app',
      role: 'app',
      tabGeneration: 1,
    });

    relay.onMessage(
      command,
      JSON.stringify({
        id: 'target-gone',
        method: 'get_session_status',
        params: {},
      }),
      clients,
    );

    relay.unregisterClient(app);

    expect(JSON.parse(command.send.mock.calls[0][0])).toMatchObject({
      error: {
        code: -32004,
      },
      id: 'target-gone',
    });
    expect(relay.pendingCount()).toBe(0);
  });
});
