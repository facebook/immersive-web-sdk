/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, expect, test, vi } from 'vitest';
import { MCPRuntime } from '../../src/mcp/mcp-runtime.js';

afterEach(() => vi.useRealTimers());

function runtime(session?: EventTarget & { end(): Promise<void> }) {
  return new MCPRuntime({
    update() {},
    // Exercise the adoption interval before World.session is assigned.
    renderer: { xr: { getSession: () => session } },
  } as any);
}

test('reload waits for the end event even when end() has already resolved', async () => {
  const session = Object.assign(new EventTarget(), {
    end: vi.fn(async () => {}),
  });
  let ready = false;
  const pending = runtime(session)
    .prepareForReload()
    .then(() => {
      ready = true;
    });
  await Promise.resolve();
  await Promise.resolve();
  expect(session.end).toHaveBeenCalledTimes(1);
  expect(ready).toBe(false);
  session.dispatchEvent(new Event('end'));
  await pending;
  expect(ready).toBe(true);
});

test('reload fails boundedly if the device never completes XR teardown', async () => {
  vi.useFakeTimers();
  const session = Object.assign(new EventTarget(), {
    end: vi.fn(async () => {}),
  });
  const pending = expect(runtime(session).prepareForReload()).rejects.toThrow(
    'did not finish ending',
  );
  await vi.advanceTimersByTimeAsync(10000);
  await pending;
});

test('normal non-XR pages need no teardown', async () => {
  await expect(runtime().prepareForReload()).resolves.toBeUndefined();
});

test('reload joins an XR exit already in progress', async () => {
  const session = Object.assign(new EventTarget(), {
    end: vi.fn(async () => {
      throw new DOMException('Already ending', 'InvalidStateError');
    }),
  });
  let ready = false;
  const pending = runtime(session)
    .prepareForReload()
    .then(() => {
      ready = true;
    });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(ready).toBe(false);
  session.dispatchEvent(new Event('end'));
  await pending;
  expect(ready).toBe(true);
});

test('an unrelated XR teardown failure is still reported', async () => {
  const session = Object.assign(new EventTarget(), {
    end: vi.fn(async () => {
      throw new Error('Device failure');
    }),
  });
  await expect(runtime(session).prepareForReload()).rejects.toThrow(
    'Device failure',
  );
});
