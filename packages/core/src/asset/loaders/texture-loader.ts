/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { LoadingManager, Texture, TextureLoader } from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';

/**
 * Texture loader with de-duplication and caching.
 *
 * @category Assets
 */
export class TextureAssetLoader {
  private static textureLoader: TextureLoader;

  static init(loadingManager: LoadingManager): void {
    this.textureLoader = new TextureLoader(loadingManager);
  }

  /** Load a texture (URL or logical key), returning a cached instance when possible. */
  static async loadTexture(urlOrKey: string): Promise<Texture> {
    // Resolve URL from key if needed
    const url = CacheManager.resolveUrl(urlOrKey);

    // Check promise cache (prevent duplicate requests)
    if (CacheManager.hasPromise(url)) {
      return CacheManager.getPromise<Texture>(url)!;
    }

    const loadingPromise = new Promise<Texture>((resolve, reject) => {
      // Check cache first
      if (CacheManager.hasAsset(url)) {
        resolve(CacheManager.getAsset<Texture>(url)!);
        CacheManager.deletePromise(url);
      } else {
        // Load using Three.js TextureLoader
        this.textureLoader.load(
          url,
          (texture) => {
            CacheManager.setAsset(url, texture);
            resolve(texture);
            CacheManager.deletePromise(url);
          },
          undefined, // progress callback
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

  /** Get a cached texture by logical key. */
  static getTexture(key: string): Texture | null {
    return (CacheManager.getAssetByKey(key) as Texture) || null;
  }
}
