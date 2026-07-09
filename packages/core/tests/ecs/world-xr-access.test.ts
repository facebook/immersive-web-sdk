/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { World } from '../../src/ecs/world.js';

// world.ts -> @iwsdk/xr-input -> cursor-visual.ts touches `document` at module
// load; provide a minimal canvas stub before importing.
vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        arc: () => {},
        beginPath: () => {},
        clearRect: () => {},
        fill: () => {},
        fillStyle: '',
        lineWidth: 0,
        stroke: () => {},
        strokeStyle: '',
      }),
      height: 0,
      width: 0,
    }),
  };
});

/** Build a World with a stubbed renderer.xr (WebXRManager) and optional session. */
function makeWorld(opts?: {
  frame?: unknown;
  referenceSpace?: unknown;
  session?: unknown;
}) {
  const world = new World();
  (world as any).renderer = {
    xr: {
      getFrame: () => opts?.frame ?? null,
      getReferenceSpace: () => opts?.referenceSpace ?? null,
    },
  };
  if (opts?.session !== undefined) {
    world.session = opts.session as XRSession;
  }
  return world;
}

describe('World XR userland access (issue #13)', () => {
  it('xrSession aliases world.session', () => {
    const world = makeWorld();
    expect(world.xrSession).toBeUndefined();
    const session = {} as XRSession;
    world.session = session;
    expect(world.xrSession).toBe(session);
  });

  it('xrFrame / xrReferenceSpace are null without a renderer', () => {
    const world = new World();
    expect(world.xrFrame).toBeNull();
    expect(world.xrReferenceSpace).toBeNull();
  });

  it('xrFrame / xrReferenceSpace read live from renderer.xr', () => {
    const frame = { id: 'frame' };
    const referenceSpace = { id: 'space' };
    const world = makeWorld({ frame, referenceSpace });
    expect(world.xrFrame).toBe(frame);
    expect(world.xrReferenceSpace).toBe(referenceSpace);
  });

  it('onXRFrame invokes registered callbacks with (frame, delta, time)', () => {
    const world = new World();
    const cb = vi.fn();
    world.onXRFrame(cb);

    const frame = {} as XRFrame;
    world.runXRFrameCallbacks(frame, 0.016, 1.5);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(frame, 0.016, 1.5);
  });

  it('onXRFrame returns an unsubscribe that stops further callbacks', () => {
    const world = new World();
    const cb = vi.fn();
    const stop = world.onXRFrame(cb);

    world.runXRFrameCallbacks({} as XRFrame, 0, 0);
    stop();
    world.runXRFrameCallbacks({} as XRFrame, 0, 0);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('one throwing callback does not block the others', () => {
    const world = new World();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const good = vi.fn();
    world.onXRFrame(() => {
      throw new Error('boom');
    });
    world.onXRFrame(good);

    expect(() => world.runXRFrameCallbacks({} as XRFrame, 0, 0)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('requestHitTestSource returns undefined without an active session', async () => {
    const world = makeWorld();
    await expect(
      world.requestHitTestSource({} as XRHitTestOptionsInit),
    ).resolves.toBeUndefined();
  });

  it('requestHitTestSource delegates to the active session', async () => {
    const source = { id: 'hit-source' };
    const requestHitTestSource = vi.fn().mockResolvedValue(source);
    const world = makeWorld({ session: { requestHitTestSource } });
    const options = { space: {} } as unknown as XRHitTestOptionsInit;

    await expect(world.requestHitTestSource(options)).resolves.toBe(source);
    expect(requestHitTestSource).toHaveBeenCalledWith(options);
  });

  it('requestHitTestSource surfaces a rejection as undefined (not a throw)', async () => {
    // XRSession.requestHitTestSource rejects when the hit-test feature was not
    // granted; the helper must honor its documented undefined-on-unavailable
    // contract instead of propagating the rejection.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const requestHitTestSource = vi
      .fn()
      .mockRejectedValue(new Error('feature not enabled'));
    const world = makeWorld({ session: { requestHitTestSource } });

    await expect(
      world.requestHitTestSource({} as XRHitTestOptionsInit),
    ).resolves.toBeUndefined();
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('requestHitTestSourceForTransientInput surfaces a rejection as undefined', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new Error('feature not enabled'));
    const world = makeWorld({
      session: { requestHitTestSourceForTransientInput: fn },
    });

    await expect(
      world.requestHitTestSourceForTransientInput(
        {} as XRTransientInputHitTestOptionsInit,
      ),
    ).resolves.toBeUndefined();
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('requestHitTestSourceForTransientInput delegates / guards', async () => {
    const world = makeWorld();
    await expect(
      world.requestHitTestSourceForTransientInput(
        {} as XRTransientInputHitTestOptionsInit,
      ),
    ).resolves.toBeUndefined();

    const source = { id: 'transient' };
    const fn = vi.fn().mockResolvedValue(source);
    const world2 = makeWorld({
      session: { requestHitTestSourceForTransientInput: fn },
    });
    await expect(
      world2.requestHitTestSourceForTransientInput(
        {} as XRTransientInputHitTestOptionsInit,
      ),
    ).resolves.toBe(source);
  });

  it('getHitTestResults returns [] without a frame and delegates with one', () => {
    const empty = makeWorld();
    expect(empty.getHitTestResults({} as XRHitTestSource)).toEqual([]);

    const results = [{ id: 'r' }];
    const getHitTestResults = vi.fn().mockReturnValue(results);
    const world = makeWorld({ frame: { getHitTestResults } });
    const source = {} as XRHitTestSource;
    expect(world.getHitTestResults(source)).toBe(results);
    expect(getHitTestResults).toHaveBeenCalledWith(source);
  });
});
