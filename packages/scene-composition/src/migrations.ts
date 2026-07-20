/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CURRENT_SCENE_VERSION,
  type JsonObject,
  type SceneDocument,
} from './types.js';
import { deepClone, isPlainObject } from './utils.js';
import { assertValidSceneDocument } from './validation.js';

const PREVIOUS_SCENE_VERSION = 'iwsdk.scene.v0';

export function migrateSceneDocument(value: unknown): SceneDocument {
  if (!isPlainObject(value)) {
    throw new Error('Cannot migrate scene document: value must be an object');
  }

  if (value.version === CURRENT_SCENE_VERSION) {
    const current = deepClone(value) as unknown as SceneDocument;
    assertValidSceneDocument(current);
    return current;
  }

  if (value.version !== PREVIOUS_SCENE_VERSION) {
    throw new Error(
      `Unsupported scene document version "${String(value.version)}"`,
    );
  }

  const previousMetadata = isPlainObject(value.metadata)
    ? (value.metadata as JsonObject)
    : {};
  const migrated = {
    ...deepClone(value),
    metadata: {
      ...previousMetadata,
      migratedFrom: PREVIOUS_SCENE_VERSION,
    },
    units: value.units ?? 'meters',
    version: CURRENT_SCENE_VERSION,
  };

  assertValidSceneDocument(migrated);
  return migrated;
}
