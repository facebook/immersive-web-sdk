/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CURRENT_SCENE_REVIEW_VERSION,
  CURRENT_SCENE_VERSION,
  MAX_SCENE_CORRECTION_ROUNDS,
  type JsonObject,
} from './types.js';

export const SCENE_DOCUMENT_SCHEMA_ID =
  'https://iwsdk.dev/schemas/iwsdk.scene.v1.schema.json';

/**
 * Normative syntax for an IWSDK v1 authoring document. Cross-reference
 * resolution, namespace uniqueness, cycle detection, and runtime capability
 * checks are semantic validation performed after this structural schema.
 */
export const SCENE_DOCUMENT_JSON_SCHEMA = {
  $id: SCENE_DOCUMENT_SCHEMA_ID,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'IWSDK Scene Document v1',
  description:
    'Closed declarative scene document shared by IWSDK authoring, editor, and runtime projection workflows.',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'units', 'resources', 'nodes'],
  properties: {
    version: {
      const: CURRENT_SCENE_VERSION,
      description: 'Scene document schema version.',
    },
    units: {
      const: 'meters',
      description: 'Scene unit system. IWSDK scene documents use meters.',
    },
    imports: {
      type: 'array',
      items: { $ref: '#/$defs/sceneImport' },
      description:
        'Ordered reusable scene modules resolved before runtime projection.',
    },
    components: {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/componentValue' },
      description:
        'Components applied to the runtime level-root entity. An explicit empty map disables implicit root components.',
    },
    metadata: { $ref: '#/$defs/jsonObject' },
    authoring: { $ref: '#/$defs/authoring' },
    resources: { $ref: '#/$defs/resources' },
    environment: { $ref: '#/$defs/environment' },
    nodes: {
      type: 'array',
      items: { $ref: '#/$defs/node' },
      description: 'Ordered top-level scene hierarchy.',
    },
  },
  $defs: {
    identifier: { type: 'string', minLength: 1 },
    color: {
      type: 'string',
      pattern: '^#[0-9a-fA-F]{6}$',
    },
    sha256Digest: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{64}$',
    },
    sha256Hash: {
      type: 'string',
      pattern: '^sha256:[0-9a-fA-F]{64}$',
    },
    vec2: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'number' },
    },
    vec3: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'number' },
    },
    vec4: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'number' },
    },
    normalizedVec2: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'number', minimum: 0, maximum: 1 },
    },
    normalizedVec4: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'number', minimum: 0, maximum: 1 },
    },
    positiveVec2: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'number', exclusiveMinimum: 0 },
    },
    positiveVec3: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'number', exclusiveMinimum: 0 },
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
    transform: {
      type: 'object',
      additionalProperties: false,
      properties: {
        position: { $ref: '#/$defs/vec3' },
        rotationDeg: { $ref: '#/$defs/vec3' },
        scale: {
          oneOf: [
            { type: 'number', exclusiveMinimum: 0 },
            { $ref: '#/$defs/positiveVec3' },
          ],
        },
      },
    },
    sceneImport: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'src'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        src: { type: 'string', minLength: 1 },
        transform: { $ref: '#/$defs/transform' },
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
    componentValue: { $ref: '#/$defs/jsonObject' },
    resources: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prefabs: {
          type: 'array',
          items: { $ref: '#/$defs/prefab' },
        },
      },
    },
    prefab: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'root'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        root: { $ref: '#/$defs/node' },
      },
    },
    prefabNodeOverride: {
      type: 'object',
      additionalProperties: false,
      properties: {
        transform: { $ref: '#/$defs/transform' },
        components: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/componentValue' },
        },
        visible: { type: 'boolean' },
      },
    },
    prefabOverrideMap: {
      type: 'object',
      propertyNames: { minLength: 1 },
      additionalProperties: { $ref: '#/$defs/prefabNodeOverride' },
    },
    patternVariation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scale: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'number', exclusiveMinimum: 0 },
        },
        yawDeg: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'number' },
        },
        positionJitter: { $ref: '#/$defs/vec3' },
      },
    },
    patternDistribution: {
      oneOf: [
        { $ref: '#/$defs/linearDistribution' },
        { $ref: '#/$defs/gridDistribution' },
        { $ref: '#/$defs/radialDistribution' },
        { $ref: '#/$defs/alongPathDistribution' },
        { $ref: '#/$defs/scatterDistribution' },
        { $ref: '#/$defs/explicitDistribution' },
      ],
    },
    linearDistribution: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'count', 'step'],
      properties: {
        type: { const: 'linear' },
        count: { type: 'integer', minimum: 1, maximum: 100000 },
        step: { $ref: '#/$defs/vec3' },
        variation: { $ref: '#/$defs/patternVariation' },
      },
    },
    gridDistribution: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'count', 'spacing'],
      properties: {
        type: { const: 'grid' },
        count: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'integer', minimum: 1, maximum: 100000 },
        },
        spacing: { $ref: '#/$defs/vec3' },
        variation: { $ref: '#/$defs/patternVariation' },
      },
    },
    radialDistribution: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'count', 'radius'],
      properties: {
        type: { const: 'radial' },
        count: { type: 'integer', minimum: 1, maximum: 100000 },
        radius: { type: 'number', minimum: 0 },
        startAngleDeg: { type: 'number' },
        arcDeg: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 360,
        },
        faceCenter: { type: 'boolean' },
        variation: { $ref: '#/$defs/patternVariation' },
      },
    },
    alongPathDistribution: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'points', 'count'],
      properties: {
        type: { const: 'along-path' },
        points: {
          type: 'array',
          minItems: 2,
          items: { $ref: '#/$defs/vec3' },
        },
        count: { type: 'integer', minimum: 1, maximum: 100000 },
        orientToPath: { type: 'boolean' },
        variation: { $ref: '#/$defs/patternVariation' },
      },
    },
    scatterRegion: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'size'],
          properties: {
            type: { const: 'box' },
            size: { $ref: '#/$defs/positiveVec3' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'radius'],
          properties: {
            type: { const: 'sphere' },
            radius: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      ],
    },
    scatterDistribution: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'count', 'seed', 'algorithm', 'collision', 'region'],
      properties: {
        type: { const: 'scatter' },
        count: { type: 'integer', minimum: 1, maximum: 100000 },
        seed: { type: 'integer' },
        algorithm: { const: 'pcg32-box-rejection-v1' },
        collision: { enum: ['allow', 'skip'] },
        region: { $ref: '#/$defs/scatterRegion' },
        variation: { $ref: '#/$defs/patternVariation' },
      },
    },
    explicitDistribution: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'transforms'],
      properties: {
        type: { const: 'explicit' },
        transforms: {
          type: 'array',
          minItems: 1,
          maxItems: 100000,
          items: { $ref: '#/$defs/transform' },
        },
      },
    },
    nodeContent: {
      oneOf: [
        { $ref: '#/$defs/groupContent' },
        { $ref: '#/$defs/assetContent' },
        { $ref: '#/$defs/instanceContent' },
        { $ref: '#/$defs/patternContent' },
      ],
    },
    groupContent: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: { type: { const: 'group' } },
    },
    assetContent: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'asset'],
      properties: {
        type: { const: 'asset' },
        asset: { $ref: '#/$defs/identifier' },
        castShadow: { type: 'boolean' },
        receiveShadow: { type: 'boolean' },
      },
    },
    instanceContent: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'prefab'],
      properties: {
        type: { const: 'instance' },
        prefab: { $ref: '#/$defs/identifier' },
        overrides: { $ref: '#/$defs/prefabOverrideMap' },
      },
    },
    patternContent: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'prefab', 'distribution'],
      properties: {
        type: { const: 'pattern' },
        prefab: { $ref: '#/$defs/identifier' },
        distribution: { $ref: '#/$defs/patternDistribution' },
        overrides: { $ref: '#/$defs/prefabOverrideMap' },
      },
    },
    nodeConstraints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        lookAt: { $ref: '#/$defs/lookAtConstraint' },
      },
    },
    lookAtConstraint: {
      type: 'object',
      additionalProperties: false,
      required: ['target', 'mode'],
      properties: {
        target: { $ref: '#/$defs/vec3' },
        mode: { const: 'yaw-v1' },
      },
    },
    node: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        name: { type: 'string', minLength: 1 },
        framingRole: { default: 'content', enum: ['content', 'support'] },
        content: { $ref: '#/$defs/nodeContent' },
        transform: { $ref: '#/$defs/transform' },
        constraints: { $ref: '#/$defs/nodeConstraints' },
        components: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/componentValue' },
        },
        children: {
          type: 'array',
          items: { $ref: '#/$defs/node' },
        },
        metadata: { $ref: '#/$defs/jsonObject' },
      },
    },
    background: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'color'],
          properties: {
            type: { const: 'color' },
            color: { $ref: '#/$defs/color' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'topColor', 'bottomColor'],
          properties: {
            type: { const: 'gradient' },
            topColor: { $ref: '#/$defs/color' },
            bottomColor: { $ref: '#/$defs/color' },
            exponent: {
              type: 'number',
              exclusiveMinimum: 0,
              maximum: 8,
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type'],
          properties: { type: { const: 'transparent' } },
        },
      ],
    },
    fog: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'near', 'far'],
          properties: {
            type: { const: 'linear' },
            color: { $ref: '#/$defs/color' },
            near: { type: 'number', minimum: 0 },
            far: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'density'],
          properties: {
            type: { const: 'exponential' },
            color: { $ref: '#/$defs/color' },
            density: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      ],
    },
    arEnvironment: {
      type: 'object',
      additionalProperties: false,
      required: ['background', 'lights'],
      properties: {
        background: { enum: ['transparent', 'environment'] },
        lights: { enum: ['authored', 'estimated', 'combined'] },
      },
    },
    imageBasedLighting: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        type: { const: 'room' },
        intensity: { type: 'number', minimum: 0, maximum: 4 },
        sigma: {
          type: 'number',
          minimum: 0,
          maximum: 0.04,
          description:
            'Room-environment PMREM blur in radians, capped at the renderer sample limit.',
        },
      },
    },
    environment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        background: { $ref: '#/$defs/background' },
        fog: { $ref: '#/$defs/fog' },
        toneMapping: {
          enum: ['none', 'linear', 'reinhard', 'cineon', 'aces'],
        },
        exposure: { type: 'number', minimum: 0 },
        shadows: { type: 'boolean' },
        shadowMapType: { enum: ['basic', 'pcf', 'pcf-soft'] },
        imageBasedLighting: { $ref: '#/$defs/imageBasedLighting' },
        ar: { $ref: '#/$defs/arEnvironment' },
      },
    },
    sourceReference: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'uri', 'roles', 'width', 'height', 'sha256'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        uri: { type: 'string', minLength: 1 },
        roles: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { enum: ['layout', 'identity', 'palette', 'style'] },
        },
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
        sha256: { $ref: '#/$defs/sha256Digest' },
      },
    },
    compositionInput: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { enum: ['text', 'image', 'hybrid'] },
        prompt: { type: 'string', minLength: 1 },
        references: {
          type: 'array',
          items: { $ref: '#/$defs/sourceReference' },
        },
      },
    },
    compositionTarget: {
      type: 'object',
      additionalProperties: false,
      required: ['surfaces', 'assetPolicy'],
      properties: {
        surfaces: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { enum: ['browser', 'vr', 'ar', 'shared'] },
        },
        style: { type: 'string', minLength: 1 },
        assetPolicy: { const: 'manifest-assets' },
      },
    },
    acceptedApproximation: {
      type: 'object',
      additionalProperties: false,
      required: ['feature', 'requested', 'implementation', 'status'],
      properties: {
        feature: { $ref: '#/$defs/identifier' },
        requested: { type: 'string', minLength: 1 },
        implementation: { type: 'string', minLength: 1 },
        status: { const: 'accepted' },
      },
    },
    representationPolicy: {
      type: 'object',
      additionalProperties: false,
      required: ['fidelityCeiling', 'allowed'],
      properties: {
        fidelityCeiling: { type: 'string', minLength: 1 },
        allowed: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: {
            enum: ['asset', 'prefab', 'pattern'],
          },
        },
        acceptedApproximations: {
          type: 'array',
          items: { $ref: '#/$defs/acceptedApproximation' },
        },
      },
    },
    featureAcceptance: {
      oneOf: [
        { $ref: '#/$defs/presenceAcceptance' },
        { $ref: '#/$defs/countAcceptance' },
        { $ref: '#/$defs/projectedRegionAcceptance' },
        { $ref: '#/$defs/spatialRelationAcceptance' },
        { $ref: '#/$defs/visualJudgmentAcceptance' },
      ],
    },
    presenceAcceptance: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'nodeRefs'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        kind: { const: 'presence' },
        nodeRefs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/identifier' },
        },
        view: { $ref: '#/$defs/identifier' },
      },
    },
    countAcceptance: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind'],
      allOf: [
        {
          anyOf: [
            {
              properties: { nodeRefs: {} },
              required: ['nodeRefs'],
            },
            {
              properties: { pattern: {} },
              required: ['pattern'],
            },
          ],
        },
        {
          anyOf: [
            {
              properties: { equals: {} },
              required: ['equals'],
            },
            {
              properties: { minimum: {} },
              required: ['minimum'],
            },
            {
              properties: { maximum: {} },
              required: ['maximum'],
            },
          ],
        },
      ],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        kind: { const: 'count' },
        nodeRefs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/identifier' },
        },
        pattern: { $ref: '#/$defs/identifier' },
        equals: { type: 'integer', minimum: 0 },
        minimum: { type: 'integer', minimum: 0 },
        maximum: { type: 'integer', minimum: 0 },
      },
    },
    projectedRegionAcceptance: {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'kind',
        'measurement',
        'nodeRefs',
        'view',
        'reference',
        'region',
      ],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        kind: { const: 'projected-region' },
        measurement: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['method', 'applicability'],
              properties: {
                method: { const: 'projected-world-aabb-v1' },
                applicability: { const: 'single-axis-aligned-box' },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['method', 'applicability'],
              properties: {
                method: { const: 'capture-node-mask-bounds-v1' },
                applicability: { const: 'visible-node-mask' },
              },
            },
          ],
        },
        nodeRefs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/identifier' },
        },
        view: { $ref: '#/$defs/identifier' },
        reference: { $ref: '#/$defs/identifier' },
        region: { $ref: '#/$defs/normalizedVec4' },
        centerTolerance: { type: 'number', minimum: 0 },
        extentTolerance: { type: 'number', minimum: 0 },
      },
    },
    spatialRelationAcceptance: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'nodeRefs', 'target', 'relation'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        kind: { const: 'spatial-relation' },
        nodeRefs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/identifier' },
        },
        target: { $ref: '#/$defs/identifier' },
        relation: {
          enum: [
            'above',
            'below',
            'left-of',
            'right-of',
            'in-front-of',
            'behind',
            'touching',
          ],
        },
        tolerance: { type: 'number', minimum: 0 },
      },
    },
    visualJudgmentAcceptance: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'view', 'criterion'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        kind: { const: 'visual-judgment' },
        view: { $ref: '#/$defs/identifier' },
        criterion: { type: 'string', minLength: 1 },
      },
    },
    featureEvidence: {
      type: 'object',
      additionalProperties: false,
      required: ['reference'],
      oneOf: [
        {
          properties: { region: {} },
          required: ['region'],
        },
        {
          properties: { point: {} },
          required: ['point'],
        },
      ],
      properties: {
        reference: { $ref: '#/$defs/identifier' },
        region: { $ref: '#/$defs/normalizedVec4' },
        point: { $ref: '#/$defs/normalizedVec2' },
      },
    },
    objectInspectionPart: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'description', 'nodeRefs'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        description: { type: 'string', minLength: 1 },
        nodeRefs: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { $ref: '#/$defs/identifier' },
        },
      },
    },
    objectInspectionContact: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'description', 'nodeRefs', 'targetNodeRefs'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        description: { type: 'string', minLength: 1 },
        nodeRefs: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { $ref: '#/$defs/identifier' },
        },
        targetNodeRefs: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { $ref: '#/$defs/identifier' },
        },
      },
    },
    objectInspectionContext: {
      type: 'object',
      additionalProperties: false,
      required: ['background', 'lighting'],
      properties: {
        background: { enum: ['authored', 'neutral'] },
        lighting: { enum: ['authored', 'neutral'] },
        includeNodeRefs: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { $ref: '#/$defs/identifier' },
        },
      },
    },
    objectInspectionSpec: {
      type: 'object',
      additionalProperties: false,
      required: [
        'silhouette',
        'proportions',
        'parts',
        'negativeSpace',
        'contacts',
        'materialResponse',
        'requiredViews',
        'context',
      ],
      properties: {
        silhouette: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { type: 'string', minLength: 1 },
        },
        proportions: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { type: 'string', minLength: 1 },
        },
        parts: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/objectInspectionPart' },
        },
        negativeSpace: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { type: 'string', minLength: 1 },
        },
        contacts: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/objectInspectionContact' },
        },
        materialResponse: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { type: 'string', minLength: 1 },
        },
        requiredViews: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { $ref: '#/$defs/identifier' },
        },
        context: { $ref: '#/$defs/objectInspectionContext' },
      },
    },
    feature: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'priority', 'description', 'nodeRefs', 'acceptance'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        priority: { enum: ['required', 'optional'] },
        description: { type: 'string', minLength: 1 },
        nodeRefs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/identifier' },
        },
        acceptance: {
          type: 'array',
          items: { $ref: '#/$defs/featureAcceptance' },
        },
        evidence: {
          type: 'array',
          items: { $ref: '#/$defs/featureEvidence' },
        },
        identityCritical: { type: 'boolean' },
        objectInspection: { $ref: '#/$defs/objectInspectionSpec' },
      },
    },
    assumption: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'statement', 'certainty'],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        statement: { type: 'string', minLength: 1 },
        certainty: { enum: ['low', 'medium', 'high'] },
      },
    },
    reviewConfiguration: {
      type: 'object',
      additionalProperties: false,
      required: ['heroView', 'requiredViews', 'lenses', 'maxCorrectionRounds'],
      properties: {
        heroView: { $ref: '#/$defs/identifier' },
        requiredViews: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { $ref: '#/$defs/identifier' },
        },
        lenses: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { enum: ['layout', 'geometry', 'final'] },
        },
        maxCorrectionRounds: {
          type: 'integer',
          minimum: 0,
          maximum: MAX_SCENE_CORRECTION_ROUNDS,
        },
      },
    },
    compositionFeasibility: {
      type: 'object',
      additionalProperties: false,
      required: ['status'],
      properties: {
        status: { enum: ['supported', 'conditional', 'blocked'] },
        reasons: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
      },
    },
    compilationProvenance: {
      type: 'object',
      additionalProperties: false,
      required: ['adapter', 'skill', 'capabilityHash', 'inputHashes'],
      properties: {
        adapter: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'version'],
          properties: {
            id: { $ref: '#/$defs/identifier' },
            version: { type: 'string', minLength: 1 },
          },
        },
        skill: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'version'],
          properties: {
            id: { const: 'iwsdk-scene-composer' },
            version: { type: 'string', minLength: 1 },
          },
        },
        capabilityHash: { $ref: '#/$defs/sha256Hash' },
        inputHashes: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { $ref: '#/$defs/sha256Hash' },
        },
      },
    },
    composition: {
      type: 'object',
      additionalProperties: false,
      required: [
        'mode',
        'input',
        'target',
        'feasibility',
        'provenance',
        'representationPolicy',
        'features',
        'review',
      ],
      properties: {
        mode: { const: 'static' },
        input: { $ref: '#/$defs/compositionInput' },
        target: { $ref: '#/$defs/compositionTarget' },
        feasibility: { $ref: '#/$defs/compositionFeasibility' },
        provenance: { $ref: '#/$defs/compilationProvenance' },
        representationPolicy: { $ref: '#/$defs/representationPolicy' },
        features: {
          type: 'array',
          items: { $ref: '#/$defs/feature' },
        },
        assumptions: {
          type: 'array',
          items: { $ref: '#/$defs/assumption' },
        },
        review: { $ref: '#/$defs/reviewConfiguration' },
      },
    },
    nodeAnnotation: {
      type: 'object',
      additionalProperties: false,
      required: ['node', 'reviewLayer'],
      properties: {
        node: { $ref: '#/$defs/identifier' },
        featureRefs: {
          type: 'array',
          items: { $ref: '#/$defs/identifier' },
        },
        reviewLayer: { enum: ['layout', 'geometry', 'final'] },
      },
    },
    authoringView: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'role', 'projection', 'position', 'target', 'fov'],
          properties: {
            id: { $ref: '#/$defs/identifier' },
            role: { enum: ['hero', 'diagnostic'] },
            projection: { const: 'perspective' },
            position: { $ref: '#/$defs/vec3' },
            target: { $ref: '#/$defs/vec3' },
            fov: {
              type: 'number',
              exclusiveMinimum: 0,
              exclusiveMaximum: 180,
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'role',
            'projection',
            'position',
            'target',
            'height',
          ],
          properties: {
            id: { $ref: '#/$defs/identifier' },
            role: { enum: ['hero', 'diagnostic'] },
            projection: { const: 'orthographic' },
            position: { $ref: '#/$defs/vec3' },
            target: { $ref: '#/$defs/vec3' },
            height: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      ],
    },
    authoring: {
      type: 'object',
      additionalProperties: false,
      properties: {
        composition: { $ref: '#/$defs/composition' },
        nodeAnnotations: {
          type: 'array',
          items: { $ref: '#/$defs/nodeAnnotation' },
        },
        views: {
          type: 'array',
          items: { $ref: '#/$defs/authoringView' },
        },
      },
    },
  },
} as const satisfies JsonObject;

