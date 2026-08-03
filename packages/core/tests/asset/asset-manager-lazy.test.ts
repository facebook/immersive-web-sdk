/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssetLoadError,
  AssetLoadTimeoutError,
  AssetManager,
  AssetType,
  DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  RenderableAssetRegistry,
} from '../../src/asset/asset-manager.js';
import { CacheManager } from '../../src/asset/cache-manager.js';
import { AudioAssetLoader } from '../../src/asset/loaders/audio-loader.js';
import { GLTFAssetLoader } from '../../src/asset/loaders/gltf-loader.js';
import { HDRTextureAssetLoader } from '../../src/asset/loaders/hdr-texture-loader.js';
import { TextureAssetLoader } from '../../src/asset/loaders/texture-loader.js';
import { UIKitMLAssetLoader } from '../../src/asset/loaders/uikitml-loader.js';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from '../../src/runtime/index.js';

describe('AssetManager lazy manifests', () => {
  beforeEach(() => {
    CacheManager.clear();
    AssetManager.setLoadTimeout(DEFAULT_ASSET_LOAD_TIMEOUT_MS);
  });

  afterEach(() => {
    CacheManager.clear();
    AssetManager.setLoadTimeout(DEFAULT_ASSET_LOAD_TIMEOUT_MS);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers every key but fetches only default/critical and background entries', async () => {
    const gltfLoad = vi
      .spyOn(GLTFAssetLoader, 'loadGLTF')
      .mockResolvedValue(makeGLTF());
    const audioLoad = vi
      .spyOn(AudioAssetLoader, 'loadAudio')
      .mockResolvedValue({} as AudioBuffer);
    const textureLoad = vi.spyOn(TextureAssetLoader, 'loadTexture');
    const hdrLoad = vi.spyOn(HDRTextureAssetLoader, 'loadHDRTexture');
    const uiLoad = vi.spyOn(UIKitMLAssetLoader, 'loadUIKitML');

    await AssetManager.preloadAssets({
      background: {
        priority: 'background',
        type: AssetType.Audio,
        url: '/background.mp3',
      },
      defaultCritical: { type: AssetType.GLTF, url: '/critical.glb' },
      lazyHDR: {
        priority: 'lazy',
        type: AssetType.HDRTexture,
        url: '/sky.hdr',
      },
      lazyTexture: {
        priority: 'lazy',
        type: AssetType.Texture,
        url: '/texture.png',
      },
      lazyUI: {
        priority: 'lazy',
        type: AssetType.UIKitML,
        url: '/panel.uikitml',
      },
    });

    expect(gltfLoad).toHaveBeenCalledTimes(1);
    expect(audioLoad).toHaveBeenCalledTimes(1);
    expect(textureLoad).not.toHaveBeenCalled();
    expect(hdrLoad).not.toHaveBeenCalled();
    expect(uiLoad).not.toHaveBeenCalled();
    expect(CacheManager.resolveUrl('lazyTexture')).toBe('/texture.png');
    expect(CacheManager.resolveUrl('lazyHDR')).toBe('/sky.hdr');
    expect(CacheManager.resolveUrl('lazyUI')).toBe('/panel.uikitml');
  });

  it('provides explicit typed on-demand paths for every lazy entry type', async () => {
    const gltf = makeGLTF();
    const audio = {} as AudioBuffer;
    const texture = new Texture();
    const hdr = new Texture();
    vi.spyOn(GLTFAssetLoader, 'loadGLTF').mockResolvedValue(gltf);
    vi.spyOn(AudioAssetLoader, 'loadAudio').mockResolvedValue(audio);
    vi.spyOn(TextureAssetLoader, 'loadTexture').mockResolvedValue(texture);
    vi.spyOn(HDRTextureAssetLoader, 'loadHDRTexture').mockResolvedValue(hdr);
    vi.spyOn(UIKitMLAssetLoader, 'loadUIKitML').mockResolvedValue('<div />');
    AssetManager.registerManifest({
      audio: { priority: 'lazy', type: AssetType.Audio, url: '/audio.mp3' },
      hdr: {
        priority: 'lazy',
        type: AssetType.HDRTexture,
        url: '/environment.hdr',
      },
      model: { priority: 'lazy', type: AssetType.GLTF, url: '/model.glb' },
      texture: {
        priority: 'lazy',
        type: AssetType.Texture,
        url: '/texture.png',
      },
      ui: { priority: 'lazy', type: AssetType.UIKitML, url: '/ui.uikitml' },
    });

    await expect(AssetManager.loadGLTFById('model')).resolves.toBe(gltf);
    await expect(AssetManager.loadAudioById('audio')).resolves.toBe(audio);
    await expect(AssetManager.loadTextureById('texture')).resolves.toBe(
      texture,
    );
    await expect(AssetManager.loadHDRTextureById('hdr')).resolves.toBe(hdr);
    await expect(AssetManager.loadUIKitMLById('ui')).resolves.toBe('<div />');
    await expect(AssetManager.loadTextureById('model')).rejects.toThrow(
      'has type "gltf", expected "texture"',
    );
  });

  it('deduplicates concurrent first use and lets the registry instantiate lazy GLTF', async () => {
    let finish: ((gltf: GLTF) => void) | undefined;
    const load = vi.fn((_url: string, onLoad: (gltf: GLTF) => void) => {
      finish = onLoad;
    });
    (GLTFAssetLoader as any).gltfLoader = { load };
    const registry = new RenderableAssetRegistry({
      robot: { priority: 'lazy', type: AssetType.GLTF, url: '/robot.glb' },
    });
    await registry.preload();

    const first = registry.instantiate('robot');
    const second = registry.instantiate('robot');
    expect(load).toHaveBeenCalledTimes(1);
    finish?.(makeGLTF());

    const [firstObject, secondObject] = await Promise.all([first, second]);
    expect(firstObject).not.toBe(secondObject);
    expect(firstObject.parent).toBeNull();
    expect(secondObject.parent).toBeNull();
  });

  it('loads a lazy UIKitML source before invoking its document factory', async () => {
    const instantiateUIKitML = vi.fn(async () => new Group());
    const fetchMock = vi.fn(async () => new Response('<div id="panel" />'));
    vi.stubGlobal('fetch', fetchMock);
    const registry = new RenderableAssetRegistry(
      {
        panel: {
          priority: 'lazy',
          type: AssetType.UIKitML,
          url: '/panel.uikitml',
        },
      },
      { instantiateUIKitML },
    );
    await registry.preload();
    expect(fetchMock).not.toHaveBeenCalled();

    await registry.instantiate('panel');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(instantiateUIKitML).toHaveBeenCalledWith('panel');
    expect(AssetManager.getUIKitML('panel')).toBe('<div id="panel" />');
  });

  it('wraps failures with asset ID, URL, and cause', async () => {
    const cause = new Error('network unavailable');
    vi.spyOn(GLTFAssetLoader, 'loadGLTF').mockRejectedValue(cause);
    AssetManager.registerManifest({
      robot: { priority: 'lazy', type: AssetType.GLTF, url: '/robot.glb' },
    });

    const failure = AssetManager.loadGLTFById('robot').catch((error) => error);

    await expect(failure).resolves.toMatchObject({
      assetId: 'robot',
      cause,
      name: 'AssetLoadError',
      url: '/robot.glb',
    });
    await expect(failure).resolves.toBeInstanceOf(AssetLoadError);
  });

  it('rejects critical preload with the same structured failure contract', async () => {
    const cause = new Error('critical fetch failed');
    vi.spyOn(TextureAssetLoader, 'loadTexture').mockRejectedValue(cause);

    await expect(
      AssetManager.preloadAssets({
        albedo: { type: AssetType.Texture, url: '/albedo.png' },
      }),
    ).rejects.toMatchObject({
      assetId: 'albedo',
      cause,
      name: 'AssetLoadError',
      url: '/albedo.png',
    });
  });

  it('times out, clears the request, and discards a late GLTF result', async () => {
    vi.useFakeTimers();
    let finish: ((gltf: GLTF) => void) | undefined;
    (GLTFAssetLoader as any).gltfLoader = {
      load: (_url: string, onLoad: (gltf: GLTF) => void) => {
        finish = onLoad;
      },
    };
    const gltf = makeGLTF();
    const dispose = vi.spyOn(
      (gltf.scene.children[0] as Mesh).geometry,
      'dispose',
    );
    AssetManager.setLoadTimeout(25);
    AssetManager.registerManifest({
      robot: { priority: 'lazy', type: AssetType.GLTF, url: '/robot.glb' },
    });
    const promise = AssetManager.loadGLTFById('robot');
    const assertion = expect(promise).rejects.toMatchObject({
      assetId: 'robot',
      cause: expect.any(AssetLoadTimeoutError),
      url: '/robot.glb',
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(CacheManager.hasPromise('/robot.glb')).toBe(false);
    finish?.(gltf);
    expect(CacheManager.getAssetByKey('robot')).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps background failures nonblocking while preserving structured identity', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(AudioAssetLoader, 'loadAudio').mockRejectedValue(
      new Error('decode failed'),
    );

    await expect(
      AssetManager.preloadAssets({
        ambience: {
          priority: 'background',
          type: AssetType.Audio,
          url: '/ambience.mp3',
        },
      }),
    ).resolves.toBeUndefined();
    await Promise.resolve();

    expect(warning).toHaveBeenCalledWith(
      'Background asset failed: ambience',
      expect.objectContaining({
        assetId: 'ambience',
        name: 'AssetLoadError',
        url: '/ambience.mp3',
      }),
    );
  });

  it('rejects invalid timeout configuration', () => {
    expect(() => AssetManager.setLoadTimeout(0)).toThrow(
      'Asset load timeout must be a positive finite number',
    );
    expect(() => AssetManager.setLoadTimeout(Number.POSITIVE_INFINITY)).toThrow(
      'Asset load timeout must be a positive finite number',
    );
  });
});

function makeGLTF(): GLTF {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
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
