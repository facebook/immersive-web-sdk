/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CacheManager } from '../../src/asset/cache-manager.js';
import { AudioAssetLoader } from '../../src/asset/loaders/audio-loader.js';
import { GLTFAssetLoader } from '../../src/asset/loaders/gltf-loader.js';
import { HDRTextureAssetLoader } from '../../src/asset/loaders/hdr-texture-loader.js';
import { TextureAssetLoader } from '../../src/asset/loaders/texture-loader.js';

// These tests exercise only the "asset already cached" path, which resolves
// directly from CacheManager and never touches the underlying three.js loaders
// (so no init() is required). Before the fix, the cached path created a promise
// whose deletePromise() ran synchronously inside the executor — before
// setPromise() stored it — so the resolved promise lingered in promiseCache
// forever and hasPromise() stayed true on every subsequent reload.

describe('asset loaders: cached path does not leak a promise', () => {
  beforeEach(() => CacheManager.clear());
  afterEach(() => CacheManager.clear());

  it('GLTFAssetLoader.loadGLTF resolves cached asset and leaves no stale promise', async () => {
    const url = 'https://example.invalid/cached.glb';
    const asset = { sentinel: 'gltf' };
    CacheManager.setAsset(url, asset);

    const result = await GLTFAssetLoader.loadGLTF(url);

    expect(result).toBe(asset);
    expect(CacheManager.hasPromise(url)).toBe(false);
  });

  it('GLTFAssetLoader.loadGLTF still registers the key->url mapping for cached assets', async () => {
    const url = 'https://example.invalid/keyed.glb';
    CacheManager.setAsset(url, { sentinel: 'gltf' });

    await GLTFAssetLoader.loadGLTF(url, 'my-key');

    expect(CacheManager.resolveUrl('my-key')).toBe(url);
    expect(CacheManager.hasPromise(url)).toBe(false);
  });

  it('TextureAssetLoader.loadTexture resolves cached asset and leaves no stale promise', async () => {
    const url = 'https://example.invalid/cached.png';
    const asset = { sentinel: 'texture' };
    CacheManager.setAsset(url, asset);

    const result = await TextureAssetLoader.loadTexture(url);

    expect(result).toBe(asset);
    expect(CacheManager.hasPromise(url)).toBe(false);
  });

  it('AudioAssetLoader.loadAudio resolves cached asset and leaves no stale promise', async () => {
    const url = 'https://example.invalid/cached.mp3';
    const asset = { sentinel: 'audio' };
    CacheManager.setAsset(url, asset);

    const result = await AudioAssetLoader.loadAudio(url);

    expect(result).toBe(asset);
    expect(CacheManager.hasPromise(url)).toBe(false);
  });

  it('HDRTextureAssetLoader.loadHDRTexture resolves cached asset and leaves no stale promise', async () => {
    const url = 'https://example.invalid/cached.hdr';
    const asset = { sentinel: 'hdr' };
    CacheManager.setAsset(url, asset);

    const result = await HDRTextureAssetLoader.loadHDRTexture(url);

    expect(result).toBe(asset);
    expect(CacheManager.hasPromise(url)).toBe(false);
  });

  it('reloading a cached asset repeatedly never accumulates promises', async () => {
    const url = 'https://example.invalid/repeat.png';
    CacheManager.setAsset(url, { sentinel: 'texture' });

    for (let i = 0; i < 5; i++) {
      await TextureAssetLoader.loadTexture(url);
      expect(CacheManager.hasPromise(url)).toBe(false);
    }
  });
});
