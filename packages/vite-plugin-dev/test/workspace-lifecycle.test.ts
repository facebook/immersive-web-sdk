/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { iwsdkDev } from '../src/index.js';

const mocks = vi.hoisted(() => ({
  launchManagedBrowser: vi.fn(),
  registerRuntimeSession: vi.fn().mockResolvedValue(undefined),
  reportSessionEnd: vi.fn(),
  reportSessionStart: vi.fn(),
  setRuntimeSessionBrowserState: vi.fn().mockResolvedValue(undefined),
  unregisterRuntimeSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/headless-browser.js', () => ({
  launchManagedBrowser: mocks.launchManagedBrowser,
}));

vi.mock('../src/hzdb-telemetry.js', () => ({
  reportSessionEnd: mocks.reportSessionEnd,
  reportSessionStart: mocks.reportSessionStart,
}));

vi.mock('../src/runtime-session.js', () => ({
  registerRuntimeSession: mocks.registerRuntimeSession,
  setRuntimeSessionBrowserState: mocks.setRuntimeSessionBrowserState,
  unregisterRuntimeSession: mocks.unregisterRuntimeSession,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('managed workspace lifecycle', () => {
  test('defaults AI sessions to the visible collaborate workspace', async () => {
    const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
    const httpServer = {
      address: vi.fn(() => ({ port: 4173 })),
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        const eventHandlers = handlers.get(event) ?? [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
      }),
    };
    const managedBrowser = {
      close: vi.fn().mockResolvedValue(undefined),
      onClose: vi.fn(),
    };
    mocks.launchManagedBrowser.mockResolvedValueOnce(managedBrowser);
    const plugin = iwsdkDev({ ai: {} });
    plugin.configResolved?.({
      command: 'serve',
      root: '/tmp/iwsdk-ai-default-collaborate',
      server: {},
    } as never);
    plugin.configureServer?.({
      config: { server: { port: 4173 } },
      httpServer,
      middlewares: { use: vi.fn() },
      resolvedUrls: {
        local: ['http://localhost:4173/'],
        network: [],
      },
    } as never);

    await handlers.get('listening')?.[0]?.();

    expect(mocks.launchManagedBrowser).toHaveBeenCalledWith(
      'http://localhost:4173/',
      false,
      false,
      null,
      { height: 800, width: 800 },
      false,
      expect.any(Object),
      'iwer',
    );
    expect(mocks.registerRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({ aiMode: 'collaborate' }),
    );

    handlers.get('close')?.[0]?.();
  });

  test('keeps agent mode as an explicit headless option', async () => {
    const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
    const httpServer = {
      address: vi.fn(() => ({ port: 4173 })),
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        const eventHandlers = handlers.get(event) ?? [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
      }),
    };
    const managedBrowser = {
      close: vi.fn().mockResolvedValue(undefined),
      onClose: vi.fn(),
    };
    mocks.launchManagedBrowser.mockResolvedValueOnce(managedBrowser);
    const plugin = iwsdkDev({ ai: { mode: 'agent' } });
    plugin.configResolved?.({
      command: 'serve',
      root: '/tmp/iwsdk-ai-agent',
      server: {},
    } as never);
    plugin.configureServer?.({
      config: { server: { port: 4173 } },
      httpServer,
      middlewares: { use: vi.fn() },
      resolvedUrls: {
        local: ['http://localhost:4173/'],
        network: [],
      },
    } as never);

    await handlers.get('listening')?.[0]?.();

    expect(mocks.launchManagedBrowser).toHaveBeenCalledWith(
      'http://localhost:4173/',
      true,
      false,
      { height: 800, width: 800 },
      { height: 800, width: 800 },
      false,
      expect.any(Object),
      'iwer',
    );
    expect(mocks.registerRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({ aiMode: 'agent' }),
    );

    handlers.get('close')?.[0]?.();
  });

  test('launches the managed browser at the clean origin root', async () => {
    const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
    const httpServer = {
      address: vi.fn(() => ({ port: 4173 })),
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        const eventHandlers = handlers.get(event) ?? [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
      }),
    };
    const managedBrowser = {
      close: vi.fn().mockResolvedValue(undefined),
      onClose: vi.fn(),
    };
    mocks.launchManagedBrowser.mockResolvedValueOnce(managedBrowser);
    const plugin = iwsdkDev({ workspace: { enabled: true } });
    plugin.configResolved?.({
      command: 'serve',
      root: '/tmp/iwsdk-workspace-clean-root',
      server: {},
    } as never);
    plugin.configureServer?.({
      config: { server: { port: 4173 } },
      httpServer,
      middlewares: { use: vi.fn() },
      resolvedUrls: {
        local: ['http://localhost:4173/'],
        network: [],
      },
    } as never);

    await handlers.get('listening')?.[0]?.();
    expect(mocks.launchManagedBrowser).toHaveBeenCalledWith(
      'http://localhost:4173/',
      false,
      false,
      null,
      { height: 800, width: 800 },
      false,
      expect.objectContaining({ topLevelPathnames: ['/'] }),
      'workspace',
    );

    await Promise.resolve();
    handlers.get('close')?.[0]?.();
  });

  test('registers no browser startup state when workspace.open is false', async () => {
    const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
    const httpServer = {
      address: vi.fn(() => ({ port: 4173 })),
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        const eventHandlers = handlers.get(event) ?? [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
      }),
    };
    const plugin = iwsdkDev({
      workspace: { enabled: true, open: false },
    });
    plugin.configResolved?.({
      command: 'serve',
      root: '/tmp/iwsdk-workspace-open-false',
      server: {},
    } as never);
    plugin.configureServer?.({
      config: { server: { port: 4173 } },
      httpServer,
      middlewares: { use: vi.fn() },
      resolvedUrls: {
        local: ['http://localhost:4173/'],
        network: [],
      },
    } as never);

    const listening = handlers.get('listening')?.[0];
    expect(listening).toBeDefined();
    await listening?.();

    expect(mocks.registerRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        aiMode: undefined,
        browser: undefined,
        port: 4173,
      }),
    );
    expect(mocks.launchManagedBrowser).not.toHaveBeenCalled();

    handlers.get('close')?.[0]?.();
  });

  test('marks workspace readiness only after editor initialization resolves', async () => {
    const plugin = iwsdkDev({ workspace: { enabled: true } });
    const source = (await plugin.load?.('\0/@iwsdk-editor-runtime')) as string;
    const initStart = source.indexOf('init().then(() => {');
    const ready = source.indexOf('window.__IWSDK_SCENE_EDITOR_READY = true;');

    expect(source).toContain('window.__IWSDK_SCENE_EDITOR_READY = false;');
    expect(initStart).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(initStart);
  });
});
