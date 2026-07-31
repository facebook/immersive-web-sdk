/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { canonicalizeJson, sha256 } from './serialize.js';
import type {
  SceneComponentCatalog,
  SceneComponentSchema,
  Sha256,
} from './types.js';

/** Build an immutable, ID-addressable catalog from runtime component schemas. */
export function createSceneComponentCatalog(
  schemas: readonly SceneComponentSchema[],
): SceneComponentCatalog {
  const catalog: Record<string, SceneComponentSchema> = {};
  for (const schema of schemas) {
    if (schema.id.trim().length === 0) {
      throw new Error('Component schema IDs must not be blank');
    }
    if (catalog[schema.id] != null) {
      throw new Error(`Duplicate component schema ID "${schema.id}"`);
    }
    catalog[schema.id] = structuredClone(schema);
  }
  return Object.freeze(catalog);
}

export function mergeSceneComponentCatalogs(
  ...catalogs: readonly SceneComponentCatalog[]
): SceneComponentCatalog {
  return createSceneComponentCatalog(
    catalogs.flatMap((catalog) => Object.values(catalog)),
  );
}

/** Stable structural fingerprint shared by editor and runtime capabilities. */
export function hashSceneComponentSchema(schema: SceneComponentSchema): Sha256 {
  return sha256(canonicalizeJson(structuralComponentSchema(schema)));
}

/** Presentation metadata does not invalidate authored component payloads. */
export function structuralComponentSchema(
  schema: SceneComponentSchema,
): SceneComponentSchema {
  return {
    id: schema.id,
    fields: Object.fromEntries(
      Object.entries(schema.fields).map(([name, field]) => [
        name,
        {
          type: field.type,
          ...(field.default === undefined ? {} : { default: field.default }),
          ...(field.enum == null ? {} : { enum: field.enum }),
          ...(field.min == null ? {} : { min: field.min }),
          ...(field.max == null ? {} : { max: field.max }),
        },
      ]),
    ),
  };
}
