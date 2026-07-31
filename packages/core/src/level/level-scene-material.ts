/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  generateSceneProceduralTexture,
  type SceneMaterial,
  type SceneMaterialTextures,
  type SceneProceduralTextureDescriptor,
  type SceneProceduralTextureChannel,
} from '@iwsdk/scene-composition';
import {
  BackSide,
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Material,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
} from '../runtime/index.js';

const MATERIAL_TEXTURE_PROPERTIES = [
  'map',
  'emissiveMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'alphaMap',
  'normalMap',
  'bumpMap',
] as const;

/** One immutable Three.js material instance per declared resource ID. */
export class SceneMaterialPool {
  private readonly materials = new Map<string, Material>();
  private readonly roots = new Set<object>();
  private disposed = false;

  get(spec: SceneMaterial): Material {
    if (this.disposed) {
      throw new Error(
        'Cannot resolve a material from a disposed scene material pool',
      );
    }
    const existing = this.materials.get(spec.id);
    if (existing != null) {
      return existing;
    }
    const material = createSceneMaterial(spec);
    material.userData.iwsdkSceneMaterialPooled = true;
    this.materials.set(spec.id, material);
    return material;
  }

  retain(root: object): void {
    if (!this.disposed) {
      this.roots.add(root);
    }
  }

