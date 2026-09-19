/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { ManagedBrowserCommandCoordinator } from '../src/managed-browser/command-lock.js';

const mocks = vi.hoisted(() => ({
  getApplicationMetadata: vi.fn().mockResolvedValue({
    generation: 1,
    id: 'app',
    outerUrl: 'http://localhost:5173/',
    url: 'http://localhost:5173/',
    workspaceFramed: false,
  }),
  resolveApplicationFrame: vi.fn(),
  restoreWorkspaceView: vi.fn().mockResolvedValue(undefined),
  showWorkspaceRuntime: vi
    .fn()
    .mockResolvedValue({ isWorkspace: false, previousView: null }),
}));

vi.mock('../src/managed-browser/application-surface.js', async () => ({
  ...(await vi.importActual('../src/managed-browser/application-surface.js')),
  getApplicationMetadata: mocks.getApplicationMetadata,
  resolveApplicationFrame: mocks.resolveApplicationFrame,
  restoreWorkspaceView: mocks.restoreWorkspaceView,
  showWorkspaceRuntime: mocks.showWorkspaceRuntime,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrowserProfiler lifecycle', () => {
  test('cancels a profile start that races browser close without leaking a timer', async () => {
    const frame = { evaluate: vi.fn().mockResolvedValue(undefined) };
    mocks.resolveApplicationFrame.mockResolvedValue(frame);
    const cdp = {
      detach: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue({}),
    };
    let finishCdp!: (value: typeof cdp) => void;
    const context = {
      newCDPSession: vi.fn(
        () =>
          new Promise((resolve) => {
            finishCdp = resolve;
          }),
      ),
      tracing: {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
      },
    };
    const coordinator = new ManagedBrowserCommandCoordinator(async () => {});
    const { BrowserProfiler } = await import(
      '../src/managed-browser/profiling.js'
    );
    const profiler = new BrowserProfiler(
      { mainFrame: () => frame, url: () => 'http://localhost:5173/' } as never,
      context as never,
      process.cwd(),
      coordinator,
      (value) => value,
    );

    const start = profiler.start({ action: 'start', maxDurationMs: 60_000 });
    await vi.waitFor(() => expect(context.newCDPSession).toHaveBeenCalled());
    profiler.handleBrowserClose();
    finishCdp(cdp);

    await expect(start).rejects.toThrow(
      'Managed browser closed while starting the profile',
    );
    expect(cdp.detach).toHaveBeenCalledOnce();
  });

  test('does not let an active profile timeout keep Node alive', async () => {
    const frame = { evaluate: vi.fn().mockResolvedValue(undefined) };
    mocks.resolveApplicationFrame.mockResolvedValue(frame);
    const cdp = {
      detach: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue({}),
    };
    const context = {
      newCDPSession: vi.fn().mockResolvedValue(cdp),
      tracing: {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
      },
    };
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const coordinator = new ManagedBrowserCommandCoordinator(async () => {});
    const { BrowserProfiler } = await import(
      '../src/managed-browser/profiling.js'
    );
    const profiler = new BrowserProfiler(
      { mainFrame: () => frame, url: () => 'http://localhost:5173/' } as never,
      context as never,
      process.cwd(),
      coordinator,
      (value) => value,
    );

    await profiler.start({ action: 'start', maxDurationMs: 60_000 });
    const timer = timeoutSpy.mock.results.at(-1)?.value as
      | NodeJS.Timeout
      | undefined;

    expect(timer?.hasRef()).toBe(false);
    profiler.handleBrowserClose();
  });
});
