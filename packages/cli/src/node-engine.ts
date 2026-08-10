/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import semver from 'semver';

export function getUnsupportedNodeMessage(
  version: string,
  requiredRange: string,
): string | undefined {
  if (semver.satisfies(version, requiredRange, { includePrerelease: true })) {
    return undefined;
  }

  return (
    `Unsupported Node.js version: ${version}. IWSDK requires Node ${requiredRange}. ` +
    'Upgrade Node (for example with nvm or Volta) and retry.'
  );
}
