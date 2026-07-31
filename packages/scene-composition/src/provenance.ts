/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { sha256 } from './hash.js';
import type { SceneCompositionInput, Sha256 } from './types.js';

/**
 * Returns the complete identity set for declared composition inputs.
 * Prompt identity is derived from its exact UTF-8 bytes. Reference hashes are
 * declarations; callers need a trusted byte provider to verify referenced data.
 */
export function getSceneCompositionSourceHashes(
  input: SceneCompositionInput,
): Sha256[] {
  const hashes = new Set<Sha256>();
  if (input.prompt != null) {
    hashes.add(sha256(input.prompt));
  }
  input.references?.forEach((reference) => {
    hashes.add(`sha256:${reference.sha256.toLowerCase()}` as Sha256);
  });
  return [...hashes].sort();
}
