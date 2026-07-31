/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { sha256 } from './hash.js';
import { canonicalizeJson } from './serialize.js';
import type {
  SceneComposition,
  SceneDocument,
  SceneNodeAnnotation,
  SceneAuthoringView,
  Sha256,
} from './types.js';

export interface SceneReviewContract {
  composition: SceneComposition;
  nodeAnnotations: SceneNodeAnnotation[];
  views: SceneAuthoringView[];
}

/**
 * Return the authoring fields that define what a composed scene must prove.
 * Legacy editor payloads are deliberately excluded from the contract identity.
 */
export function projectSceneReviewContract(
  document: SceneDocument,
): SceneReviewContract | null {
  const composition = document.authoring?.composition;
  if (composition == null) {
    return null;
  }
  return {
    composition,
    nodeAnnotations: document.authoring?.nodeAnnotations ?? [],
    views: document.authoring?.views ?? [],
  };
}

export function hashSceneReviewContract(
  document: SceneDocument,
): Sha256 | null {
  const contract = projectSceneReviewContract(document);
  return contract == null ? null : sha256(canonicalizeJson(contract));
}

export function collectSceneReviewCriterionKeys(
  document: SceneDocument,
): Set<string> {
  const keys = new Set<string>();
  for (const feature of document.authoring?.composition?.features ?? []) {
    for (const criterion of feature.acceptance) {
      keys.add(`${feature.id}\u0000${criterion.id}`);
    }
  }
  return keys;
}
