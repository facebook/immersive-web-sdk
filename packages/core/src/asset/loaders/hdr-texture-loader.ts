/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import {
  EquirectangularReflectionMapping,
  LoadingManager,
  Texture,
} from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';
import {
  DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  loadCachedAsset,
} from './cached-asset-load.js';

/** HDR equirectangular texture loader with de-duplication and caching.
 * @category Assets
 */
export class HDRTextureAssetLoader {
  private static hdrLoader: HDRLoader;
  private static exrLoader: EXRLoader;

  static init(loadingManager: LoadingManager): void {
    this.hdrLoader = new HDRLoader(loadingManager);
    this.exrLoader = new EXRLoader(loadingManager);
  }

  /** Load an HDR `.hdr`/`.exr` texture by URL, returning a cached instance when possible. */
  static loadHDRTexture(
    urlOrKey: string,
    timeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  ): Promise<Texture> {
    const url = CacheManager.resolveUrl(urlOrKey);
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

    return loadCachedAsset({
      discard: (texture) => texture.dispose(),
      load: (resolve, reject) => {
        const onLoad = (texture: Texture) => {
          texture.mapping = EquirectangularReflectionMapping;
          resolve(texture);
        };
        if (isEXR) {
          this.exrLoader.load(url, onLoad, undefined, reject);
        } else {
          this.hdrLoader.load(url, onLoad, undefined, reject);
        }
      },
      timeoutMs,
      url,
    });
  }
}
