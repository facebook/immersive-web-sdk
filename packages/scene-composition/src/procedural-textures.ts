/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { sha256Bytes } from './hash.js';
import { canonicalizeJson, sha256 } from './serialize.js';
import type {
  SceneMaterialTextures,
  SceneProceduralAlbedoTexture,
  SceneProceduralBumpTexture,
  SceneProceduralNormalTexture,
  SceneProceduralScalarTexture,
  SceneProceduralTextureBand,
  Sha256,
} from './types.js';

export type SceneProceduralTextureChannel = keyof SceneMaterialTextures;
export type SceneProceduralTextureDescriptor = NonNullable<
  SceneMaterialTextures[SceneProceduralTextureChannel]
>;

export interface GeneratedSceneProceduralTexture {
  channel: SceneProceduralTextureChannel;
  data: Uint8Array;
  dataHash: Sha256;
  height: number;
  recipeHash: Sha256;
  width: number;
}

/** Generate exact RGBA8 bytes for a closed, versioned procedural recipe. */
export function generateSceneProceduralTexture(
  channel: SceneProceduralTextureChannel,
  descriptor: SceneProceduralTextureDescriptor,
): GeneratedSceneProceduralTexture {
  const [width, height] = descriptor.resolution;
  const field = generatePeriodicField(descriptor, width, height);
  const data =
    channel === 'albedo' || channel === 'emissive'
      ? generateColorBytes(field, descriptor as SceneProceduralAlbedoTexture)
      : channel === 'normal'
        ? generateNormalBytes(
            field,
            width,
            height,
            descriptor as SceneProceduralNormalTexture,
          )
        : generateScalarBytes(
            field,
            descriptor as
              | SceneProceduralScalarTexture
              | SceneProceduralBumpTexture,
          );
  return {
    channel,
    data,
    dataHash: sha256Bytes(data),
    height,
    recipeHash: sha256(
      canonicalizeJson({ channel, descriptor } as unknown as object),
    ),
    width,
  };
}

function generatePeriodicField(
  descriptor: SceneProceduralTextureDescriptor,
  width: number,
  height: number,
): Float32Array {
  const field = new Float32Array(width * height);
  const amplitudeSum = descriptor.bands.reduce(
    (sum, band) => sum + band.amplitude,
    0,
  );
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      let value = 0;
      for (let index = 0; index < descriptor.bands.length; index += 1) {
        const band = descriptor.bands[index];
        value +=
          periodicValueNoise(u, v, band, descriptor.seed, index) *
          band.amplitude;
      }
      value = amplitudeSum === 0 ? 0.5 : value / amplitudeSum;
      value = (value - 0.5) * (descriptor.contrast ?? 1) + 0.5;
      field[y * width + x] = clamp01(value + (descriptor.bias ?? 0));
    }
  }
  return field;
}

function periodicValueNoise(
  u: number,
  v: number,
  band: SceneProceduralTextureBand,
  seed: number,
  bandIndex: number,
): number {
  const [frequencyU, frequencyV] = band.frequency;
  const sampleX = u * frequencyU;
  const sampleY = v * frequencyV;
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const tx = quintic(sampleX - x0);
  const ty = quintic(sampleY - y0);
  const bandSeed = (seed + Math.imul(bandIndex + 1, 0x9e3779b1)) >>> 0;
  const a = latticeHash(mod(x0, frequencyU), mod(y0, frequencyV), bandSeed);
  const b = latticeHash(mod(x0 + 1, frequencyU), mod(y0, frequencyV), bandSeed);
  const c = latticeHash(mod(x0, frequencyU), mod(y0 + 1, frequencyV), bandSeed);
  const d = latticeHash(
    mod(x0 + 1, frequencyU),
    mod(y0 + 1, frequencyV),
    bandSeed,
  );
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function latticeHash(x: number, y: number, seed: number): number {
  let value = Math.imul((x + seed) | 0, 374_761_393);
  value ^= Math.imul((y - seed) | 0, 668_265_263);
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffff_ffff;
}

function generateColorBytes(
  field: Float32Array,
  descriptor: SceneProceduralAlbedoTexture,
): Uint8Array {
  const stops = descriptor.ramp.map((stop) => ({
    at: stop.at,
    rgb: parseColor(stop.color),
  }));
  const data = new Uint8Array(field.length * 4);
  for (let index = 0; index < field.length; index += 1) {
    const value = field[index];
    let upperIndex = stops.findIndex((stop) => stop.at >= value);
    if (upperIndex === -1) {
      upperIndex = stops.length - 1;
    }
    const upper = stops[upperIndex];
    const lower = stops[Math.max(0, upperIndex - 1)];
    const distance = upper.at - lower.at;
    const mix = distance === 0 ? 0 : (value - lower.at) / distance;
    const offset = index * 4;
    data[offset] = quantize(lerp(lower.rgb[0], upper.rgb[0], mix) / 255);
    data[offset + 1] = quantize(lerp(lower.rgb[1], upper.rgb[1], mix) / 255);
    data[offset + 2] = quantize(lerp(lower.rgb[2], upper.rgb[2], mix) / 255);
    data[offset + 3] = 255;
  }
  return data;
}

function generateScalarBytes(
  field: Float32Array,
  descriptor: SceneProceduralScalarTexture | SceneProceduralBumpTexture,
): Uint8Array {
  const range = descriptor.range ?? [0, 1];
  const data = new Uint8Array(field.length * 4);
  for (let index = 0; index < field.length; index += 1) {
    const byte = quantize(lerp(range[0], range[1], field[index]));
    const offset = index * 4;
    data[offset] = byte;
    data[offset + 1] = byte;
    data[offset + 2] = byte;
    data[offset + 3] = 255;
  }
  return data;
}

function generateNormalBytes(
  field: Float32Array,
  width: number,
  height: number,
  descriptor: SceneProceduralNormalTexture,
): Uint8Array {
  const data = new Uint8Array(field.length * 4);
  const wrapU = descriptor.sampler?.wrapU ?? 'repeat';
  const wrapV = descriptor.sampler?.wrapV ?? 'repeat';
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = field[y * width + sampleIndex(x - 1, width, wrapU)];
      const right = field[y * width + sampleIndex(x + 1, width, wrapU)];
      const upY = sampleIndex(y - 1, height, wrapV);
      const downY = sampleIndex(y + 1, height, wrapV);
      const up = field[upY * width + x];
      const down = field[downY * width + x];
      let nx = ((left - right) * width) / 2;
      let ny = ((up - down) * height) / 2;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const offset = (y * width + x) * 4;
      data[offset] = quantize(nx * 0.5 + 0.5);
      data[offset + 1] = quantize(ny * 0.5 + 0.5);
      data[offset + 2] = quantize(nz * 0.5 + 0.5);
      data[offset + 3] = 255;
    }
  }
  return data;
}

function sampleIndex(
  value: number,
  size: number,
  wrap: 'clamp' | 'mirror' | 'repeat',
): number {
  if (wrap === 'clamp') {
    return Math.max(0, Math.min(size - 1, value));
  }
  if (wrap === 'repeat') {
    return mod(value, size);
  }
  const mirrored = mod(value, size * 2);
  return mirrored < size ? mirrored : size * 2 - 1 - mirrored;
}

function parseColor(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(from: number, to: number, mix: number): number {
  return from + (to - from) * mix;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function quantize(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
