/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CacheManager } from '../cache-manager.js';
import {
  DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  loadCachedAsset,
} from './cached-asset-load.js';

/** Cached text loader for UIKitML source assets. */
export class UIKitMLAssetLoader {
  static async loadUIKitML(
    urlOrKey: string,
    key?: string,
    forceReload = false,
    timeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  ): Promise<string> {
    if (key) {
      CacheManager.setKeyToUrl(key, urlOrKey);
    }
    const url = CacheManager.resolveUrl(urlOrKey);
    if (forceReload) {
      CacheManager.deleteAsset(url);
    }
    return loadCachedAsset({
      load: (resolve, reject) => {
        (forceReload ? fetch(url, { cache: 'no-store' }) : fetch(url))
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(
                `Failed to load UIKitML: ${url} (${response.status} ${response.statusText})`,
              );
            }
            resolve(await response.text());
          })
          .catch(reject);
      },
      replacePending: forceReload,
      timeoutMs,
      url,
    });
  }

  static getUIKitML(keyOrUrl: string): string | null {
    const url = CacheManager.resolveUrl(keyOrUrl);
    return CacheManager.getAsset<string>(url) ?? null;
  }
}
