/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { sha256 } from './hash.js';
import type {
  JsonValue,
  RuntimeSceneDocument,
  SceneDocument,
  SceneReview,
  Sha256,
} from './types.js';
import { deepClone, isJsonValue } from './utils.js';
import {
  assertValidSceneDocument,
  assertValidSceneReview,
  type SceneDocumentValidationOptions,
} from './validation.js';

const DOCUMENT_INTEGRITY_VALIDATION_OPTIONS = {
  validateAuthoringWorkflow: false,
} as const;

export function parseSceneDocument(
  text: string,
  validationOptions: SceneDocumentValidationOptions = {},
): SceneDocument {
  const value = JSON.parse(text) as unknown;
  assertValidSceneDocument(value, validationOptions);
  return value;
}

export function parseSceneReview(text: string): SceneReview {
  const value = JSON.parse(text) as unknown;
  assertValidSceneReview(value);
  return value;
}

export function serializeSceneDocument(
  document: SceneDocument,
  validationOptions: SceneDocumentValidationOptions = DOCUMENT_INTEGRITY_VALIDATION_OPTIONS,
): string {
  assertValidSceneDocument(document, validationOptions);
  return `${JSON.stringify(sortJsonValue(document), null, 2)}\n`;
}

export function serializeSceneReview(review: SceneReview): string {
  assertValidSceneReview(review);
  return `${JSON.stringify(sortJsonValue(review), null, 2)}\n`;
}

/** RFC 8785 JSON Canonicalization Scheme serialization. */
export function canonicalizeJson(value: JsonValue | object): string {
  if (!isJsonValue(value)) {
    throw new Error('Canonical JSON input must be finite JSON data');
  }
  return canonicalizeValue(value);
}

export function serializeCanonicalSceneDocument(
  document: SceneDocument,
  validationOptions: SceneDocumentValidationOptions = DOCUMENT_INTEGRITY_VALIDATION_OPTIONS,
): string {
  assertValidSceneDocument(document, validationOptions);
  return canonicalizeJson(document);
}

export function projectRuntimeSceneDocument(
  document: SceneDocument,
  validationOptions: SceneDocumentValidationOptions = DOCUMENT_INTEGRITY_VALIDATION_OPTIONS,
): RuntimeSceneDocument {
  assertValidSceneDocument(document, validationOptions);
  const projected = deepClone(document);
  delete projected.authoring;
  delete projected.imports;
  return projected;
}

export function serializeCanonicalRuntimeSceneDocument(
  document: SceneDocument,
  validationOptions: SceneDocumentValidationOptions = DOCUMENT_INTEGRITY_VALIDATION_OPTIONS,
): string {
  return canonicalizeJson(
    projectRuntimeSceneDocument(document, validationOptions),
  );
}

export function hashSceneDocument(
  document: SceneDocument,
  validationOptions: SceneDocumentValidationOptions = DOCUMENT_INTEGRITY_VALIDATION_OPTIONS,
): Sha256 {
  return sha256(serializeCanonicalSceneDocument(document, validationOptions));
}

export function hashRuntimeSceneDocument(
  document: SceneDocument,
  validationOptions: SceneDocumentValidationOptions = DOCUMENT_INTEGRITY_VALIDATION_OPTIONS,
): Sha256 {
  return sha256(
    serializeCanonicalRuntimeSceneDocument(document, validationOptions),
  );
}

export { sha256 };

export function sortJsonValue<T extends JsonValue | object>(value: T): T {
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

function canonicalizeValue(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeValue(entry)).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalizeValue(value[key] as JsonValue)}`,
    )
    .join(',')}}`;
}
