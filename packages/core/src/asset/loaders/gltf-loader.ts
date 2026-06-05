/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  Group,
  LoadingManager,
  REVISION,
  WebGLRenderer,
} from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';

/** Options for retrieving a cached GLTF. @category Assets */
export interface GetGLTFOptions {
  /**
   * If true, return the cached GLTF directly (shared across calls).
   * Default `false`: returns a fresh clone whose `scene`/`scenes` are new
   * `Object3D` trees, allowing the same key to be used for multiple entities.
   * Geometries, materials, and animation clips remain shared by reference.
   */
  shared?: boolean;
}

const THREE_PATH = `https://unpkg.com/three@0.${REVISION}.0`;

/**
 * GLTF loader with DRACO/KTX2 support, de-duplication, and caching.
 *
 * @category Assets
 */
export class GLTFAssetLoader {
  private static gltfLoader: GLTFLoader;
  private static dracoLoader: DRACOLoader;
  private static ktx2Loader: KTX2Loader;

  /**
   * Initialize loader instances and configure decoders/transcoders.
   * @param loadingManager Shared Three.js `LoadingManager`.
   * @param renderer Renderer used to detect KTX2 support.
   * @param options Optional decoder/transcoder paths (fall back to CDN paths matching Three r{REVISION}).
   */
  static init(
    loadingManager: LoadingManager,
    renderer: WebGLRenderer,
    options: {
      dracoDecoderPath?: string;
      ktx2TranscoderPath?: string;
    } = {},
  ): void {
    // Initialize DRACO loader
    this.dracoLoader = new DRACOLoader(loadingManager).setDecoderPath(
      options.dracoDecoderPath ?? `${THREE_PATH}/examples/jsm/libs/draco/gltf/`,
    );

    // Initialize KTX2 loader
    this.ktx2Loader = new KTX2Loader(loadingManager)
      .setTranscoderPath(
        options.ktx2TranscoderPath ?? `${THREE_PATH}/examples/jsm/libs/basis/`,
      )
      .detectSupport(renderer);

    // Initialize GLTF loader with compression support
    this.gltfLoader = new GLTFLoader(loadingManager)
      .setDRACOLoader(this.dracoLoader)
      .setKTX2Loader(this.ktx2Loader);
  }

  /**
   * Load a GLTF by URL, caching the result; optionally register a logical key.
   *
   * @remarks
   * Resolves with the cached `GLTF` instance directly. To retrieve a clone
   * suitable for placing into multiple entities, call {@link GLTFAssetLoader.getGLTF}
   * (or `AssetManager.getGLTF`) by key after the load resolves.
   */
  static loadGLTF(url: string, key?: string): Promise<GLTF> {
    // Always use URL as cache key for consistent caching
    if (CacheManager.hasPromise(url)) {
      return CacheManager.getPromise<GLTF>(url)!;
    } else {
      // If a key is provided, store the key->URL mapping
      if (key) {
        CacheManager.setKeyToUrl(key, url);
      }

      // If the asset is already cached, return it directly. Registering a
      // promise on the cached path leaks: the synchronous deletePromise()
      // inside the executor runs before setPromise() stores the promise, so the
      // resolved promise would linger in promiseCache for the life of the
      // process (and be returned by the hasPromise() branch on every reload).
      if (CacheManager.hasAsset(url)) {
        return Promise.resolve(CacheManager.getAsset<GLTF>(url)!);
      }

      const loadingPromise = new Promise<GLTF>((resolve, reject) => {
        this.gltfLoader.load(
          url,
          (gltf) => {
            CacheManager.setAsset(url, gltf);
            resolve(gltf);
            CacheManager.deletePromise(url);
          },
          () => {}, // progress callback
          (error) => {
            reject(error);
            CacheManager.deletePromise(url);
          },
        );
      });

      CacheManager.setPromise(url, loadingPromise);
      return loadingPromise;
    }
  }

  /**
   * Get a cached GLTF by logical key.
   *
   * @remarks
   * By default, returns a fresh clone: `scene` and `scenes` are new
   * `Object3D` trees (correctly handling `SkinnedMesh`/`Bone` hierarchies),
   * while geometries, materials, `animations`, `cameras`, `asset`,
   * `parser`, and `userData` remain shared by reference. This makes it
   * safe to call `getGLTF(key)` once per entity — adding the result's
   * `scene` to multiple parents will not silently re-parent a single
   * shared object.
   *
   * Pass `{ shared: true }` to return the cached `GLTF` directly (the
   * pre-0.4.x behavior), e.g. for framework code that intentionally
   * mutates the canonical instance.
   */
  static getGLTF(key: string, options: GetGLTFOptions = {}): GLTF | null {
    const cached = CacheManager.getAssetByKey(key) as GLTF | undefined;
    if (!cached) {
      return null;
    }
    if (options.shared) {
      return cached;
    }
    return {
      ...cached,
      scene: cloneSkinned(cached.scene) as Group,
      scenes: cached.scenes.map((s) => cloneSkinned(s) as Group),
    };
  }
}
