/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';

// The runtime barrel pulls in xr-input's cursor-visual.ts, which touches
// `document` at module load; provide a minimal canvas stub before importing.
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

import { CameraSystem } from '../../src/camera/camera-system.js';
import { XRLayerSystem } from '../../src/layers/xr-layer-system.js';
import { Object3D, PerspectiveCamera, Scene } from '../../src/runtime/three.js';

function baseWorld(extra: Record<string, unknown> = {}) {
  return {
    camera: new PerspectiveCamera(),
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer: {},
    scene: new Scene(),
    session: undefined,
    visibilityState: { value: 'non-immersive', subscribe: vi.fn() },
    ...extra,
  };
}

describe('CameraSystem teardown', () => {
  it('unsubscribes from visibilityState on destroy()', () => {
    const unsubscribe = vi.fn();
    const world = baseWorld({
      visibilityState: {
        value: 'non-immersive',
        subscribe: vi.fn(() => unsubscribe),
      },
    });
    const system = new CameraSystem(world as any, {} as any, 0);
    (system as any).queries = { cameras: { entities: [] } };

    system.init();
    expect(world.visibilityState.subscribe).toHaveBeenCalledTimes(1);

    system.destroy();
    // Regression: the subscription was previously not registered, so destroy()
    // (which runs cleanupFuncs) never released it.
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('XRLayerSystem teardown', () => {
  it('unsubscribes query subscriptions and removes xr listeners on destroy()', () => {
    const xr = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const world = baseWorld({ renderer: { xr } });
    const system = new XRLayerSystem(world as any, {} as any, 0);

    const quadQualify = vi.fn();
    const quadDisqualify = vi.fn();
    const cylinderQualify = vi.fn();
    const cylinderDisqualify = vi.fn();
    (system as any).queries = {
      quadLayers: {
        subscribe: vi.fn((event: string) =>
          event === 'qualify' ? quadQualify : quadDisqualify,
        ),
      },
      cylinderLayers: {
        subscribe: vi.fn((event: string) =>
          event === 'qualify' ? cylinderQualify : cylinderDisqualify,
        ),
      },
    };

    system.init();
    system.destroy();

    expect(xr.removeEventListener).toHaveBeenCalledWith(
      'sessionstart',
      expect.any(Function),
    );
    expect(xr.removeEventListener).toHaveBeenCalledWith(
      'sessionend',
      expect.any(Function),
    );
    expect(quadQualify).toHaveBeenCalledTimes(1);
    expect(quadDisqualify).toHaveBeenCalledTimes(1);
    expect(cylinderQualify).toHaveBeenCalledTimes(1);
    expect(cylinderDisqualify).toHaveBeenCalledTimes(1);
  });
});
