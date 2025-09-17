/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {
  EquirectangularReflectionMapping,
  LoadingManager,
  Texture,
} from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';

/** HDR equirectangular texture loader with de-duplication and caching.
 * @category Assets
 */
export class HDRTextureAssetLoader {
  private static rgbeLoader: RGBELoader;
  private static exrLoader: EXRLoader;

  static init(loadingManager: LoadingManager): void {
    this.rgbeLoader = new RGBELoader(loadingManager);
    this.exrLoader = new EXRLoader(loadingManager);
  }

  /** Load an HDR `.hdr`/`.exr` texture by URL, returning a cached instance when possible. */
  static async loadHDRTexture(url: string): Promise<Texture> {
    // Normalize extension
    const u = url.toLowerCase();
    const isEXR = u.endsWith('.exr');
    const isHDR = u.endsWith('.hdr');

    if (!isEXR && !isHDR) {
      // Fall back to standard texture loader if the extension is not HDR/EXR
      // but keep API compatibility for callers that route through here.
      return Promise.reject(
        new Error(`Unsupported HDR texture extension in url: ${url}`),
      );
    }

    if (CacheManager.hasPromise(url)) {
      return CacheManager.getPromise<Texture>(url)!;
    }

    const loadingPromise = new Promise<Texture>((resolve, reject) => {
      if (CacheManager.hasAsset(url)) {
        resolve(CacheManager.getAsset<Texture>(url)!);
        CacheManager.deletePromise(url);
        return;
      }

      const onLoad = (texture: Texture) => {
        // Ensure world-locked mapping for equirectangular HDR/EXR
        texture.mapping = EquirectangularReflectionMapping;
        CacheManager.setAsset(url, texture);
        resolve(texture);
        CacheManager.deletePromise(url);
      };

      const onError = (error: unknown) => {
        reject(error as Error);
        CacheManager.deletePromise(url);
      };

      if (isEXR) {
        this.exrLoader.load(url, onLoad, undefined, onError);
      } else {
        this.rgbeLoader.load(url, onLoad, undefined, onError);
      }
    });

    CacheManager.setPromise(url, loadingPromise);
    return loadingPromise;
  }
}
