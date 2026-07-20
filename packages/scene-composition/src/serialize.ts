/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { JsonValue, SceneDocument } from './types.js';
import { assertValidSceneDocument } from './validation.js';

export function parseSceneDocument(text: string): SceneDocument {
  const value = JSON.parse(text) as unknown;
  assertValidSceneDocument(value);
  return value;
}

export function serializeSceneDocument(document: SceneDocument): string {
  assertValidSceneDocument(document);
  return `${JSON.stringify(sortJsonValue(document), null, 2)}\n`;
}

export function sortJsonValue<T extends JsonValue | SceneDocument>(
  value: T,
): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry)) as T;
  }

  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJsonValue(
        (value as Record<string, JsonValue>)[key],
      ) as JsonValue;
    }
    return sorted as T;
  }

  return value;
}
