/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  SceneMaterial,
  SceneProceduralAlbedoTexture,
  SceneProceduralScalarTexture,
} from '@iwsdk/scene-composition';
import { describe, expect, it, vi } from 'vitest';
import {
  createSceneMaterial,
  SceneMaterialPool,
} from '../../src/level/level-scene-material.js';
import {
  DataTexture,
  MeshPhysicalMaterial,
  SRGBColorSpace,
} from '../../src/runtime/index.js';

const ALBEDO: SceneProceduralAlbedoTexture = {
  algorithm: 'periodic-fbm-v1',
  bands: [
    { amplitude: 0.7, frequency: [2, 3] },
    { amplitude: 0.3, frequency: [19, 23] },
  ],
  ramp: [
    { at: 0, color: '#08235f' },
    { at: 1, color: '#304d8c' },
  ],
  resolution: [64, 64],
  sampler: { wrapU: 'repeat', wrapV: 'clamp' },
  seed: 17,
  type: 'procedural',
};

const SCALAR: SceneProceduralScalarTexture = {
  algorithm: 'periodic-fbm-v1',
  bands: [{ amplitude: 1, frequency: [7, 11] }],
  range: [0.2, 0.8],
  resolution: [64, 64],
  seed: 31,
  type: 'procedural',
};

const PHYSICAL: SceneMaterial = {
  anisotropy: 0.35,
  anisotropyRotationDeg: 30,
  attenuationColor: '#ddf4ff',
  attenuationDistance: 4,
  clearcoat: 0.76,
  clearcoatRoughness: 0.18,
  envMapIntensity: 0.78,
  id: 'glaze',
  ior: 1.49,
  model: 'physical',
  sheen: 0.2,
  sheenColor: '#335577',
  sheenRoughness: 0.6,
  specularColor: '#ffffff',
  specularIntensity: 0.9,
  thickness: 0.01,
  transmission: 0.08,
  textures: {
    albedo: ALBEDO,
    emissive: { ...ALBEDO, seed: 19 },
    metalness: { ...SCALAR, seed: 37 },
    roughness: SCALAR,
  },
};

describe('scene physical materials', () => {
  it('instantiates built-in physical PBR with independent deterministic maps', () => {
    const material = createSceneMaterial(PHYSICAL) as MeshPhysicalMaterial;
    expect(material).toBeInstanceOf(MeshPhysicalMaterial);
    expect(material.color.getHexString()).toBe('ffffff');
    expect(material.emissive.getHexString()).toBe('ffffff');
    expect(material.roughness).toBe(1);
    expect(material.metalness).toBe(1);
    expect(material).toMatchObject({
      anisotropy: 0.35,
      attenuationDistance: 4,
      clearcoat: 0.76,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.78,
      ior: 1.49,
      sheen: 0.2,
      sheenRoughness: 0.6,
      specularIntensity: 0.9,
      thickness: 0.01,
      transmission: 0.08,
    });
    expect(material.map).toBeInstanceOf(DataTexture);
    expect(material.map?.colorSpace).toBe(SRGBColorSpace);
    expect(material.roughnessMap).not.toBe(material.metalnessMap);
    expect(material.map?.userData.iwsdkSceneProceduralTexture).toMatchObject({
      algorithm: 'periodic-fbm-v1',
      channel: 'albedo',
      height: 64,
      width: 64,
    });
  });

  it('keeps explicit scalar multipliers while defaulting mapped multipliers to one', () => {
    const explicit = createSceneMaterial({
      ...PHYSICAL,
      baseColor: '#808080',
      emissive: '#202020',
      metalness: 0.4,
      roughness: 0.5,
    }) as MeshPhysicalMaterial;
    expect(explicit.color.getHexString()).toBe('808080');
    expect(explicit.emissive.getHexString()).toBe('202020');
    expect(explicit.metalness).toBe(0.4);
    expect(explicit.roughness).toBe(0.5);
  });

  it('caches by resource id and disposes every material and map exactly once', () => {
    const pool = new SceneMaterialPool();
    const first = pool.get(PHYSICAL) as MeshPhysicalMaterial;
    const second = pool.get(PHYSICAL);
    expect(second).toBe(first);
    const materialDispose = vi.spyOn(first, 'dispose');
    const textureDispose = vi.spyOn(first.map!, 'dispose');
    const rootA = {};
    const rootB = {};
    pool.retain(rootA);
    pool.retain(rootB);
    pool.release(rootA);
    expect(materialDispose).not.toHaveBeenCalled();
    pool.release(rootB);
    pool.dispose();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });
});
