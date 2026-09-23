/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test, vi, afterEach } from 'vitest';
import {
  ManagedBrowserLifecycle,
  reduceBrowserLifecycle,
} from '../src/managed-browser/lifecycle.js';

function browser() {
  let closed = false;
  let notify = () => {};
  return {
    close: vi.fn(async () => {
      closed = true;
    }),
    isClosed: () => closed,
    onClose: (fn: () => void) => {
      notify = fn;
    },
    crash: () => {
      closed = true;
      notify();
    },
  };
}
const tick = async () => {
  for (let n = 0; n < 12; n++) {
    await Promise.resolve();
  }
};
afterEach(() => vi.useRealTimers());
describe('managed browser lifecycle', () => {
  test('concurrent requests share an initial launch without reporting recovery', async () => {
    const instance = browser();
    const launch = vi.fn(async () => instance);
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch,
      onChange: vi.fn(),
    });
    const results = await Promise.all(
      Array.from({ length: 24 }, () => controller.ensure()),
    );
    expect(launch).toHaveBeenCalledTimes(1);
    expect(
      results.every(
        (result) => !result.relaunched && result.browser === instance,
      ),
    ).toBe(true);
    expect((await controller.ensure()).relaunched).toBe(false);
    await controller.stop();
    expect(instance.close).toHaveBeenCalledTimes(1);
    expect((await controller.ensure()).browser).toBeNull();
  });
  test('all callers joining a replacement launch report recovery', async () => {
    const first = browser();
    const second = browser();
    const launch = vi
      .fn<() => Promise<ReturnType<typeof browser>>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch,
      onChange: vi.fn(),
    });
    expect(await controller.ensure()).toMatchObject({
      browser: first,
      relaunched: false,
    });
    first.crash();
    await tick();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => controller.ensure()),
    );
    expect(
      results.every((result) => result.relaunched && result.browser === second),
    ).toBe(true);
    expect((await controller.ensure()).relaunched).toBe(false);
    await controller.stop();
  });
  test('does not let a stale lease invalidate a replacement browser', async () => {
    const first = browser();
    const second = browser();
    const launch = vi
      .fn<() => Promise<ReturnType<typeof browser>>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch,
      onChange: vi.fn(),
    });
    await controller.ensure();
    const firstEpoch = controller.snapshot().browserEpoch;
    first.crash();
    await tick();
    await controller.ensure();

    expect(
      controller.invalidateIfCurrent(
        first,
        firstEpoch,
        'Stale runner lease ended.',
      ),
    ).toBe(false);
    expect(controller.current()).toBe(second);
    expect(second.close).not.toHaveBeenCalled();

    await controller.stop();
  });
  test('fences late completion after shutdown and closes exactly once', async () => {
    let resolve!: (value: ReturnType<typeof browser>) => void;
    const instance = browser();
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch: () =>
        new Promise((done) => {
          resolve = done;
        }),
      onChange: vi.fn(),
    });
    const attempt = controller.ensure();
    await tick();
    const stopping = controller.stop();
    resolve(instance);
    await stopping;
    await attempt;
    expect(instance.close).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().state).toBe('stopped');
    expect(controller.current()).toBeNull();
  });
  test('launch timeout blocks replacement until late resource cleanup finishes', async () => {
    vi.useFakeTimers();
    let resolve!: (value: ReturnType<typeof browser>) => void;
    const launch = vi.fn(
      () =>
        new Promise<ReturnType<typeof browser>>((done) => {
          resolve = done;
        }),
    );
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch,
      onChange: vi.fn(),
      launchTimeoutMs: 100,
    });
    const first = controller.ensure();
    await tick();
    await vi.advanceTimersByTimeAsync(100);
    expect((await first).browser).toBeNull();
    expect(controller.snapshot().state).toBe('closing');
    const second = controller.ensure(true);
    await tick();
    expect(launch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2100);
    await second;
    const instance = browser();
    resolve(instance);
    await tick();
    expect(instance.close).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().state).toBe('failed');
    await controller.stop();
  });
  test('rapid crash loops exhaust budget; stable operation alone resets it', async () => {
    vi.useFakeTimers();
    const instances: ReturnType<typeof browser>[] = [];
    const launch = vi.fn(async () => {
      const b = browser();
      instances.push(b);
      return b;
    });
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch,
      onChange: vi.fn(),
      stableMs: 1000,
    });
    for (let n = 0; n < 3; n++) {
      await controller.ensure();
      instances[n].crash();
      await tick();
    }
    expect(controller.snapshot().failures).toBe(3);
    await controller.ensure();
    expect(launch).toHaveBeenCalledTimes(3);
    await controller.ensure(true);
    expect(launch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.snapshot().failures).toBe(0);
    await controller.stop();
  });
  test('status and wait never launch; stale attempt events and stopped state are inert', async () => {
    const launch = vi.fn();
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: false,
      launch,
      onChange: vi.fn(),
    });
    const initial = controller.snapshot();
    await controller.wait(initial.revision, 1);
    await controller.ensure(true);
    expect(launch).not.toHaveBeenCalled();
    expect(
      reduceBrowserLifecycle(
        initial,
        { type: 'running', attemptId: 'stale' },
        Date.now(),
      ),
    ).toBe(initial);
    await controller.stop();
    const stopped = controller.snapshot();
    expect(
      reduceBrowserLifecycle(
        stopped,
        { type: 'launch', attemptId: 'late', timeoutMs: 1 },
        Date.now(),
      ),
    ).toBe(stopped);
  });
  test('unconfirmed close never permits a replacement', async () => {
    const instance = browser();
    instance.close.mockRejectedValue(new Error('close failed'));
    const launch = vi.fn(async () => instance);
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch,
      onChange: vi.fn(),
    });
    await controller.ensure();
    instance.crash();
    await tick();
    await controller.ensure(true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(controller.snapshot()).toMatchObject({
      state: 'failed',
      cleanupConfirmed: false,
      retryEligible: false,
    });
    await expect(controller.stop()).rejects.toThrow('cleanup is unconfirmed');
  });

  test('installation has its own budget and callers return before the transport deadline', async () => {
    vi.useFakeTimers();
    let installed!: () => void;
    const launch = vi.fn(async () => browser());
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch,
      onChange: vi.fn(),
      prepare: () =>
        new Promise<void>((resolve) => {
          installed = resolve;
        }),
      installTimeoutMs: 10000,
      launchTimeoutMs: 2000,
    });
    const first = controller.ensure();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await first).toMatchObject({ browser: null, relaunched: false });
    await vi.advanceTimersByTimeAsync(4000);
    expect(controller.snapshot()).toMatchObject({
      state: 'launching',
      phase: 'installing',
    });
    expect(launch).not.toHaveBeenCalled();
    installed();
    await tick();
    expect(controller.snapshot()).toMatchObject({
      state: 'running',
      browserEpoch: 1,
    });
    await controller.stop();
  });

  test('cleanup deadline is observable, blocks replacement, and allows late confirmed shutdown', async () => {
    vi.useFakeTimers();
    const instance = browser();
    let finish!: () => void;
    instance.close.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const launch = vi.fn(async () => instance);
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch,
      onChange: vi.fn(),
      cleanupTimeoutMs: 100,
    });
    await controller.ensure();
    controller.invalidate('Active command timed out');
    await tick();
    // This must not wait for a stuck browser or consume the caller's timeout.
    expect(await controller.ensure(true)).toMatchObject({ browser: null });
    const stopping = expect(controller.stop()).rejects.toMatchObject({
      code: 'cleanup_unconfirmed',
    });
    await vi.advanceTimersByTimeAsync(100);
    await stopping;
    expect(controller.snapshot()).toMatchObject({
      state: 'failed',
      cleanupConfirmed: false,
      retryEligible: false,
    });
    expect(controller.snapshot().nextAction).toContain(
      'replacement is blocked',
    );
    await controller.ensure(true);
    expect(launch).toHaveBeenCalledTimes(1);
    finish();
    await controller.whenStopped();
    expect(controller.snapshot()).toMatchObject({
      state: 'stopped',
      cleanupConfirmed: true,
    });
  });

  test('status preserves issue time/cause and reports bounded history', async () => {
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch: async () => {
        throw new Error('EACCES: permission denied');
      },
      onChange: vi.fn(),
    });
    await controller.ensure();
    const failed = controller.snapshot();
    controller.observe();
    expect(controller.snapshot()).toMatchObject({
      issueAt: failed.issueAt,
      issueCause: 'permission_denied',
      attemptLimit: 3,
    });
    for (let i = 0; i < 35; i++) {
      await controller.ensure(true);
    }
    expect(controller.snapshot().history).toHaveLength(64);
    expect(controller.snapshot().historyTruncated).toBe(true);
    await controller.stop();
  });

  test('keeps launch timeout classified as a launch failure after cleanup starts', async () => {
    vi.useFakeTimers();
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('launch aborted')),
            { once: true },
          );
        }),
      onChange: vi.fn(),
      launchTimeoutMs: 100,
    });
    const attempt = controller.ensure();
    await vi.advanceTimersByTimeAsync(100);
    await attempt;
    await tick();
    expect(controller.snapshot()).toMatchObject({
      state: 'failed',
      issueCause: 'browser_launch_failed',
    });
    await controller.stop();
  });

  test('classifies unconfirmed launch cleanup as a launch failure', async () => {
    const controller = new ManagedBrowserLifecycle({
      sessionId: 's',
      enabled: true,
      launch: async () => {
        throw Object.assign(new Error('cleanup did not settle'), {
          cleanupConfirmed: false,
        });
      },
      onChange: vi.fn(),
    });
    await controller.ensure();
    expect(controller.snapshot()).toMatchObject({
      state: 'failed',
      cleanupConfirmed: false,
      issueCause: 'browser_launch_failed',
    });
    await expect(controller.stop()).rejects.toMatchObject({
      code: 'cleanup_unconfirmed',
    });
  });
});
