/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
  LoadingManager,
  REVISION,
  WebGLRenderer,
} from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';

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

  /** Load a GLTF by URL, caching the result; optionally register a logical key. */
  static loadGLTF(url: string, key?: string): Promise<GLTF> {
    // Always use URL as cache key for consistent caching
    if (CacheManager.hasPromise(url)) {
      return CacheManager.getPromise<GLTF>(url)!;
    } else {
      // If a key is provided, store the key->URL mapping
      if (key) {
        CacheManager.setKeyToUrl(key, url);
      }

      const loadingPromise = new Promise<GLTF>((resolve, reject) => {
        if (CacheManager.hasAsset(url)) {
          resolve(CacheManager.getAsset<GLTF>(url)!);
          CacheManager.deletePromise(url);
        } else {
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
        }
      });

      CacheManager.setPromise(url, loadingPromise);
      return loadingPromise;
    }
  }

  /** Get a cached GLTF by logical key. */
  static getGLTF(key: string): GLTF | null {
    return (CacheManager.getAssetByKey(key) as GLTF) || null;
  }
}
