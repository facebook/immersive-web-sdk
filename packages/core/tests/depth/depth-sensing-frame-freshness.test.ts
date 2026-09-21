/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { DepthOccludable } from '../../src/depth/depth-occludable.js';
import { DepthSensingSystem } from '../../src/depth/depth-sensing-system.js';
import {
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector2,
} from '../../src/runtime/index.js';

function createDepthSystem() {
  const binding = { getDepthInformation: vi.fn() };
  const referenceSpace = {};
  const xr = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getBinding: vi.fn(() => binding),
    getFrame: vi.fn(),
    getReferenceSpace: vi.fn(() => referenceSpace),
    getSession: vi.fn(),
  };
  const renderer = {
    getDrawingBufferSize: vi.fn((target: Vector2) => target.set(1024, 1024)),
    xr,
  };
  const world = {
    camera: new PerspectiveCamera(),
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer,
    scene: new Scene(),
    session: undefined,
    visibilityState: { value: 'non-immersive' },
  };
  const system = new DepthSensingSystem(world as any, {} as any, 0);
  (system as any).queries = {
    occludables: {
      entities: new Set(),
      subscribe: vi.fn(() => vi.fn()),
    },
  };
  DepthOccludable.data.mode = [];
  system.init();
  (system as any).depthFeatureEnabled = true;

  return { binding, referenceSpace, renderer, system, xr };
}

function createOcclusionUniforms() {
  return {
    occlusionEnabled: { value: false },
    uDepthNear: { value: 0 },
    uIsGPUDepth: { value: false },
    uMinMaxTexture0: { value: null as unknown },
    uMinMaxTexture1: { value: null as unknown },
    uOcclusionBlurRadius: { value: 0 },
    uOcclusionHardMode: { value: false },
    uOcclusionMinMaxMode: { value: false },
    uRawValueToMeters: { value: 0 },
    uViewportSize: { value: new Vector2() },
    uXRDepthTextureArray: { value: null as unknown },
  };
}

function createCPUDepthData(value: number): XRCPUDepthInformation {
  return {
    data: new Float32Array([value, value, value, value]).buffer,
    height: 2,
    rawValueToMeters: 0.001,
    width: 2,
  } as XRCPUDepthInformation;
}

function createGPUDepthData(value: number): XRWebGLDepthInformation {
  return {
    height: 2,
    rawValueToMeters: 0.001,
    texture: { value },
    width: 2,
  } as unknown as XRWebGLDepthInformation;
}

function attachUniforms(system: DepthSensingSystem) {
  const uniforms = createOcclusionUniforms();
  (system as any).entityShaderMap.set({ index: 1 }, new Set([uniforms]));
  return uniforms;
}

