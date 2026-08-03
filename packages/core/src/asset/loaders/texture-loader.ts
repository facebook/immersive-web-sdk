/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { LoadingManager, Texture, TextureLoader } from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';
import {
  DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  loadCachedAsset,
} from './cached-asset-load.js';

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
  static loadTexture(
    urlOrKey: string,
    timeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  ): Promise<Texture> {
    const url = CacheManager.resolveUrl(urlOrKey);
    return loadCachedAsset({
      discard: (texture) => texture.dispose(),
      load: (resolve, reject) => {
        this.textureLoader.load(url, resolve, undefined, reject);
      },
      timeoutMs,
      url,
    });
  }

  /** Get a cached texture by logical key. */
  static getTexture(key: string): Texture | null {
    return (CacheManager.getAssetByKey(key) as Texture) || null;
  }
}
