/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CacheManager } from '../cache-manager.js';

/** Default upper bound for one asset load. @category Assets */
export const DEFAULT_ASSET_LOAD_TIMEOUT_MS = 30_000;

/** Low-level timeout raised by an individual asset loader. */
export class AssetLoadTimeoutError extends Error {
  constructor(
    readonly url: string,
    readonly timeoutMs: number,
  ) {
    super(`Asset load timed out after ${timeoutMs} ms: ${url}`);
    this.name = 'AssetLoadTimeoutError';
  }
}

export interface CachedAssetLoadOptions<T> {
  /** Dispose a late result that arrives after its request timed out. */
  discard?: (asset: T) => void;
  /** Start the underlying loader. The optional return value cancels it. */
  load: (
    resolve: (asset: T) => void,
    reject: (error: unknown) => void,
  ) => (() => void) | void;
  /** Replace, rather than join, an existing in-flight request. */
  replacePending?: boolean;
  timeoutMs?: number;
  url: string;
}

/**
 * Run one cache-backed load with request de-duplication and a finite timeout.
 *
 * Late callbacks are ignored after timeout and cannot publish into the cache.
 * A loader may provide `discard` to release resources created by such a late
 * callback. Replaced requests still settle for their original callers, but
 * only the currently registered request may update shared cache state.
 */
export function loadCachedAsset<T>({
  discard,
  load,
  replacePending = false,
  timeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  url,
}: CachedAssetLoadOptions<T>): Promise<T> {
  assertAssetLoadTimeout(timeoutMs);

  if (!replacePending) {
    const pending = CacheManager.getPromise<T>(url);
    if (pending != null) {
      return pending;
    }
    const cached = CacheManager.getAsset<T>(url);
    if (cached != null) {
      return Promise.resolve(cached);
    }
  }

  let active = true;
  let cancel: (() => void) | void;
  let resolvePromise!: (asset: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  CacheManager.setPromise(url, promise);
  const timer = setTimeout(() => {
    if (!active) {
      return;
    }
    active = false;
    try {
      cancel?.();
    } catch {
      // Timeout identity wins; cancellation is best-effort cleanup only.
    }
    CacheManager.deletePromise(url, promise);
    rejectPromise(new AssetLoadTimeoutError(url, timeoutMs));
  }, timeoutMs);

  const resolve = (asset: T): void => {
    if (!active) {
      discard?.(asset);
      return;
    }
    active = false;
    clearTimeout(timer);
    if (CacheManager.getPromise(url) === promise) {
      CacheManager.setAsset(url, asset);
      CacheManager.deletePromise(url, promise);
    }
    resolvePromise(asset);
  };

  const reject = (error: unknown): void => {
    if (!active) {
      return;
    }
    active = false;
    clearTimeout(timer);
    CacheManager.deletePromise(url, promise);
    rejectPromise(error);
  };

  try {
    cancel = load(resolve, reject);
  } catch (error) {
    reject(error);
  }
  return promise;
}

export function assertAssetLoadTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Asset load timeout must be a positive finite number');
  }
}
