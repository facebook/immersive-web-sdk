/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CacheManager } from '../cache-manager.js';

/** Cached text loader for UIKitML source assets. */
export class UIKitMLAssetLoader {
  static async loadUIKitML(
    urlOrKey: string,
    key?: string,
    forceReload = false,
  ): Promise<string> {
    if (key) {
      CacheManager.setKeyToUrl(key, urlOrKey);
    }
    const url = CacheManager.resolveUrl(urlOrKey);
    if (forceReload) {
      CacheManager.deleteAsset(url);
    } else {
      const cached = CacheManager.getAsset<string>(url);
      if (cached != null) {
        return cached;
      }
    }

    const pending = CacheManager.getPromise<string>(url);
    if (pending && !forceReload) {
      return pending;
    }

    let promise: Promise<string>;
    promise = (forceReload ? fetch(url, { cache: 'no-store' }) : fetch(url))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load UIKitML: ${url} (${response.status} ${response.statusText})`,
          );
        }
        const source = await response.text();
        // A forced reload may supersede an older request for the same URL.
        // Only the newest request may publish into the shared source cache.
        if (CacheManager.getPromise(url) === promise) {
          CacheManager.setAsset(url, source);
        }
        return source;
      })
      .finally(() => CacheManager.deletePromise(url, promise));
    CacheManager.setPromise(url, promise);
    return promise;
  }

  static getUIKitML(keyOrUrl: string): string | null {
    const url = CacheManager.resolveUrl(keyOrUrl);
    return CacheManager.getAsset<string>(url) ?? null;
  }
}
