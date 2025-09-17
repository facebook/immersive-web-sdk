/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AudioLoader, LoadingManager } from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';

/**
 * Audio buffer loader with de-duplication and caching.
 *
 * @category Assets
 */
export class AudioAssetLoader {
  private static audioLoader: AudioLoader;

  static init(loadingManager: LoadingManager): void {
    this.audioLoader = new AudioLoader(loadingManager);
  }

  /** Load an AudioBuffer (URL or logical key), returning a cached instance when possible. */
  static async loadAudio(urlOrKey: string): Promise<AudioBuffer> {
    // Resolve URL from key if needed
    const url = CacheManager.resolveUrl(urlOrKey);

    // Check promise cache (prevent duplicate requests)
    if (CacheManager.hasPromise(url)) {
      return CacheManager.getPromise<AudioBuffer>(url)!;
    }

    const loadingPromise = new Promise<AudioBuffer>((resolve, reject) => {
      // Check cache first
      if (CacheManager.hasAsset(url)) {
        resolve(CacheManager.getAsset<AudioBuffer>(url)!);
        CacheManager.deletePromise(url);
      } else {
        // Load using Three.js AudioLoader
        this.audioLoader.load(
          url,
          (buffer) => {
            CacheManager.setAsset(url, buffer);
            resolve(buffer);
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

  /** Get a cached AudioBuffer by logical key. */
  static getAudio(key: string): AudioBuffer | null {
    return (CacheManager.getAssetByKey(key) as AudioBuffer) || null;
  }
}
