/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { get as httpsGet } from 'node:https';

/** Probe only a local self-signed development URL without changing global TLS. */
export function fetchDevelopmentUrl(url, redirectsRemaining = 5) {
  return new Promise((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        // Mirrors a developer accepting the expected localhost certificate
        // warning without weakening trust for any other process traffic.
        rejectUnauthorized: false,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          response.headers.location != null &&
          redirectsRemaining > 0
        ) {
          response.resume();
          resolve(
            fetchDevelopmentUrl(
              new URL(response.headers.location, url).href,
              redirectsRemaining - 1,
            ),
          );
          return;
        }
        response.once('error', reject);
        response.once('end', () => {
          resolve({ ok: status >= 200 && status < 300, status });
        });
        response.resume();
      },
    );
    request.once('error', reject);
    request.setTimeout(2_000, () => {
      request.destroy(new Error(`Timed out probing ${url}`));
    });
  });
}

/** Match both the local Vite route and immutable package-CDN asset layouts. */
export function isExampleAssetRequest(url, assetId) {
  const pathname = new URL(url).pathname;
  return (
    pathname.includes(`/iwsdk-assets/${assetId}/`) ||
    pathname.includes(`/assets/${assetId}/`)
  );
}