describe('DepthSensingSystem frame freshness', () => {
  it('disables stale CPU depth on loss and recovers on a later complete sample', () => {
    const { system, xr } = createDepthSystem();
    const views = [{ eye: 'left' }, { eye: 'right' }] as XRView[];
    const first = [createCPUDepthData(1), createCPUDepthData(2)];
    const recovered = [createCPUDepthData(3), createCPUDepthData(4)];
    const getDepthInformation = vi
      .fn()
      .mockReturnValueOnce(first[0])
      .mockReturnValueOnce(first[1])
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(recovered[0])
      .mockReturnValueOnce(recovered[1]);
    const frame = {
      getDepthInformation,
      getViewerPose: vi.fn(() => ({ views })),
      session: { depthUsage: 'cpu-optimized' },
    } as unknown as XRFrame;
    const rawTexture = { name: 'cpu-depth' };
    const depthTextures = (system as any).depthTextures;
    const updateData = vi
      .spyOn(depthTextures, 'updateData')
      .mockImplementation(() => {});
    vi.spyOn(depthTextures, 'getDataArrayTexture').mockReturnValue(
      rawTexture as any,
    );
    const dispose = vi.spyOn(depthTextures, 'dispose');
    const preprocess = vi.spyOn(system as any, 'runMinMaxPreprocessing');
    const uniforms = attachUniforms(system);
    xr.getFrame.mockReturnValue(frame);
    xr.getSession.mockReturnValue({ depthUsage: 'cpu-optimized' });

    system.update();
    expect((system as any).hasCurrentFrameDepthData).toBe(true);
    expect((system as any).cpuDepthData).toEqual(first);
    expect(updateData).toHaveBeenCalledTimes(2);
    expect(uniforms.occlusionEnabled.value).toBe(true);
    expect(uniforms.uXRDepthTextureArray.value).toBe(rawTexture);
    expect(preprocess).toHaveBeenCalledTimes(1);

    uniforms.uMinMaxTexture0.value = { name: 'stale-min-max-0' };
    uniforms.uMinMaxTexture1.value = { name: 'stale-min-max-1' };
    system.update();
    expect((system as any).hasCurrentFrameDepthData).toBe(false);
    expect((system as any).cpuDepthData).toEqual([]);
    expect(updateData).toHaveBeenCalledTimes(2);
    expect(uniforms.occlusionEnabled.value).toBe(false);
    expect(uniforms.uXRDepthTextureArray.value).toBeNull();
    expect(uniforms.uMinMaxTexture0.value).toBeNull();
    expect(uniforms.uMinMaxTexture1.value).toBeNull();
    expect(preprocess).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    system.update();
    expect((system as any).hasCurrentFrameDepthData).toBe(true);
    expect((system as any).cpuDepthData).toEqual(recovered);
    expect(updateData).toHaveBeenCalledTimes(4);
    expect(uniforms.occlusionEnabled.value).toBe(true);
    expect(uniforms.uXRDepthTextureArray.value).toBe(rawTexture);
    expect(preprocess).toHaveBeenCalledTimes(2);
  });

  it('commits CPU depth only after every view has a current sample', () => {
    const { system, xr } = createDepthSystem();
    const views = [{ eye: 'left' }, { eye: 'right' }] as XRView[];
    const initial = [createCPUDepthData(1), createCPUDepthData(2)];
    const partial = createCPUDepthData(3);
    const getDepthInformation = vi
      .fn()
      .mockReturnValueOnce(initial[0])
      .mockReturnValueOnce(initial[1])
      .mockReturnValueOnce(partial)
      .mockReturnValueOnce(null);
    const frame = {
      getDepthInformation,
      getViewerPose: vi.fn(() => ({ views })),
      session: { depthUsage: 'cpu-optimized' },
    } as unknown as XRFrame;
    const rawTexture = { name: 'cpu-depth' };
    const depthTextures = (system as any).depthTextures;
    const updateData = vi
      .spyOn(depthTextures, 'updateData')
      .mockImplementation(() => {});
    vi.spyOn(depthTextures, 'getDataArrayTexture').mockReturnValue(
      rawTexture as any,
    );
    const preprocess = vi.spyOn(system as any, 'runMinMaxPreprocessing');
    const uniforms = attachUniforms(system);
    xr.getFrame.mockReturnValue(frame);
    xr.getSession.mockReturnValue({ depthUsage: 'cpu-optimized' });

    system.update();
    expect(updateData).toHaveBeenCalledTimes(2);
    expect(uniforms.occlusionEnabled.value).toBe(true);

    system.update();
    expect(getDepthInformation).toHaveBeenCalledTimes(4);
    expect(updateData).toHaveBeenCalledTimes(2);
    expect((system as any).cpuDepthData).toEqual([]);
    expect((system as any).hasCurrentFrameDepthData).toBe(false);
    expect(uniforms.occlusionEnabled.value).toBe(false);
    expect(uniforms.uXRDepthTextureArray.value).toBeNull();
    expect(preprocess).toHaveBeenCalledTimes(1);
  });

  it('disables stale GPU depth on loss and recovers on a later sample', () => {
    const { binding, system, xr } = createDepthSystem();
    const view = { eye: 'left' } as XRView;
    const first = createGPUDepthData(1);
    const recovered = createGPUDepthData(2);
    binding.getDepthInformation
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(recovered);
    const frame = {
      getViewerPose: vi.fn(() => ({ views: [view] })),
      session: { depthUsage: 'gpu-optimized' },
    } as unknown as XRFrame;
    const rawTexture = { name: 'gpu-depth' };
    const depthTextures = (system as any).depthTextures;
    const updateNativeTexture = vi
      .spyOn(depthTextures, 'updateNativeTexture')
      .mockImplementation(() => {});
    vi.spyOn(depthTextures, 'getNativeTexture').mockReturnValue(
      rawTexture as any,
    );
    const dispose = vi.spyOn(depthTextures, 'dispose');
    const preprocess = vi.spyOn(system as any, 'runMinMaxPreprocessing');
    const uniforms = attachUniforms(system);
    xr.getFrame.mockReturnValue(frame);
    xr.getSession.mockReturnValue({ depthUsage: 'gpu-optimized' });

    system.update();
    expect((system as any).hasCurrentFrameDepthData).toBe(true);
    expect((system as any).gpuDepthData).toEqual([first]);
    expect(updateNativeTexture).toHaveBeenCalledTimes(1);
    expect(uniforms.occlusionEnabled.value).toBe(true);
    expect(uniforms.uXRDepthTextureArray.value).toBe(rawTexture);
    expect(preprocess).toHaveBeenCalledTimes(1);

    uniforms.uMinMaxTexture0.value = { name: 'stale-min-max-0' };
    uniforms.uMinMaxTexture1.value = { name: 'stale-min-max-1' };
    system.update();
    expect((system as any).hasCurrentFrameDepthData).toBe(false);
    expect((system as any).gpuDepthData).toEqual([]);
    expect(updateNativeTexture).toHaveBeenCalledTimes(1);
    expect(uniforms.occlusionEnabled.value).toBe(false);
    expect(uniforms.uXRDepthTextureArray.value).toBeNull();
    expect(uniforms.uMinMaxTexture0.value).toBeNull();
    expect(uniforms.uMinMaxTexture1.value).toBeNull();
    expect(preprocess).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    system.update();
    expect((system as any).hasCurrentFrameDepthData).toBe(true);
    expect((system as any).gpuDepthData).toEqual([recovered]);
    expect(updateNativeTexture).toHaveBeenCalledTimes(2);
    expect(uniforms.occlusionEnabled.value).toBe(true);
    expect(uniforms.uXRDepthTextureArray.value).toBe(rawTexture);
    expect(preprocess).toHaveBeenCalledTimes(2);
  });
});
