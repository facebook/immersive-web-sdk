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

  it('clears session-owned shader textures before disposing them on session end', () => {
    const { system, xr } = createDepthSystem();
    const depthTexture = { name: 'depth' };
    const minMaxTexture0 = { name: 'min-max-0' };
    const minMaxTexture1 = { name: 'min-max-1' };
    const uniforms = {
      occlusionEnabled: { value: true },
      uXRDepthTextureArray: { value: depthTexture },
      uMinMaxTexture0: { value: minMaxTexture0 },
      uMinMaxTexture1: { value: minMaxTexture1 },
    };
    const dispose = vi.fn();

    (system as any).entityShaderMap.set({}, new Set([uniforms]));
    (system as any).preprocessingPass = { dispose };
    (system as any).cpuDepthData = [{ rawValueToMeters: 1 }];
    (system as any).gpuDepthData = [{ rawValueToMeters: 1 }];

    const sessionEnd = xr.addEventListener.mock.calls.find(
      ([event]) => event === 'sessionend',
    )?.[1] as (() => void) | undefined;
    expect(sessionEnd).toBeDefined();
    sessionEnd?.();

    expect(uniforms.occlusionEnabled.value).toBe(false);
    expect(uniforms.uXRDepthTextureArray.value).toBeNull();
    expect(uniforms.uMinMaxTexture0.value).toBeNull();
    expect(uniforms.uMinMaxTexture1.value).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect((system as any).preprocessingPass).toBeUndefined();
    expect((system as any).cpuDepthData).toEqual([]);
    expect((system as any).gpuDepthData).toEqual([]);
  });

  it('clears session-owned shader textures when an occludable is removed', () => {
    const { system } = createDepthSystem();
    const depthTexture = { name: 'depth' };
    const minMaxTexture0 = { name: 'min-max-0' };
    const minMaxTexture1 = { name: 'min-max-1' };
    const uniforms = {
      occlusionEnabled: { value: true },
      uXRDepthTextureArray: { value: depthTexture },
      uMinMaxTexture0: { value: minMaxTexture0 },
      uMinMaxTexture1: { value: minMaxTexture1 },
    };
    const entity = {};

    (system as any).entityShaderMap.set(entity, new Set([uniforms]));
    (system as any).detachOcclusionFromEntity(entity);

    expect(uniforms.occlusionEnabled.value).toBe(false);
    expect(uniforms.uXRDepthTextureArray.value).toBeNull();
    expect(uniforms.uMinMaxTexture0.value).toBeNull();
    expect(uniforms.uMinMaxTexture1.value).toBeNull();
    expect((system as any).entityShaderMap.has(entity)).toBe(false);
  });

  it('clears session-owned shader textures before system teardown', () => {
    const { system } = createDepthSystem();
    const depthTexture = { name: 'depth' };
    const minMaxTexture0 = { name: 'min-max-0' };
    const minMaxTexture1 = { name: 'min-max-1' };
    const uniforms = {
      occlusionEnabled: { value: true },
      uXRDepthTextureArray: { value: depthTexture },
      uMinMaxTexture0: { value: minMaxTexture0 },
      uMinMaxTexture1: { value: minMaxTexture1 },
    };
    const depthTextures = (system as any).depthTextures;
    const depthDispose = vi.spyOn(depthTextures, 'dispose');
    const preprocessingDispose = vi.fn();

    (system as any).entityShaderMap.set({}, new Set([uniforms]));
    (system as any).preprocessingPass = { dispose: preprocessingDispose };

    system.destroy();

    expect(uniforms.occlusionEnabled.value).toBe(false);
    expect(uniforms.uXRDepthTextureArray.value).toBeNull();
    expect(uniforms.uMinMaxTexture0.value).toBeNull();
    expect(uniforms.uMinMaxTexture1.value).toBeNull();
    expect(depthDispose).toHaveBeenCalledTimes(1);
    expect((system as any).depthTextures).toBeUndefined();
    expect(preprocessingDispose).toHaveBeenCalledTimes(1);
    expect((system as any).preprocessingPass).toBeUndefined();
  });

  it('does not reuse a previous session texture before a fresh depth sample', () => {
    const { system, xr } = createDepthSystem();
    const staleTexture = { name: 'stale-depth' };
    const uniforms = {
      occlusionEnabled: { value: true },
      uXRDepthTextureArray: { value: staleTexture },
      uMinMaxTexture0: { value: { name: 'stale-min-max-0' } },
      uMinMaxTexture1: { value: { name: 'stale-min-max-1' } },
    };
    const depthTextures = (system as any).depthTextures;
    const getNativeTexture = vi
      .spyOn(depthTextures, 'getNativeTexture')
      .mockReturnValue(staleTexture as any);

    (system as any).entityShaderMap.set({}, new Set([uniforms]));
    (system as any).gpuDepthData = [{ rawValueToMeters: 1 }];
    (system as any).hasCurrentFrameDepthData = true;

    const sessionEnd = xr.addEventListener.mock.calls.find(
      ([event]) => event === 'sessionend',
    )?.[1] as (() => void) | undefined;
    const sessionStart = xr.addEventListener.mock.calls.find(
      ([event]) => event === 'sessionstart',
    )?.[1] as (() => void) | undefined;
    expect(sessionEnd).toBeDefined();
    expect(sessionStart).toBeDefined();

    sessionEnd?.();
    (xr.getSession as any).mockReturnValue({
      enabledFeatures: ['depth-sensing'],
      depthUsage: 'gpu-optimized',
    });
    sessionStart?.();

    getNativeTexture.mockClear();
    expect((system as any).hasCurrentFrameDepthData).toBe(false);
    expect((system as any).getDepthTextureArray()).toBeUndefined();
    (system as any).updateOcclusionUniforms();

    expect(getNativeTexture).not.toHaveBeenCalled();
    expect(uniforms.occlusionEnabled.value).toBe(false);
    expect(uniforms.uXRDepthTextureArray.value).toBeNull();
    expect(uniforms.uMinMaxTexture0.value).toBeNull();
    expect(uniforms.uMinMaxTexture1.value).toBeNull();
  });

  it('resets stale depth state when a replacement session starts', () => {
    const { system, xr } = createDepthSystem();
    const staleTexture = { name: 'stale-depth' };
    const uniforms = {
      occlusionEnabled: { value: true },
      uXRDepthTextureArray: { value: staleTexture },
      uMinMaxTexture0: { value: { name: 'stale-min-max-0' } },
      uMinMaxTexture1: { value: { name: 'stale-min-max-1' } },
    };
    const preprocessingDispose = vi.fn();

    (system as any).entityShaderMap.set({}, new Set([uniforms]));
    (system as any).gpuDepthData = [{ rawValueToMeters: 1 }];
    (system as any).hasCurrentFrameDepthData = true;
    (system as any).preprocessingPass = { dispose: preprocessingDispose };
    (xr.getSession as any).mockReturnValue({
      enabledFeatures: ['depth-sensing'],
      depthUsage: 'gpu-optimized',
    });

    const sessionStart = xr.addEventListener.mock.calls.find(
      ([event]) => event === 'sessionstart',
    )?.[1] as (() => void) | undefined;
    expect(sessionStart).toBeDefined();
    sessionStart?.();

    expect((system as any).hasCurrentFrameDepthData).toBe(false);
    expect((system as any).gpuDepthData).toEqual([]);
    expect((system as any).getDepthTextureArray()).toBeUndefined();
    expect(uniforms.occlusionEnabled.value).toBe(false);
    expect(uniforms.uXRDepthTextureArray.value).toBeNull();
    expect(uniforms.uMinMaxTexture0.value).toBeNull();
    expect(uniforms.uMinMaxTexture1.value).toBeNull();
    expect(preprocessingDispose).toHaveBeenCalledTimes(1);
    expect((system as any).depthFeatureEnabled).toBe(true);
  });
  it('keeps CPU depth unavailable when the first sample has no depth data', () => {
    const { system, xr } = createDepthSystem();
    const views = [{ eye: 'left' }, { eye: 'right' }] as XRView[];
    const getDepthInformation = vi.fn(() => null);
    const referenceSpace = {};
    (xr as any).getBinding = vi.fn(() => ({}));
    (xr as any).getReferenceSpace = vi.fn(() => referenceSpace);
    const frame = {
      getDepthInformation,
      getViewerPose: vi.fn(() => ({ views })),
      session: { depthUsage: 'cpu-optimized' },
    } as unknown as XRFrame;

    expect((system as any).hasCurrentFrameDepthData).toBe(false);
    (system as any).updateLocalDepth(frame);

    expect(getDepthInformation).toHaveBeenCalledTimes(1);
    expect(getDepthInformation).toHaveBeenCalledWith(views[0]);
    expect((system as any).cpuDepthData).toEqual([]);
    expect((system as any).hasCurrentFrameDepthData).toBe(false);
    expect((system as any).getDepthTextureArray()).toBeUndefined();
  });
});
