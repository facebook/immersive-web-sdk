/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Central cache for assets and in-flight loads used by {@link AssetManager}.
 *
 * @remarks
 * - Tracks a key→URL registry so callers may refer to assets by logical keys.
 * - De-duplicates concurrent requests via a promise cache.
 * - Stores resolved assets for fast reuse.
 *
 * @category Assets
 */
export class CacheManager {
  private static cache = new Map<string, any>();
  private static promiseCache = new Map<string, Promise<any>>();
  private static keyToUrl = new Map<string, string>();

  /** Record a logical key → URL mapping. */
  static setKeyToUrl(key: string, url: string): void {
    this.keyToUrl.set(key, url);
  }

  /** Resolve a key or pass-through a URL. */
  static resolveUrl(urlOrKey: string): string {
    return this.keyToUrl.get(urlOrKey) ?? urlOrKey;
  }

  /** True if an in-flight promise exists for URL. */
  static hasPromise(url: string): boolean {
    return this.promiseCache.has(url);
  }

  /** Get the in-flight promise for URL (if any). */
  static getPromise<T>(url: string): Promise<T> | undefined {
    return this.promiseCache.get(url) as Promise<T>;
  }

  /** Store an in-flight promise for URL. */
  static setPromise<T>(url: string, promise: Promise<T>): void {
    this.promiseCache.set(url, promise);
  }

  /** Remove in-flight promise (on resolve/reject). */
  static deletePromise(url: string): void {
    this.promiseCache.delete(url);
  }

  /** True if an asset has been cached for URL. */
  static hasAsset(url: string): boolean {
    return this.cache.has(url);
  }

  /** Retrieve a cached asset by URL. */
  static getAsset<T>(url: string): T | undefined {
    return this.cache.get(url) as T;
  }

  /** Store an asset by URL. */
  static setAsset<T>(url: string, asset: T): void {
    this.cache.set(url, asset);
  }

  /** Lookup asset by logical key or direct URL. */
  static getAssetByKey(key: string): any {
    // First check if this is a URL (direct cache access)
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Otherwise, look up the URL from the key registry
    const url = this.keyToUrl.get(key);
    if (url) {
      return this.cache.get(url);
    }

    return undefined;
  }

  /** Clear caches (useful during tests). */
  static clear(): void {
    this.cache.clear();
    this.promiseCache.clear();
    this.keyToUrl.clear();
  }
}
