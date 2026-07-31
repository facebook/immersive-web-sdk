/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { launchXR } from '../../src/init/xr.js';

// xr.ts -> runtime barrel -> xr-input cursor-visual.ts touches `document` at
// module load; provide a minimal canvas stub before importing.
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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createWorld() {
  return {
    camera: {},
    renderer: {
      xr: {
        enabled: false,
        getDepthSensingMesh: () => null,
        setReferenceSpaceType: () => {},
        setSession: async () => {},
      },
    },
    scene: { userData: {} },
    session: undefined,
    xrDefaults: undefined,
  } as any;
}

describe('launchXR', () => {
  let savedNavigator: PropertyDescriptor | undefined;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (savedNavigator) {
      Object.defineProperty(globalThis, 'navigator', savedNavigator);
    } else {
      delete (globalThis as any).navigator;
    }
    consoleError.mockRestore();
  });

  it('handles a rejected requestSession instead of leaving an unhandled rejection', async () => {
    const error = new Error('user denied');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { xr: { requestSession: vi.fn().mockRejectedValue(error) } },
    });

    const world = createWorld();
    expect(() => launchXR(world)).not.toThrow();
    await flush();

    expect(consoleError).toHaveBeenCalledWith(
      '[XR] Failed to start XR session:',
      error,
    );
    // Session was never established.
    expect(world.session).toBeUndefined();
  });

  it('does not throw synchronously when navigator.xr is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });

    const world = createWorld();
    // Pre-fix this threw "Cannot read properties of undefined (reading 'then')".
    expect(() => launchXR(world)).not.toThrow();
    await flush();
    expect(world.session).toBeUndefined();
  });
});
