/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssetManager,
  GLTFLoadTransaction,
} from '../../src/asset/asset-manager.js';
import { CacheManager } from '../../src/asset/cache-manager.js';
import {
  GLTFAssetLoader,
  GLTFPayloadLimitError,
} from '../../src/asset/loaders/gltf-loader.js';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from '../../src/runtime/index.js';

describe('GLTFLoadTransaction', () => {
  beforeEach(() => CacheManager.clear());
  afterEach(() => {
    CacheManager.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('borrows an already cached model without remapping or disposing it on rollback', async () => {
    const url = 'https://example.invalid/cached.glb';
    const gltf = makeGLTF();
    const disposeGeometry = vi.spyOn(
      (gltf.scene.children[0] as Mesh).geometry,
      'dispose',
    );
    CacheManager.setAsset(url, gltf);
    const detachedLoad = vi.spyOn(GLTFAssetLoader, 'loadGLTFDetached');

    const transaction = AssetManager.createGLTFLoadTransaction();
    const staged = await transaction.stage(url, 'cached-model');

    expect(staged).toMatchObject({ payloadBytes: 0, source: 'cache', url });
    expect(detachedLoad).not.toHaveBeenCalled();
    expect(CacheManager.resolveUrl('cached-model')).toBe('cached-model');
    transaction.rollback();
    expect(CacheManager.getAssetByKey(url)).toBe(gltf);
    expect(CacheManager.resolveUrl('cached-model')).toBe('cached-model');
    expect(disposeGeometry).not.toHaveBeenCalled();
  });

  it('adopts a fresh detached model and its logical key only on commit', async () => {
    const url = 'https://example.invalid/fresh.glb';
    const gltf = makeGLTF();
    const geometry = (gltf.scene.children[0] as Mesh).geometry;
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    vi.spyOn(GLTFAssetLoader, 'loadGLTFDetached').mockResolvedValue({
      gltf,
      payloadBytes: 128,
    });
    const transaction = new GLTFLoadTransaction();

    await transaction.stage(url, 'fresh-model');
    expect(CacheManager.hasAsset(url)).toBe(false);
    expect(CacheManager.resolveUrl('fresh-model')).toBe('fresh-model');
    expect(transaction.getGLTF('fresh-model')?.scene).not.toBe(gltf.scene);

    transaction.commit();
    expect(CacheManager.getAssetByKey('fresh-model')).toBe(gltf);
    expect(CacheManager.resolveUrl('fresh-model')).toBe(url);
    expect(AssetManager.getGLTF('fresh-model')?.scene).not.toBe(gltf.scene);
    expect(
      (AssetManager.getGLTF('fresh-model')!.scene.children[0] as Mesh)
        .geometry as BoxGeometry,
    ).toBe(geometry);
    transaction.rollback();
    expect(disposeGeometry).not.toHaveBeenCalled();
  });

  it('does not leak URL or logical-key cache state when a detached load fails', async () => {
    const url = 'https://example.invalid/failed.glb';
    vi.spyOn(GLTFAssetLoader, 'loadGLTFDetached').mockRejectedValue(
      new Error('network failed'),
    );
    const transaction = new GLTFLoadTransaction();

    await expect(transaction.stage(url, 'failed-model')).rejects.toThrow(
      'network failed',
    );
    transaction.rollback();

    expect(CacheManager.hasAsset(url)).toBe(false);
    expect(CacheManager.hasPromise(url)).toBe(false);
    expect(CacheManager.resolveUrl('failed-model')).toBe('failed-model');
    expect(CacheManager.getAssetByKey('failed-model')).toBeUndefined();
  });

  it('disposes staged geometry, materials, and textures on rollback', async () => {
    const gltf = makeGLTF();
    const mesh = gltf.scene.children[0] as Mesh;
    const material = mesh.material as MeshStandardMaterial;
    const texture = material.map!;
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    vi.spyOn(GLTFAssetLoader, 'loadGLTFDetached').mockResolvedValue({
      gltf,
      payloadBytes: 128,
    });
    const transaction = new GLTFLoadTransaction();

    await transaction.stage('https://example.invalid/staged.glb', 'staged');
    transaction.rollback();

    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
    expect(CacheManager.hasAsset('https://example.invalid/staged.glb')).toBe(
      false,
    );
  });

  it('disposes the rejected model and all prior stages when the total ceiling is exceeded', async () => {
    const first = makeGLTF();
    const second = makeGLTF();
    const firstDispose = vi.spyOn(
      (first.scene.children[0] as Mesh).geometry,
      'dispose',
    );
    const secondDispose = vi.spyOn(
      (second.scene.children[0] as Mesh).geometry,
      'dispose',
    );
    vi.spyOn(GLTFAssetLoader, 'loadGLTFDetached')
      .mockResolvedValueOnce({ gltf: first, payloadBytes: 6 })
      .mockResolvedValueOnce({ gltf: second, payloadBytes: 6 });
    const transaction = new GLTFLoadTransaction({
      maxModelPayloadBytes: 10,
      maxTotalModelPayloadBytes: 10,
    });

    await transaction.stage('https://example.invalid/first.glb', 'first');
    await expect(
      transaction.stage('https://example.invalid/second.glb', 'second'),
    ).rejects.toThrow('configured scene limit is 10 bytes');
    expect(secondDispose).toHaveBeenCalledTimes(1);
    transaction.rollback();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(CacheManager.hasAsset('https://example.invalid/first.glb')).toBe(
      false,
    );
  });
});

describe('GLTFAssetLoader detached payload accounting', () => {
  const url = 'https://example.invalid/model.gltf';

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('measures an unknown-length response from actual bytes', async () => {
    const gltf = makeGLTF();
    const parseAsync = vi.fn(async () => gltf);
    (GLTFAssetLoader as any).gltfLoader = { parseAsync };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]))),
    );

    await expect(GLTFAssetLoader.loadGLTFDetached(url, 4)).resolves.toEqual({
      gltf,
      payloadBytes: 4,
    });
    expect(parseAsync).toHaveBeenCalledTimes(1);
  });

  it('cuts off an unknown-length response that exceeds the byte ceiling', async () => {
    const parseAsync = vi.fn();
    (GLTFAssetLoader as any).gltfLoader = { parseAsync };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]))),
    );

    await expect(
      GLTFAssetLoader.loadGLTFDetached(url, 3),
    ).rejects.toBeInstanceOf(GLTFPayloadLimitError);
    expect(parseAsync).not.toHaveBeenCalled();
  });

  it('counts external glTF buffers from fetched bytes and parses the frozen response', async () => {
    const gltf = makeGLTF();
    const jsonBytes = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ byteLength: 3, uri: 'mesh.bin' }],
      }),
    );
    const parseAsync = vi.fn(async (payload: ArrayBuffer) => {
      const parsed = JSON.parse(new TextDecoder().decode(payload));
      expect(parsed.buffers[0].uri).toMatch(/^blob:/);
      return gltf;
    });
    (GLTFAssetLoader as any).gltfLoader = { parseAsync };
    const fetchMock = vi.fn(async (requestedUrl: string) =>
      requestedUrl.endsWith('/mesh.bin')
        ? new Response(new Uint8Array([1, 2, 3]))
        : new Response(jsonBytes),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      GLTFAssetLoader.loadGLTFDetached(url, jsonBytes.byteLength + 3),
    ).resolves.toEqual({
      gltf,
      payloadBytes: jsonBytes.byteLength + 3,
    });
    expect(fetchMock).toHaveBeenCalledWith(url);
    expect(fetchMock).toHaveBeenCalledWith('https://example.invalid/mesh.bin');
    expect(parseAsync).toHaveBeenCalledTimes(1);
  });

  it('rejects an external glTF dependency that pushes the model over its ceiling', async () => {
    const jsonBytes = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: '2.0' },
        images: [{ uri: 'large.png' }],
      }),
    );
    const parseAsync = vi.fn();
    (GLTFAssetLoader as any).gltfLoader = { parseAsync };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (requestedUrl: string) =>
        requestedUrl.endsWith('/large.png')
          ? new Response(new Uint8Array([1, 2, 3, 4]))
          : new Response(jsonBytes),
      ),
    );

    await expect(
      GLTFAssetLoader.loadGLTFDetached(url, jsonBytes.byteLength + 3),
    ).rejects.toMatchObject({
      actualBytes: jsonBytes.byteLength + 4,
      limitBytes: jsonBytes.byteLength + 3,
      url,
    });
    expect(parseAsync).not.toHaveBeenCalled();
  });
});

function makeGLTF(): GLTF {
  const scene = new Group();
  const material = new MeshStandardMaterial();
  material.map = new Texture();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), material));
  return {
    animations: [],
    asset: { version: '2.0' },
    cameras: [],
    parser: {} as GLTF['parser'],
    scene,
    scenes: [scene],
    userData: {},
  };
}