export const SCENE_REVIEW_V1_SCHEMA_ID =
  'https://iwsdk.dev/schemas/iwsdk.scene-review.v1.schema.json';

/** Immutable review evidence bound to one document/runtime revision pair. */
export const SCENE_REVIEW_V1_JSON_SCHEMA = {
  $id: SCENE_REVIEW_V1_SCHEMA_ID,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'IWSDK Scene Review v1',
  description:
    'Closed evidence record for deterministic layout, geometry, and final scene review.',
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'documentHash',
    'runtimeHash',
    'capabilityHash',
    'sourceHashes',
    'round',
    'result',
    'lenses',
    'featureResults',
    'waivers',
    'stop',
  ],
  properties: {
    version: { const: CURRENT_SCENE_REVIEW_VERSION },
    documentHash: { $ref: '#/$defs/sha256' },
    runtimeHash: { $ref: '#/$defs/sha256' },
    capabilityHash: { $ref: '#/$defs/sha256' },
    sourceHashes: {
      type: 'array',
      items: { $ref: '#/$defs/sha256' },
    },
    round: {
      type: 'integer',
      minimum: 0,
      maximum: MAX_SCENE_CORRECTION_ROUNDS,
    },
    previousReview: { $ref: '#/$defs/reviewLineage' },
    correction: { $ref: '#/$defs/correctionLineage' },
    result: { enum: ['pass', 'accepted-with-gaps', 'fail'] },
    lenses: {
      type: 'array',
      items: { $ref: '#/$defs/lens' },
    },
    featureResults: {
      type: 'array',
      items: { $ref: '#/$defs/featureResult' },
    },
    waivers: {
      type: 'array',
      items: { $ref: '#/$defs/waiver' },
    },
    stop: { $ref: '#/$defs/stop' },
  },
  $defs: {
    identifier: { type: 'string', minLength: 1 },
    sha256: {
      type: 'string',
      pattern: '^sha256:[0-9a-fA-F]{64}$',
    },
    vec3: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'number' },
    },
    normalizedVec4: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'number', minimum: 0, maximum: 1 },
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
    camera: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['projection', 'position', 'target', 'fov'],
          properties: {
            projection: { const: 'perspective' },
            position: { $ref: '#/$defs/vec3' },
            target: { $ref: '#/$defs/vec3' },
            fov: {
              type: 'number',
              exclusiveMinimum: 0,
              exclusiveMaximum: 180,
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['projection', 'position', 'target', 'height'],
          properties: {
            projection: { const: 'orthographic' },
            position: { $ref: '#/$defs/vec3' },
            target: { $ref: '#/$defs/vec3' },
            height: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      ],
    },
    capture: {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'view',
        'path',
        'screenshotSha256',
        'width',
        'height',
        'camera',
        'rendererEnvironment',
        'visibleNodeIds',
      ],
      properties: {
        id: { $ref: '#/$defs/identifier' },
        view: { $ref: '#/$defs/identifier' },
        path: { type: 'string', minLength: 1 },
        screenshotSha256: { $ref: '#/$defs/sha256' },
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
        camera: { $ref: '#/$defs/camera' },
        rendererEnvironment: { $ref: '#/$defs/jsonObject' },
        visibleNodeIds: {
          type: 'array',
          items: { $ref: '#/$defs/identifier' },
        },
        nodeMaskRegions: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/normalizedVec4' },
        },
      },
    },
    reviewStatus: {
      enum: ['pass', 'partial', 'fail', 'not-applicable'],
    },
    lens: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'status', 'captures'],
      properties: {
        id: { enum: ['layout', 'geometry', 'final'] },
        status: { $ref: '#/$defs/reviewStatus' },
        captures: {
          type: 'array',
          items: { $ref: '#/$defs/capture' },
        },
      },
    },
    featureResult: {
      type: 'object',
      additionalProperties: false,
      required: ['feature', 'criterion', 'status', 'evidenceRefs'],
      properties: {
        feature: { $ref: '#/$defs/identifier' },
        criterion: { $ref: '#/$defs/identifier' },
        status: { $ref: '#/$defs/reviewStatus' },
        evidenceRefs: {
          type: 'array',
          items: { $ref: '#/$defs/identifier' },
        },
        observation: { type: 'string' },
      },
    },
    reviewLineage: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'reviewSha256'],
      properties: {
        path: { type: 'string', minLength: 1 },
        reviewSha256: { $ref: '#/$defs/sha256' },
      },
    },
    correctionLineage: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'correctionSha256'],
      properties: {
        path: { type: 'string', minLength: 1 },
        correctionSha256: { $ref: '#/$defs/sha256' },
      },
    },
    waiver: {
      type: 'object',
      additionalProperties: false,
      required: ['feature', 'criterion', 'reason', 'authorizedBy'],
      properties: {
        feature: { $ref: '#/$defs/identifier' },
        criterion: { $ref: '#/$defs/identifier' },
        reason: { type: 'string', minLength: 1 },
        authorizedBy: { const: 'user' },
      },
    },
    stop: {
      type: 'object',
      additionalProperties: false,
      required: ['reason', 'openDefectTags'],
      properties: {
        reason: {
          enum: [
            'success',
            'continue-refining',
            'round-limit',
            'repeated-defect',
            'oscillation',
            'plateau',
            'missing-input',
            'representation-gap',
          ],
        },
        openDefectTags: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    },
  },
} as const satisfies JsonObject;

export const SCENE_REVIEW_SCHEMA_ID = SCENE_REVIEW_V1_SCHEMA_ID;
export const SCENE_REVIEW_JSON_SCHEMA = SCENE_REVIEW_V1_JSON_SCHEMA;