  release(root: object): void {
    this.roots.delete(root);
    if (this.roots.size === 0) {
      this.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const textures = new Set<Texture>();
    for (const material of this.materials.values()) {
      collectSceneMaterialTextures(material, textures);
      material.dispose();
    }
    for (const texture of textures) {
      texture.dispose();
    }
    this.materials.clear();
    this.roots.clear();
  }
}

/** Build a Three.js built-in material from a closed scene material resource. */
export function createSceneMaterial(spec: SceneMaterial): Material {
  const opacity = spec.opacity ?? 1;
  const textures = 'textures' in spec ? spec.textures : undefined;
  const generated = createMaterialTextures(spec.id, textures);
  const common = {
    ...(generated.alpha == null ? {} : { alphaMap: generated.alpha }),
    color: spec.baseColor ?? (generated.albedo == null ? '#8aa0ad' : '#ffffff'),
    ...(generated.albedo == null ? {} : { map: generated.albedo }),
    opacity,
    side: resolveMaterialSide(spec.side),
    transparent: opacity < 1 || generated.alpha != null,
  };
  let material: Material;
  if (spec.model === 'basic') {
    material = new MeshBasicMaterial(common);
  } else {
    const pbr = {
      ...common,
      ...(generated.ambientOcclusion == null
        ? {}
        : { aoMap: generated.ambientOcclusion }),
      ...(generated.bump == null
        ? {}
        : { bumpMap: generated.bump, bumpScale: textures?.bump?.scale ?? 1 }),
      emissive:
        spec.emissive ?? (generated.emissive == null ? '#000000' : '#ffffff'),
      emissiveIntensity: spec.emissiveIntensity ?? 1,
      ...(generated.emissive == null
        ? {}
        : { emissiveMap: generated.emissive }),
      flatShading: spec.flatShading ?? false,
      metalness: spec.metalness ?? (generated.metalness == null ? 0 : 1),
      ...(generated.metalness == null
        ? {}
        : { metalnessMap: generated.metalness }),
      ...(generated.normal == null
        ? {}
        : {
            normalMap: generated.normal,
            normalScale: new Vector2(...(textures?.normal?.scale ?? [1, 1])),
          }),
      roughness: spec.roughness ?? (generated.roughness == null ? 0.7 : 1),
      ...(generated.roughness == null
        ? {}
        : { roughnessMap: generated.roughness }),
    };
    material =
      spec.model === 'physical'
        ? new MeshPhysicalMaterial({
            ...pbr,
            anisotropy: spec.anisotropy ?? 0,
            anisotropyRotation:
              ((spec.anisotropyRotationDeg ?? 0) * Math.PI) / 180,
            attenuationColor: spec.attenuationColor ?? '#ffffff',
            attenuationDistance: spec.attenuationDistance ?? Infinity,
            clearcoat: spec.clearcoat ?? 0,
            clearcoatRoughness: spec.clearcoatRoughness ?? 0,
            envMapIntensity: spec.envMapIntensity ?? 1,
            ior: spec.ior ?? 1.5,
            sheen: spec.sheen ?? 0,
            sheenColor: spec.sheenColor ?? '#000000',
            sheenRoughness: spec.sheenRoughness ?? 1,
            specularColor: spec.specularColor ?? '#ffffff',
            specularIntensity: spec.specularIntensity ?? 1,
            thickness: spec.thickness ?? 0,
            transmission: spec.transmission ?? 0,
          })
        : new MeshStandardMaterial(pbr);
  }
  material.name = spec.id;
  material.userData.iwsdkSceneMaterialId = spec.id;
  material.userData.iwsdkSceneMaterialModel = spec.model;
  return material;
}

export function disposeStandaloneSceneMaterial(material: Material): void {
  if (material.userData.iwsdkSceneMaterialPooled === true) {
    return;
  }
  const textures = new Set<Texture>();
  collectSceneMaterialTextures(material, textures);
  material.dispose();
  for (const texture of textures) {
    texture.dispose();
  }
}

function createMaterialTextures(
  materialId: string,
  textures: SceneMaterialTextures | undefined,
): Partial<Record<SceneProceduralTextureChannel, DataTexture>> {
  const result: Partial<Record<SceneProceduralTextureChannel, DataTexture>> =
    {};
  if (textures == null) {
    return result;
  }
  for (const [channel, descriptor] of Object.entries(textures) as [
    SceneProceduralTextureChannel,
    SceneProceduralTextureDescriptor | undefined,
  ][]) {
    if (descriptor == null) {
      continue;
    }
    result[channel] = createProceduralDataTexture(
      materialId,
      channel,
      descriptor,
    );
  }
  return result;
}

function createProceduralDataTexture(
  materialId: string,
  channel: SceneProceduralTextureChannel,
  descriptor: SceneProceduralTextureDescriptor,
): DataTexture {
  const generated = generateSceneProceduralTexture(channel, descriptor);
  const texture = new DataTexture(
    generated.data,
    generated.width,
    generated.height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = `${materialId}:${channel}`;
  texture.colorSpace =
    channel === 'albedo' || channel === 'emissive'
      ? SRGBColorSpace
      : NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  const sampler = descriptor.sampler;
  texture.wrapS = resolveTextureWrap(sampler?.wrapU);
  texture.wrapT = resolveTextureWrap(sampler?.wrapV);
  texture.repeat.set(...(sampler?.repeat ?? [1, 1]));
  texture.offset.set(...(sampler?.offset ?? [0, 0]));
  texture.center.set(0.5, 0.5);
  texture.rotation = ((sampler?.rotationDeg ?? 0) * Math.PI) / 180;
  texture.anisotropy = sampler?.anisotropy ?? 1;
  texture.userData.iwsdkSceneProceduralTexture = {
    algorithm: descriptor.algorithm,
    channel,
    dataHash: generated.dataHash,
    height: generated.height,
    recipeHash: generated.recipeHash,
    width: generated.width,
  };
  texture.needsUpdate = true;
  return texture;
}

function collectSceneMaterialTextures(
  material: Material,
  textures: Set<Texture>,
): void {
  const candidate = material as Material & Record<string, unknown>;
  for (const property of MATERIAL_TEXTURE_PROPERTIES) {
    const texture = candidate[property];
    if (texture instanceof Texture) {
      textures.add(texture);
    }
  }
}

function resolveTextureWrap(wrap: string | undefined) {
  switch (wrap) {
    case 'clamp':
      return ClampToEdgeWrapping;
    case 'mirror':
      return MirroredRepeatWrapping;
    default:
      return RepeatWrapping;
  }
}

function resolveMaterialSide(side: SceneMaterial['side']) {
  switch (side) {
    case 'back':
      return BackSide;
    case 'double':
      return DoubleSide;
    default:
      return FrontSide;
  }
}
