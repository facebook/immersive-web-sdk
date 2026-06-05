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

describe('World.destroy', () => {
  it('runs registered cleanup callbacks', () => {
    const world = new World();
    const cleanupA = vi.fn();
    const cleanupB = vi.fn();
    world.addCleanup(cleanupA);
    world.addCleanup(cleanupB);

    world.destroy();

    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(cleanupB).toHaveBeenCalledTimes(1);
  });

  it('destroys every registered system', () => {
    const world = new World();
    const destroyA = vi.fn();
    const destroyB = vi.fn();
    (world as any).getSystems = () => [
      { destroy: destroyA },
      { destroy: destroyB },
    ];

    world.destroy();

    expect(destroyA).toHaveBeenCalledTimes(1);
    expect(destroyB).toHaveBeenCalledTimes(1);
  });

  it('does not run cleanups or system destroys twice across repeated destroy() calls', () => {
    const world = new World();
    const cleanup = vi.fn();
    const systemDestroy = vi.fn();
    (world as any).getSystems = () => [{ destroy: systemDestroy }];
    world.addCleanup(cleanup);

    world.destroy();
    world.destroy();

    expect(cleanup).toHaveBeenCalledTimes(1);
    // Regression: getSystems() returns the same systems each call, so without
    // the destroyed guard the second destroy() would re-run system.destroy().
    expect(systemDestroy).toHaveBeenCalledTimes(1);
  });

  it('continues tearing down even if a system or cleanup throws', () => {
    const world = new World();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const goodSystemDestroy = vi.fn();
    (world as any).getSystems = () => [
      {
        destroy: () => {
          throw new Error('boom');
        },
      },
      { destroy: goodSystemDestroy },
    ];

    const goodCleanup = vi.fn();
    world.addCleanup(() => {
      throw new Error('cleanup boom');
    });
    world.addCleanup(goodCleanup);

    expect(() => world.destroy()).not.toThrow();
    expect(goodSystemDestroy).toHaveBeenCalledTimes(1);
    expect(goodCleanup).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
