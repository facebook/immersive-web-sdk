/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { DepthSensingSystem } from '../../src/depth/depth-sensing-system.js';
import { Object3D, PerspectiveCamera, Scene } from '../../src/runtime/index.js';

function createDepthSystem() {
  const xr = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getSession: vi.fn(() => null),
    getFrame: vi.fn(() => null),
  };
  const world = {
    camera: new PerspectiveCamera(),
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer: { xr },
    scene: new Scene(),
    session: undefined,
    visibilityState: { value: 'non-immersive' },
  };

  const system = new DepthSensingSystem(world as any, {} as any, 0);

  // Queries are normally wired by elics on registration; stub the one query
  // init() subscribes to, capturing the unsubscribe handles.
  const unsubscribeQualify = vi.fn();
  const unsubscribeDisqualify = vi.fn();
  const subscribe = vi.fn((event: string) =>
    event === 'qualify' ? unsubscribeQualify : unsubscribeDisqualify,
  );
  (system as any).queries = {
    occludables: { subscribe, entities: new Set() },
  };

  system.init();
  return { system, xr, unsubscribeQualify, unsubscribeDisqualify };
}

describe('DepthSensingSystem teardown', () => {
  it('creates depthTextures eagerly (enableDepthTexture defaults on)', () => {
    const { system } = createDepthSystem();
    expect((system as any).depthTextures).toBeDefined();
  });

  it('disposes depthTextures and clears the reference on destroy()', () => {
    const { system } = createDepthSystem();
    const depthTextures = (system as any).depthTextures;
    const disposeSpy = vi.spyOn(depthTextures, 'dispose');

    system.destroy();

    // Regression: destroy() previously left depthTextures allocated, leaking
    // its GPU-backed DataArrayTexture when the system was torn down.
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect((system as any).depthTextures).toBeUndefined();
  });

  it('unsubscribes query subscriptions on destroy()', () => {
    const { system, unsubscribeQualify, unsubscribeDisqualify } =
      createDepthSystem();

    system.destroy();

    expect(unsubscribeQualify).toHaveBeenCalledTimes(1);
    expect(unsubscribeDisqualify).toHaveBeenCalledTimes(1);
  });

  it('removes the xr session listeners it added on destroy()', () => {
    const { system, xr } = createDepthSystem();

    expect(xr.addEventListener).toHaveBeenCalledWith(
      'sessionstart',
      expect.any(Function),
    );
    expect(xr.addEventListener).toHaveBeenCalledWith(
      'sessionend',
      expect.any(Function),
    );

    system.destroy();

    expect(xr.removeEventListener).toHaveBeenCalledWith(
      'sessionstart',
      expect.any(Function),
    );
    expect(xr.removeEventListener).toHaveBeenCalledWith(
      'sessionend',
      expect.any(Function),
    );
  });
});
