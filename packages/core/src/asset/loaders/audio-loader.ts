/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AudioLoader, LoadingManager } from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';
import {
  DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  loadCachedAsset,
} from './cached-asset-load.js';

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
  static loadAudio(
    urlOrKey: string,
    timeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  ): Promise<AudioBuffer> {
    const url = CacheManager.resolveUrl(urlOrKey);
    return loadCachedAsset({
      load: (resolve, reject) => {
        this.audioLoader.load(url, resolve, undefined, reject);
      },
      timeoutMs,
      url,
    });
  }

  /** Get a cached AudioBuffer by logical key. */
  static getAudio(key: string): AudioBuffer | null {
    return (CacheManager.getAssetByKey(key) as AudioBuffer) || null;
  }
}
