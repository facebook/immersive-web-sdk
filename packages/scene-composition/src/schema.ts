/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CURRENT_SCENE_VERSION, type JsonObject } from './types.js';

export const SCENE_DOCUMENT_SCHEMA_ID =
  'https://iwsdk.dev/schemas/iwsdk.scene.v1.schema.json';

export const SCENE_DOCUMENT_JSON_SCHEMA = {
  $id: SCENE_DOCUMENT_SCHEMA_ID,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'IWSDK Scene Document',
  description:
    'Declarative IWSDK scene document for native editor and agentic scene composition workflows.',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'units', 'nodes'],
  properties: {
    version: {
      const: CURRENT_SCENE_VERSION,
      description: 'Scene document schema version.',
    },
    units: {
      const: 'meters',
      description: 'Scene unit system. IWSDK scene documents use meters.',
    },
    assets: {
      type: 'array',
      items: { $ref: '#/$defs/asset' },
      description: 'Asset catalog entries referenced by scene nodes.',
    },
    componentSchemas: {
      type: 'array',
      items: { $ref: '#/$defs/componentSchema' },
      description:
        'Typed component field schemas used by the editor and agent tooling.',
    },
    nodes: {
      type: 'array',
      items: { $ref: '#/$defs/node' },
      description: 'Top-level scene nodes.',
    },
    editor: { $ref: '#/$defs/jsonObject' },
    metadata: { $ref: '#/$defs/jsonObject' },
  },
  $defs: {
    asset: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'uri'],
      properties: {
        id: { type: 'string', minLength: 1 },
        uri: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        type: {
          enum: ['gltf', 'image', 'audio', 'video', 'other'],
        },
        bounds: { $ref: '#/$defs/bounds' },
        metadata: { $ref: '#/$defs/jsonObject' },
      },
    },
    bounds: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: {
        min: { $ref: '#/$defs/vec3' },
        max: { $ref: '#/$defs/vec3' },
      },
    },
    node: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        asset: { type: 'string', minLength: 1 },
        transform: { $ref: '#/$defs/transform' },
        components: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/componentValue' },
        },
        children: {
          type: 'array',
          items: { $ref: '#/$defs/node' },
        },
        editor: { $ref: '#/$defs/jsonObject' },
        metadata: { $ref: '#/$defs/jsonObject' },
      },
    },
    componentValue: {
      anyOf: [
        { $ref: '#/$defs/jsonValue' },
        { $ref: '#/$defs/typedComponent' },
      ],
    },
    typedComponent: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        type: { type: 'string', minLength: 1 },
        props: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/jsonValue' },
        },
      },
    },
    componentSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        source: { enum: ['iwsdk', 'app', 'scene'] },
        fields: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/componentFieldSchema' },
        },
      },
    },
    componentFieldSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        type: {
          enum: [
            'Int8',
            'Int16',
            'Int32',
            'Entity',
            'Float32',
            'Float64',
            'Boolean',
            'String',
            'FilePath',
            'Object',
            'Vec2',
            'Vec3',
            'Vec4',
            'Color',
            'Enum',
          ],
        },
        default: { $ref: '#/$defs/jsonValue' },
        description: { type: 'string' },
        enum: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        fileTypes: { type: 'string' },
        subfolder: { type: 'string' },
        min: { type: 'number' },
        max: { type: 'number' },
        internal: { type: 'boolean' },
      },
    },
    transform: {
      type: 'object',
      additionalProperties: false,
      properties: {
        position: { $ref: '#/$defs/vec3' },
        rotationDeg: { $ref: '#/$defs/vec3' },
        scale: {
          oneOf: [
            {
              type: 'number',
              exclusiveMinimum: 0,
            },
            { $ref: '#/$defs/positiveVec3' },
          ],
        },
        lookAt: { $ref: '#/$defs/vec3' },
        placeOn: {
          oneOf: [
            { type: 'string', minLength: 1 },
            { $ref: '#/$defs/placeOn' },
          ],
        },
      },
    },
    placeOn: {
      type: 'object',
      additionalProperties: false,
      required: ['target'],
      properties: {
        target: { type: 'string', minLength: 1 },
        clearance: { type: 'number' },
        align: { enum: ['center', 'preserve-xz'] },
      },
    },
    vec3: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'number' },
    },
    positiveVec3: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'number',
        exclusiveMinimum: 0,
      },
    },
    jsonObject: {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/jsonValue' },
    },
    jsonValue: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' },
        {
          type: 'array',
          items: { $ref: '#/$defs/jsonValue' },
        },
        {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/jsonValue' },
        },
      ],
    },
  },
} as const satisfies JsonObject;
