/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCENE_REVIEW_VERSION,
  CURRENT_SCENE_VERSION,
  SCENE_DOCUMENT_JSON_SCHEMA,
  SCENE_DOCUMENT_SCHEMA_ID,
  SCENE_REVIEW_JSON_SCHEMA,
  SCENE_REVIEW_SCHEMA_ID,
  SceneCommandHistory,
  applyScenePatch,
  canonicalizeJson,
  createSceneComponentCatalog,
  getNodeWorldBounds,
  getScenePatternInstanceCount,
  getScenePatternRequestedCount,
  getScenePrimitiveBounds,
  finalizeSceneReviewDraft,
  generateSceneProceduralTexture,
  hashSceneCapabilitySnapshot,
  hashSceneComponentSchema,
  hashRuntimeSceneDocument,
  hashSceneReviewContract,
  hashSceneDocument,
  parseSceneDocument,
  parseSceneReview,
  projectRuntimeSceneDocument,
  resolveLookAtYawDeg,
  resolveReparentTransform,
  resolveSceneAuthoringTransforms,
  serializeSceneDocument,
  serializeSceneReview,
  sha256,
  validateSceneCapabilities,
  validateSceneDocument,
  validateSceneReview,
  validateSceneReviewAgainstDocument,
  type SceneCapabilitySnapshot,
  type SceneDocument,
  type ScenePatternDistribution,
  type SceneReview,
} from '../src/index.js';

const HASH_A = `sha256:${'a'.repeat(64)}` as const;
const HASH_B = `sha256:${'b'.repeat(64)}` as const;
const HASH_C = `sha256:${'c'.repeat(64)}` as const;
const HASH_D = `sha256:${'d'.repeat(64)}` as const;
const MARKER_SCHEMA = {
  id: 'Marker',
  source: 'app' as const,
  fields: {
    enabled: { type: 'Boolean' as const },
    weight: { type: 'Float32' as const, min: 0, max: 1 },
  },
};
const DIRECTIONAL_LIGHT_SCHEMA = {
  id: 'DirectionalLight',
  source: 'iwsdk' as const,
  fields: {
    castShadow: { type: 'Boolean' as const, default: false },
    color: { type: 'Color' as const, default: [1, 1, 1, 1] },
    intensity: { type: 'Float32' as const, default: 1, min: 0 },
  },
};
const TEST_COMPONENT_CATALOG = createSceneComponentCatalog([
  MARKER_SCHEMA,
  DIRECTIONAL_LIGHT_SCHEMA,
]);
const LINK_COMPONENT_CATALOG = createSceneComponentCatalog([
  ...Object.values(TEST_COMPONENT_CATALOG),
  {
    id: 'LinkedResource',
    source: 'app' as const,
    fields: {
      source: { type: 'FilePath' as const },
      target: {
        required: true,
        type: 'Object' as const,
        widget: 'entity' as const,
      },
    },
  },
]);

const TEST_ASSET_BOUNDS: Record<
  string,
  { min: [number, number, number]; max: [number, number, number] }
> = {
  ground: { min: [-5, 0, -5], max: [5, 0, 5] },
  table: { min: [-0.6, -0.45, -0.6], max: [0.6, 0.45, 0.6] },
  chair: { min: [-0.6, 0, -0.6], max: [0.6, 1.2, 0.6] },
  flower: { min: [-0.1, 0, -0.1], max: [0.1, 0.4, 0.1] },
  'part-box': { min: [-1, -1, -2], max: [1, 1, 2] },
  'unit-box': { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
  'table-model': { min: [-1, 0, -1], max: [1, 1, 1] },
  'lamp-model': { min: [-0.25, 0, -0.25], max: [0.25, 0.5, 0.25] },
  'marker-body': { min: [-1, -0.5, -0.5], max: [1, 0.5, 0.5] },
};

const resolveTestAssetBounds = (assetId: string) => TEST_ASSET_BOUNDS[assetId];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function unresolvedLocalSchemaRefs(schema: unknown): string[] {
  const unresolved = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value == null || typeof value !== 'object') {
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.$ref === 'string' && record.$ref.startsWith('#/')) {
      const resolved = record.$ref
        .slice(2)
        .split('/')
        .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
        .reduce<unknown>((current, part) => {
          if (current == null || typeof current !== 'object') {
            return undefined;
          }
          return (current as Record<string, unknown>)[part];
        }, schema);
      if (resolved === undefined) {
        unresolved.add(record.$ref);
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(schema);
  return [...unresolved].sort();
}

function makeScene(): SceneDocument {
  return {
    version: CURRENT_SCENE_VERSION,
    units: 'meters',
    metadata: { 'example.owner': 'tests' },
    authoring: {
      composition: {
        mode: 'static',
        input: {
          kind: 'hybrid',
          prompt: 'A small garden table',
          references: [
            {
              id: 'reference',
              uri: './reference.png',
              roles: ['layout', 'palette'],
              width: 800,
              height: 600,
              sha256:
                'd05d6f4cbb7459ae63cefbb3929af25375392d940b63ff460be36a842db5b9c8',
            },
          ],
        },
        target: {
          surfaces: ['browser', 'vr'],
          style: 'stylized-pbr',
          assetPolicy: 'manifest-assets',
        },
        feasibility: { status: 'supported' },
        provenance: {
          adapter: { id: 'hybrid-intake', version: '1.0.0' },
          skill: { id: 'iwsdk-scene-composer', version: '1.0.0' },
          capabilityHash: HASH_C,
          inputHashes: [
            'sha256:03e49b58c84b95d6939257508689e845fd1366da227ccd33177eb2d345b3ec56',
            'sha256:d05d6f4cbb7459ae63cefbb3929af25375392d940b63ff460be36a842db5b9c8',
          ],
        },
        representationPolicy: {
          fidelityCeiling: 'stylized-blockout',
          allowed: ['asset', 'prefab', 'pattern'],
        },
        features: [
          {
            id: 'table-feature',
            priority: 'required',
            description: 'A table is visible',
            nodeRefs: ['table'],
            acceptance: [
              {
                id: 'table-presence',
                kind: 'presence',
                nodeRefs: ['table'],
                view: 'hero',
              },
              {
                id: 'table-region',
                kind: 'projected-region',
                measurement: {
                  method: 'capture-node-mask-bounds-v1',
                  applicability: 'visible-node-mask',
                },
                nodeRefs: ['table'],
                view: 'hero',
                reference: 'reference',
                region: [0.1, 0.2, 0.3, 0.4],
                centerTolerance: 0.3,
              },
            ],
            evidence: [
              { reference: 'reference', region: [0.1, 0.2, 0.3, 0.4] },
            ],
          },
          {
            id: 'flowers',
            priority: 'optional',
            description: 'Repeated flowers',
            nodeRefs: ['flower-pattern'],
            acceptance: [
              {
                id: 'flower-count',
                kind: 'count',
                pattern: 'flower-pattern',
                minimum: 3,
              },
            ],
          },
        ],
        assumptions: [
          {
            id: 'hidden-depth',
            statement: 'Depth is inferred',
            certainty: 'low',
          },
        ],
        review: {
          heroView: 'hero',
          requiredViews: ['hero', 'top'],
          lenses: ['layout', 'geometry', 'final'],
          maxCorrectionRounds: 2,
        },
      },
      nodeAnnotations: [
        {
          node: 'table',
          featureRefs: ['table-feature'],
          reviewLayer: 'layout',
        },
      ],
      views: [
        {
          id: 'hero',
          role: 'hero',
          projection: 'perspective',
          position: [0, 2, -4],
          target: [0, 0, 0],
          fov: 45,
        },
        {
          id: 'top',
          role: 'diagnostic',
          projection: 'orthographic',
          position: [0, 10, 0],
          target: [0, 0, 0],
          height: 10,
        },
      ],
    },
    resources: {
      prefabs: [
        {
          id: 'flower',
          root: {
            id: 'flower-root',
            content: {
              type: 'asset',
              asset: 'flower',
            },
          },
        },
      ],
    },
    environment: {
      fog: { type: 'linear', near: 10, far: 30 },
      toneMapping: 'aces',
      exposure: 1,
      shadows: true,
    },
    nodes: [
      {
        id: 'ground',
        content: {
          type: 'asset',
          asset: 'ground',
          receiveShadow: true,
        },
      },
      {
        id: 'table',
        content: {
          type: 'asset',
          asset: 'table',
          castShadow: true,
        },
        transform: { position: [0, 0.45, 0] },
        components: {
          'com.iwsdk.components.Marker': {
            enabled: true,
            weight: 0.5,
          },
        },
      },
      {
        id: 'chair',
        content: { type: 'asset', asset: 'chair', castShadow: true },
      },
      {
        id: 'flower-pattern',
        content: {
          type: 'pattern',
          prefab: 'flower',
          distribution: {
            type: 'scatter',
            count: 12,
            seed: 42,
            algorithm: 'pcg32-box-rejection-v1',
            collision: 'allow',
            region: { type: 'box', size: [3, 0.1, 1] },
            variation: { scale: [0.8, 1.2], yawDeg: [0, 360] },
          },
        },
      },
      {
        id: 'sun',
        transform: { rotationDeg: [55, -45, 0] },
        components: {
          'com.iwsdk.components.DirectionalLight': {
            castShadow: true,
            color: [1, 1, 1, 1],
            intensity: 2,
          },
        },
      },
    ],
  };
}

function makeReview(scene = makeScene()): SceneReview {
  return {
    version: CURRENT_SCENE_REVIEW_VERSION,
    documentHash: hashSceneDocument(scene),
    runtimeHash: hashRuntimeSceneDocument(scene),
    capabilityHash: HASH_C,
    sourceHashes: [
      'sha256:03e49b58c84b95d6939257508689e845fd1366da227ccd33177eb2d345b3ec56',
      'sha256:d05d6f4cbb7459ae63cefbb3929af25375392d940b63ff460be36a842db5b9c8',
    ],
    round: 1,
    result: 'pass',
    lenses: [
      {
        id: 'layout',
        status: 'pass',
        captures: [
          {
            id: 'layout-hero',
            view: 'hero',
            path: './layout.png',
            screenshotSha256: HASH_D,
            width: 1280,
            height: 720,
            camera: {
              projection: 'perspective',
              position: [0, 2, -4],
              target: [0, 0, 0],
              fov: 45,
            },
            rendererEnvironment: { browser: 'test', pixelRatio: 1 },
            visibleNodeIds: ['table'],
            nodeMaskRegions: { table: [0.1, 0.2, 0.3, 0.4] },
          },
          {
            id: 'layout-top',
            view: 'top',
            path: './layout-top.png',
            screenshotSha256: HASH_D,
            width: 1280,
            height: 720,
            camera: {
              projection: 'orthographic',
              position: [0, 10, 0],
              target: [0, 0, 0],
              height: 10,
            },
            rendererEnvironment: { browser: 'test', pixelRatio: 1 },
            visibleNodeIds: ['table', 'flower-pattern/0000/flower-root'],
          },
        ],
      },
    ],
    featureResults: [
      {
        feature: 'table-feature',
        criterion: 'table-presence',
        status: 'pass',
        evidenceRefs: ['layout-hero'],
      },
      {
        feature: 'table-feature',
        criterion: 'table-region',
        status: 'pass',
        evidenceRefs: ['layout-hero'],
      },
    ],
    waivers: [],
    stop: { reason: 'success', openDefectTags: [] },
  };
}

function makeReviewLens(
  review: SceneReview,
  id: SceneReview['lenses'][number]['id'],
): SceneReview['lenses'][number] {
  const lens = clone(review.lenses[0]);
  lens.id = id;
  if (id !== 'layout') {
    lens.captures.forEach((capture) => {
      capture.id = `${id}-${capture.id}`;
      capture.path = `./${id}-${capture.view}.png`;
    });
  }
  return lens;
}

describe('@iwsdk/scene-composition v1', () => {
  it('validates raw component properties against an external catalog', () => {
    const scene = makeScene();
    const marker = scene.nodes[1].components?.[
      'com.iwsdk.components.Marker'
    ] as Record<string, unknown>;
    marker.enabled = 'yes';

    expect(validateSceneDocument(scene)).toEqual({ valid: true, issues: [] });
    expect(
      validateSceneDocument(scene, {
        componentCatalog: TEST_COMPONENT_CATALOG,
      }).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: 'type',
        path: '$.nodes[1].components["com.iwsdk.components.Marker"].enabled',
      }),
    );
  });

  it('warns when required file and entity links are empty or unresolved', () => {
    const scene = makeScene();
    scene.nodes[1].components!.LinkedResource = {
      source: '',
      target: null,
    };

    const empty = validateSceneDocument(scene, {
      componentCatalog: LINK_COMPONENT_CATALOG,
    });
    expect(empty.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'required',
          path: '$.nodes[1].components.LinkedResource.source',
        }),
        expect.objectContaining({
          code: 'required',
          path: '$.nodes[1].components.LinkedResource.target',
        }),
      ]),
    );

    scene.nodes[1].components!.LinkedResource = {
      source: '/audio/chime.mp3',
      target: { id: 'missing', type: 'node' },
    };
    expect(
      validateSceneDocument(scene, {
        componentCatalog: LINK_COMPONENT_CATALOG,
      }).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: 'reference',
        path: '$.nodes[1].components.LinkedResource.target',
      }),
    );

    scene.nodes[1].components!.LinkedResource.target = {
      target: 'head',
      type: 'player-space',
    };
    expect(
      validateSceneDocument(scene, {
        componentCatalog: LINK_COMPONENT_CATALOG,
      }),
    ).toEqual({ issues: [], valid: true });
  });

  it('validates the complete closed authoring and runtime contract', () => {
    expect(validateSceneDocument(makeScene())).toEqual({
      valid: true,
      issues: [],
    });
    expect(SCENE_DOCUMENT_SCHEMA_ID).toBe(
      'https://iwsdk.dev/schemas/iwsdk.scene.v1.schema.json',
    );
    expect(SCENE_DOCUMENT_JSON_SCHEMA.title).toBe('IWSDK Scene Document v1');
    expect(SCENE_DOCUMENT_JSON_SCHEMA.required).toEqual([
      'version',
      'units',
      'resources',
      'nodes',
    ]);
    expect(SCENE_DOCUMENT_JSON_SCHEMA.additionalProperties).toBe(false);

    const unknownTop = { ...makeScene(), unexpected: true };
    expect(validateSceneDocument(unknownTop).issues).toContainEqual(
      expect.objectContaining({ path: '$.unexpected', code: 'schema' }),
    );
    const unknownNode = makeScene() as SceneDocument & {
      nodes: Array<SceneDocument['nodes'][number] & { asset?: string }>;
    };
    unknownNode.nodes[0].asset = 'chair-model';
    expect(validateSceneDocument(unknownNode).issues).toContainEqual(
      expect.objectContaining({ path: '$.nodes[0].asset', code: 'schema' }),
    );

    for (const [field, value] of [
      ['background', { color: '#112233', type: 'color' }],
      ['imageBasedLighting', { type: 'room' }],
      ['ar', { background: 'transparent' }],
    ] as const) {
      const invalidEnvironment = makeScene() as SceneDocument & {
        environment: Record<string, unknown>;
      };
      invalidEnvironment.environment = { [field]: value };
      expect(validateSceneDocument(invalidEnvironment).issues).toContainEqual(
        expect.objectContaining({
          code: 'schema',
          path: `$.environment.${field}`,
        }),
      );
    }
  });

  it('validates, serializes, and hashes optional node framing roles', () => {
    const contentScene = makeScene();
    const supportScene = makeScene();
    supportScene.nodes[0].framingRole = 'support';

    expect(validateSceneDocument(contentScene)).toEqual({
      valid: true,
      issues: [],
    });
    expect(validateSceneDocument(supportScene)).toEqual({
      valid: true,
      issues: [],
    });
    const serialized = serializeSceneDocument(supportScene);
    expect(parseSceneDocument(serialized).nodes[0].framingRole).toBe('support');
    expect(hashSceneDocument(supportScene)).not.toBe(
      hashSceneDocument(contentScene),
    );
    expect(hashRuntimeSceneDocument(supportScene)).not.toBe(
      hashRuntimeSceneDocument(contentScene),
    );

    const invalid = clone(supportScene) as SceneDocument & {
      nodes: Array<SceneDocument['nodes'][number] & { framingRole: string }>;
    };
    invalid.nodes[0].framingRole = 'background';
    expect(validateSceneDocument(invalid).issues).toContainEqual(
      expect.objectContaining({
        path: '$.nodes[0].framingRole',
        code: 'schema',
      }),
    );
  });

  it('requires layout annotations and features to resolve to renderable leaves', () => {
    const hiddenChair = makeScene();
    const hiddenChairRoot = hiddenChair.nodes.find(
      (node) => node.id === 'table',
    )!;
    hiddenChairRoot.content = { type: 'group' };
    hiddenChairRoot.children = [
      {
        id: 'chair-geometry',
        content: { type: 'asset', asset: 'chair' },
      },
    ];
    hiddenChair.authoring!.nodeAnnotations!.push({
      node: 'chair-geometry',
      reviewLayer: 'geometry',
    });

    expect(validateSceneDocument(hiddenChair).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'review-visibility',
          path: '$.authoring.nodeAnnotations[0]',
          message:
            'layout annotation for node "table" has no effectively layout-visible renderable',
        }),
        expect.objectContaining({
          code: 'review-visibility',
          path: '$.authoring.composition.features[0].nodeRefs',
          message:
            'layout feature "table-feature" has no effectively layout-visible renderable',
        }),
      ]),
    );

    const inheritedLayout = makeScene();
    const inheritedLayoutRoot = inheritedLayout.nodes.find(
      (node) => node.id === 'table',
    )!;
    inheritedLayoutRoot.content = { type: 'group' };
    inheritedLayoutRoot.children = [
      {
        id: 'chair-layout-inherited',
        content: { type: 'asset', asset: 'chair' },
      },
    ];
    expect(validateSceneDocument(inheritedLayout)).toEqual({
      valid: true,
      issues: [],
    });

    const explicitLayout = makeScene();
    const explicitLayoutRoot = explicitLayout.nodes.find(
      (node) => node.id === 'table',
    )!;
    explicitLayoutRoot.content = { type: 'group' };
    explicitLayoutRoot.children = [
      {
        id: 'chair-layout-explicit',
        content: { type: 'asset', asset: 'chair' },
      },
    ];
    explicitLayout.authoring!.nodeAnnotations = [
      { node: 'table', reviewLayer: 'geometry' },
      {
        featureRefs: ['table-feature'],
        node: 'chair-layout-explicit',
        reviewLayer: 'layout',
      },
    ];
    expect(validateSceneDocument(explicitLayout)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it.each(['instance', 'pattern'] as const)(
    'does not count renderables hidden by %s prefab overrides as layout-visible',
    (contentType) => {
      const scene = makeScene();
      scene.resources.prefabs!.push({
        id: 'hidden-assembly',
        root: {
          children: [
            {
              children: [
                {
                  content: { type: 'asset', asset: 'chair' },
                  id: 'visible-leaf',
                },
              ],
              content: { type: 'group' },
              id: 'hidden-ancestor',
            },
          ],
          content: { type: 'group' },
          id: 'assembly-root',
        },
      });
      const table = scene.nodes.find((node) => node.id === 'table')!;
      table.content =
        contentType === 'instance'
          ? {
              overrides: { 'assembly-root': { visible: false } },
              prefab: 'hidden-assembly',
              type: 'instance',
            }
          : {
              distribution: { count: 1, step: [1, 0, 0], type: 'linear' },
              overrides: { 'hidden-ancestor': { visible: false } },
              prefab: 'hidden-assembly',
              type: 'pattern',
            };

      expect(validateSceneDocument(scene).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'review-visibility',
            path: '$.authoring.nodeAnnotations[0]',
          }),
          expect.objectContaining({
            code: 'review-visibility',
            path: '$.authoring.composition.features[0].nodeRefs',
          }),
        ]),
      );
    },
  );

  it('rejects composition features without implementation bindings', () => {
    const scene = makeScene();
    scene.authoring!.composition!.features[0].nodeRefs = [];
    expect(validateSceneDocument(scene).issues).toContainEqual(
      expect.objectContaining({
        path: '$.authoring.composition.features[0].nodeRefs',
      }),
    );
  });

  it('binds acceptance subjects to the feature subtree and covers required bindings', () => {
    const unrelated = makeScene();
    unrelated.authoring!.composition!.features[0].acceptance[0] = {
      id: 'unrelated-presence',
      kind: 'presence',
      nodeRefs: ['chair'],
      view: 'hero',
    };
    expect(validateSceneDocument(unrelated).issues).toContainEqual(
      expect.objectContaining({
        path: '$.authoring.composition.features[0].acceptance[0].nodeRefs[0]',
        message: expect.stringContaining('outside feature'),
      }),
    );

    const descendant = makeScene();
    const table = descendant.nodes.find((node) => node.id === 'table')!;
    table.children = [
      {
        id: 'table-detail',
        content: { type: 'asset', asset: 'table-detail' },
      },
    ];
    descendant.authoring!.composition!.features[0].acceptance = [
      {
        id: 'detail-presence',
        kind: 'presence',
        nodeRefs: ['table-detail'],
        view: 'hero',
      },
    ];
    expect(validateSceneDocument(descendant)).toEqual({
      valid: true,
      issues: [],
    });

    const uncovered = makeScene();
    uncovered.authoring!.composition!.features[0].nodeRefs.push('chair');
    expect(validateSceneDocument(uncovered).issues).toContainEqual(
      expect.objectContaining({
        path: '$.authoring.composition.features[0].nodeRefs[1]',
        message: expect.stringContaining('not covered'),
      }),
    );
  });

  it('validates identity-critical object inspection specifications', () => {
    const scene = makeScene();
    const feature = scene.authoring!.composition!.features[0];
    feature.identityCritical = true;
    feature.objectInspection = {
      silhouette: ['The top remains wider than the pedestal from hero view'],
      proportions: ['The top-to-base height ratio remains recognizable'],
      parts: [
        {
          id: 'table-body',
          description: 'Primary top and pedestal assembly',
          nodeRefs: ['table'],
        },
      ],
      negativeSpace: ['Preserve open space below the tabletop'],
      contacts: [
        {
          id: 'table-ground-contact',
          description: 'The pedestal meets the ground',
          nodeRefs: ['table'],
          targetNodeRefs: ['ground'],
        },
      ],
      materialResponse: ['Wood reads as rough under authored lighting'],
      requiredViews: ['hero', 'top'],
      context: {
        background: 'neutral',
        lighting: 'authored',
        includeNodeRefs: ['ground'],
      },
    };
    expect(validateSceneDocument(scene)).toEqual({ valid: true, issues: [] });

    const missingSpec = makeScene();
    missingSpec.authoring!.composition!.features[0].identityCritical = true;
    expect(validateSceneDocument(missingSpec).issues).toContainEqual(
      expect.objectContaining({
        code: 'required',
        path: '$.authoring.composition.features[0].objectInspection',
      }),
    );

    const invalid = clone(scene);
    invalid.authoring!.composition!.features[0].objectInspection!.parts.push({
      id: 'table-body',
      description: 'Unbound chair detail',
      nodeRefs: ['chair'],
    });
    invalid.authoring!.composition!.features[0].objectInspection!.requiredViews =
      ['missing-view'];
    expect(validateSceneDocument(invalid).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-id' }),
        expect.objectContaining({
          path: '$.authoring.composition.features[0].objectInspection.parts[1].nodeRefs[0]',
          message: expect.stringContaining('outside feature'),
        }),
        expect.objectContaining({
          path: '$.authoring.composition.features[0].objectInspection.requiredViews[0]',
          code: 'reference',
        }),
      ]),
    );
  });

  it('accepts manifest assets, every pattern, and component-carried lights', () => {
    const distributions: ScenePatternDistribution[] = [
      { type: 'linear', count: 3, step: [1, 0, 0] },
      { type: 'grid', count: [2, 2, 1], spacing: [1, 1, 1] },
      { type: 'radial', count: 4, radius: 2, arcDeg: 180 },
      {
        type: 'along-path',
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
        count: 4,
      },
      {
        type: 'scatter',
        count: 4,
        seed: 1,
        algorithm: 'pcg32-box-rejection-v1',
        collision: 'skip',
        region: { type: 'sphere', radius: 2 },
      },
      { type: 'explicit', transforms: [{}, { position: [1, 0, 0] }] },
    ];
    expect(validateSceneDocument(makeScene())).toEqual({
      valid: true,
      issues: [],
    });
    distributions.forEach((distribution) => {
      const scene = makeScene();
      scene.nodes[3].content = {
        type: 'pattern',
        prefab: 'flower',
        distribution,
      };
      expect(validateSceneDocument(scene), distribution.type).toEqual({
        valid: true,
        issues: [],
      });
    });
    const scene = makeScene();
    expect(scene.nodes[4].content).toBeUndefined();
    expect(scene.nodes[4].components).toHaveProperty(
      'com.iwsdk.components.DirectionalLight',
    );
  });

  it('rejects unresolved references and excessive pattern expansion', () => {
    const scene = makeScene();
    scene.nodes[3].content = { type: 'instance', prefab: 'missing' };
    const result = validateSceneDocument(scene);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'reference' }),
    );

    const excessive = makeScene();
    excessive.nodes[3].content = {
      type: 'pattern',
      prefab: 'flower',
      distribution: { type: 'grid', count: [101, 100, 1], spacing: [1, 1, 1] },
    };
    expect(validateSceneDocument(excessive).issues).toContainEqual(
      expect.objectContaining({ code: 'limit' }),
    );
  });

  it('rejects prefab recursion before materialization', () => {
    const recursive = makeScene();
    recursive.resources.prefabs![0].root.content = {
      type: 'instance',
      prefab: 'flower',
    };
    expect(validateSceneDocument(recursive).issues).toContainEqual(
      expect.objectContaining({ code: 'cycle' }),
    );
  });

  it('validates authoring bindings and input-specific requirements', () => {
    const scene = makeScene();
    scene.authoring!.composition!.features[0].nodeRefs = ['missing'];
    scene.authoring!.composition!.review.heroView = 'missing-view';
    scene.authoring!.composition!.input = { kind: 'hybrid' };
    const result = validateSceneDocument(scene);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['reference', 'required']),
    );
  });

  it('can validate document integrity without enforcing composition workflow policy', () => {
    const scene = makeScene();
    scene.authoring!.composition!.feasibility = {
      status: 'blocked',
      reasons: ['Needs an authoring decision'],
    };

    expect(validateSceneDocument(scene).valid).toBe(false);
    expect(
      validateSceneDocument(scene, { validateAuthoringWorkflow: false }),
    ).toEqual({ issues: [], valid: true });
  });

  it('enforces asset sourcing and representation policies across nodes and prefabs', () => {
    const obsoletePolicy = makeScene();
    (obsoletePolicy.authoring!.composition!.target as any).assetPolicy =
      'declared-assets';
    expect(validateSceneDocument(obsoletePolicy).issues).toContainEqual(
      expect.objectContaining({
        path: '$.authoring.composition.target.assetPolicy',
        code: 'schema',
      }),
    );

    const restricted = makeScene();
    restricted.authoring!.composition!.representationPolicy.allowed = ['asset'];
    expect(validateSceneDocument(restricted).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.resources.prefabs',
          code: 'policy',
        }),
        expect.objectContaining({
          path: '$.nodes[3].content.type',
          code: 'policy',
        }),
      ]),
    );

    const nestedPrefabAsset = makeScene();
    nestedPrefabAsset.authoring!.composition!.representationPolicy.allowed = [
      'prefab',
      'pattern',
    ];
    nestedPrefabAsset.resources.prefabs![0].root.children = [
      {
        id: 'nested-asset',
        content: { type: 'asset', asset: 'chair' },
      },
    ];
    expect(validateSceneDocument(nestedPrefabAsset).issues).toContainEqual(
      expect.objectContaining({
        path: '$.resources.prefabs[0].root.children[0].content.type',
        code: 'policy',
      }),
    );
  });

  it('binds provenance and review identity to every prompt and image source', () => {
    const scene = makeScene();
    expect(validateSceneDocument(scene)).toEqual({ valid: true, issues: [] });

    scene.authoring!.composition!.provenance.inputHashes = [
      scene.authoring!.composition!.provenance.inputHashes[1],
      HASH_A,
    ];
    expect(validateSceneDocument(scene).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'declared input hash "sha256:03e49b58',
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'does not identify a declared prompt or reference',
          ),
        }),
      ]),
    );

    const reviewScene = makeScene();
    reviewScene.authoring!.composition!.review.lenses = ['layout'];
    const review = makeReview(reviewScene);
    review.sourceHashes.shift();
    expect(
      validateSceneReviewAgainstDocument(review, reviewScene).issues,
    ).toContainEqual(
      expect.objectContaining({
        path: '$.sourceHashes',
        message: expect.stringContaining('source hash'),
      }),
    );
  });

  it('places a hard schema ceiling on correction rounds', () => {
    const scene = makeScene();
    scene.authoring!.composition!.review.maxCorrectionRounds = 11;
    expect(validateSceneDocument(scene).issues).toContainEqual(
      expect.objectContaining({
        path: '$.authoring.composition.review.maxCorrectionRounds',
        code: 'schema',
      }),
    );

    const review = makeReview();
    review.round = 11;
    expect(validateSceneReview(review).issues).toContainEqual(
      expect.objectContaining({ path: '$.round', code: 'schema' }),
    );

    const initial = makeReview();
    initial.round = 0;
    initial.previousReview = {
      path: 'records/previous.iwsdk.scene-review.json',
      reviewSha256: HASH_A,
    };
    expect(validateSceneReview(initial).issues).toContainEqual(
      expect.objectContaining({ path: '$.previousReview', code: 'state' }),
    );
  });

  it('resolves every local reference in exported document and review schemas', () => {
    expect(unresolvedLocalSchemaRefs(SCENE_DOCUMENT_JSON_SCHEMA)).toEqual([]);
    expect(unresolvedLocalSchemaRefs(SCENE_REVIEW_JSON_SCHEMA)).toEqual([]);
  });

  it('rejects blocked or undocumented conditional compilation contracts', () => {
    const blocked = makeScene();
    blocked.authoring!.composition!.feasibility = {
      status: 'blocked',
      reasons: ['Required representation is unavailable'],
    };
    expect(validateSceneDocument(blocked).issues).toContainEqual(
      expect.objectContaining({
        path: '$.authoring.composition.feasibility.status',
        code: 'state',
      }),
    );

    const conditional = makeScene();
    conditional.authoring!.composition!.feasibility = {
      status: 'conditional',
      reasons: ['Approximation requires acceptance'],
    };
    conditional.authoring!.composition!.provenance.inputHashes = [HASH_A];
    const issues = validateSceneDocument(conditional).issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('acceptedApproximations'),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'missing from compilation provenance',
          ),
        }),
      ]),
    );
  });

  it('requires namespaced keys at the opaque metadata extension points', () => {
    const scene = makeScene();
    scene.metadata = { owner: 'invalid', 'example.valid': true };
    scene.nodes[0].metadata = { debug: true };
    const result = validateSceneDocument(scene);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.metadata.owner',
          code: 'namespace',
        }),
        expect.objectContaining({
          path: '$.nodes[0].metadata.debug',
          code: 'namespace',
        }),
      ]),
    );
  });

  it('canonicalizes, hashes, and projects authoring data deterministically', () => {
    expect(canonicalizeJson({ z: 1, a: [3, { y: true, x: null }] })).toBe(
      '{"a":[3,{"x":null,"y":true}],"z":1}',
    );
    expect(sha256('')).toBe(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    const scene = makeScene();
    const reordered = JSON.parse(
      `{"units":"meters","version":"iwsdk.scene.v1","nodes":${JSON.stringify(scene.nodes)},"resources":${JSON.stringify(scene.resources)},"environment":${JSON.stringify(scene.environment)},"metadata":${JSON.stringify(scene.metadata)},"authoring":${JSON.stringify(scene.authoring)}}`,
    ) as SceneDocument;
    expect(hashSceneDocument(reordered)).toBe(hashSceneDocument(scene));
    expect(hashRuntimeSceneDocument(reordered)).toBe(
      hashRuntimeSceneDocument(scene),
    );

    const changedAuthoring = clone(scene);
    changedAuthoring.authoring!.composition!.input.prompt = 'Changed prompt';
    changedAuthoring.authoring!.composition!.provenance.inputHashes[0] =
      sha256('Changed prompt');
    expect(hashSceneDocument(changedAuthoring)).not.toBe(
      hashSceneDocument(scene),
    );
    expect(hashRuntimeSceneDocument(changedAuthoring)).toBe(
      hashRuntimeSceneDocument(scene),
    );
    expect(hashSceneReviewContract(changedAuthoring)).not.toBe(
      hashSceneReviewContract(scene),
    );
    const changedRuntimeOnly = clone(scene);
    changedRuntimeOnly.nodes[0].transform = { position: [2, 0, 0] };
    expect(hashSceneReviewContract(changedRuntimeOnly)).toBe(
      hashSceneReviewContract(scene),
    );
    expect(projectRuntimeSceneDocument(scene)).not.toHaveProperty('authoring');
  });

  it('parses and serializes v1 scenes with stable formatting', () => {
    const serialized = serializeSceneDocument(makeScene());
    expect(serialized.endsWith('\n')).toBe(true);
    expect(serializeSceneDocument(parseSceneDocument(serialized))).toBe(
      serialized,
    );
    expect(() =>
      parseSceneDocument(
        JSON.stringify({
          ...makeScene(),
          version: 'unsupported.scene.version',
        }),
      ),
    ).toThrow('Invalid IWSDK scene document');
  });

  it('validates the closed scene-review v1 evidence contract', () => {
    const review = makeReview();
    expect(validateSceneReview(review)).toEqual({ valid: true, issues: [] });
    expect(SCENE_REVIEW_SCHEMA_ID).toContain('scene-review.v1');
    expect(SCENE_REVIEW_JSON_SCHEMA.additionalProperties).toBe(false);
    const serialized = serializeSceneReview(review);
    expect(parseSceneReview(serialized)).toEqual(review);

    const missingEvidence = clone(review);
    missingEvidence.featureResults[0].evidenceRefs = ['missing'];
    expect(validateSceneReview(missingEvidence).issues).toContainEqual(
      expect.objectContaining({ code: 'reference' }),
    );

    const falsePass = clone(review);
    falsePass.featureResults[0].status = 'partial';
    expect(validateSceneReview(falsePass).issues).toContainEqual(
      expect.objectContaining({ path: '$.result', code: 'state' }),
    );

    const accepted = clone(falsePass);
    accepted.result = 'accepted-with-gaps';
    accepted.waivers = [
      {
        feature: 'table-feature',
        criterion: 'table-presence',
        reason: 'User accepted the gap',
        authorizedBy: 'user',
      },
    ];
    expect(validateSceneReview(accepted)).toEqual({ valid: true, issues: [] });
  });

  it('binds review evidence to an exact scene revision and authoring contract', () => {
    const scene = makeScene();
    scene.authoring!.composition!.review.lenses = ['layout'];
    const review = makeReview(scene);
    expect(validateSceneReviewAgainstDocument(review, scene, HASH_C)).toEqual({
      valid: true,
      issues: [],
    });
    review.documentHash = HASH_A;
    review.featureResults.pop();
    const invalid = validateSceneReviewAgainstDocument(review, scene);
    expect(invalid.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['hash-mismatch', 'reference']),
    );
  });

  it('rejects deterministic pass claims that contradict measured scene facts', () => {
    const scene = makeScene();
    scene.authoring!.composition!.review.lenses = ['layout'];
    scene.authoring!.composition!.features[0].acceptance.push({
      id: 'impossible-table-count',
      kind: 'count',
      nodeRefs: ['table'],
      equals: 999999,
    });
    const review = makeReview(scene);
    review.featureResults.push({
      feature: 'table-feature',
      criterion: 'impossible-table-count',
      status: 'pass',
      evidenceRefs: ['layout-hero'],
    });

    expect(
      validateSceneReviewAgainstDocument(review, scene).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: 'criterion-mismatch',
        path: '$.featureResults[2].status',
        message: expect.stringContaining('"actual":1'),
      }),
    );

    review.featureResults[2].status = 'fail';
    review.result = 'fail';
    review.stop.reason = 'plateau';
    expect(validateSceneReviewAgainstDocument(review, scene)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('finalizes deterministic review results and routes failures to refinement', () => {
    const scene = makeScene();
    scene.authoring!.composition!.review.lenses = ['layout'];
    scene.authoring!.composition!.features[0].acceptance.push({
      id: 'impossible-table-count',
      kind: 'count',
      nodeRefs: ['table'],
      equals: 999999,
    });
    const captures = makeReview(scene).lenses[0].captures;
    const finalized = finalizeSceneReviewDraft(scene, HASH_C, {
      lenses: [{ captures, id: 'layout', status: 'pass' }],
      round: 0,
    });

    expect(finalized.review).toMatchObject({
      capabilityHash: HASH_C,
      documentHash: hashSceneDocument(scene),
      result: 'fail',
      runtimeHash: hashRuntimeSceneDocument(scene),
      stop: {
        reason: 'continue-refining',
        openDefectTags: ['criterion:table-feature/impossible-table-count'],
      },
    });
    expect(finalized.review.featureResults).toContainEqual(
      expect.objectContaining({
        criterion: 'impossible-table-count',
        evidenceRefs: ['layout-hero'],
        feature: 'table-feature',
        status: 'fail',
      }),
    );
    expect(finalized.deterministicEvaluations).toContainEqual(
      expect.objectContaining({
        criterion: 'impossible-table-count',
        reason: 'criterion-not-satisfied',
        status: 'fail',
      }),
    );
    expect(validateSceneReviewAgainstDocument(finalized.review, scene)).toEqual(
      { valid: true, issues: [] },
    );

    const invalidRouting = clone(finalized.review);
    invalidRouting.result = 'pass';
    invalidRouting.featureResults.forEach((result) => {
      result.status = 'pass';
    });
    expect(validateSceneReview(invalidRouting).issues).toContainEqual(
      expect.objectContaining({
        code: 'state',
        path: '$.stop.reason',
      }),
    );
  });

  it('requires the exact configured view for deterministic and visual evidence', () => {
    const scene = makeScene();
    scene.authoring!.composition!.review.lenses = ['layout'];
    const review = makeReview(scene);
    review.featureResults[0].evidenceRefs = ['layout-top'];
    expect(
      validateSceneReviewAgainstDocument(review, scene).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: 'criterion-mismatch',
        path: '$.featureResults[0].status',
        message: expect.stringContaining('capture-required'),
      }),
    );

    scene.authoring!.composition!.features[0].acceptance.push({
      id: 'table-reads-visually',
      kind: 'visual-judgment',
      view: 'hero',
      criterion: 'The table reads clearly as the focal object.',
    });
    const visualReview = makeReview(scene);
    visualReview.featureResults.push({
      feature: 'table-feature',
      criterion: 'table-reads-visually',
      status: 'pass',
      evidenceRefs: ['layout-hero'],
    });
    expect(
      validateSceneReviewAgainstDocument(visualReview, scene).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: 'required',
        path: '$.featureResults[2].observation',
      }),
    );
    visualReview.featureResults[2].observation =
      'The cylindrical top and centered support read clearly as a table.';
    expect(validateSceneReviewAgainstDocument(visualReview, scene)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('requires complete review evidence, required views, and the active capability hash', () => {
    const scene = makeScene();
    scene.authoring!.composition!.review.lenses = ['layout'];
    const review = makeReview(scene);
    review.capabilityHash = HASH_A;
    review.lenses[0].captures = [];
    review.featureResults.forEach((result) => {
      result.evidenceRefs = [];
    });

    const result = validateSceneReviewAgainstDocument(review, scene, HASH_C);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.capabilityHash' }),
        expect.objectContaining({
          message: 'required lens "layout" has no captures',
        }),
        expect.objectContaining({
          message: 'required view "hero" has no capture',
        }),
        expect.objectContaining({
          message: 'required view "top" has no capture',
        }),
        expect.objectContaining({
          message:
            'required criterion "table-feature/table-presence" has no evidence',
        }),
      ]),
    );
  });

  it('enforces the zero-based correction ceiling and round-limit stop reason', () => {
    const scene = makeScene();
    scene.authoring!.composition!.review.lenses = ['layout'];
    const review = makeReview(scene);

    review.round = 0;
    expect(validateSceneReviewAgainstDocument(review, scene)).toEqual({
      valid: true,
      issues: [],
    });

    review.round = 1;
    review.stop.reason = 'round-limit';
    expect(
      validateSceneReviewAgainstDocument(review, scene).issues,
    ).toContainEqual(
      expect.objectContaining({ path: '$.stop.reason', code: 'state' }),
    );

    review.round = 2;
    expect(validateSceneReviewAgainstDocument(review, scene)).toEqual({
      valid: true,
      issues: [],
    });

    review.round = 3;
    expect(
      validateSceneReviewAgainstDocument(review, scene).issues,
    ).toContainEqual(
      expect.objectContaining({ path: '$.round', code: 'limit' }),
    );
  });

  it('requires configured and recorded lenses to use canonical workflow order', () => {
    const scene = makeScene();
    scene.authoring!.composition!.review.lenses = ['geometry', 'layout'];
    const review = makeReview(scene);
    review.lenses = [
      makeReviewLens(review, 'geometry'),
      makeReviewLens(review, 'layout'),
    ];

    expect(
      validateSceneReviewAgainstDocument(review, scene).issues,
    ).toContainEqual(
      expect.objectContaining({
        path: '$.lenses',
        code: 'state',
        message:
          'scene review configuration lenses must be a canonical subset ordered layout, geometry, final',
      }),
    );

    scene.authoring!.composition!.review.lenses = [
      'layout',
      'geometry',
      'final',
    ];
    const orderedReview = makeReview(scene);
    orderedReview.lenses = [
      makeReviewLens(orderedReview, 'layout'),
      makeReviewLens(orderedReview, 'final'),
      makeReviewLens(orderedReview, 'geometry'),
    ];
    expect(
      validateSceneReviewAgainstDocument(orderedReview, scene).issues,
    ).toContainEqual(
      expect.objectContaining({ path: '$.lenses', code: 'state' }),
    );
  });

  it('prevents a later configured lens from passing an earlier failed gate', () => {
    const scene = makeScene();
    const review = makeReview(scene);
    review.result = 'fail';
    review.stop.reason = 'plateau';
    review.lenses = [
      { ...makeReviewLens(review, 'layout'), status: 'fail' },
      makeReviewLens(review, 'geometry'),
      makeReviewLens(review, 'final'),
    ];

    const result = validateSceneReviewAgainstDocument(review, scene);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.lenses[1].status',
          code: 'state',
        }),
        expect.objectContaining({
          path: '$.lenses[2].status',
          code: 'state',
        }),
      ]),
    );
  });

  it('requires explicit user authorization for accepted review gaps', () => {
    const review = makeReview();
    review.result = 'accepted-with-gaps';
    review.featureResults[0].status = 'partial';
    review.waivers = [
      {
        feature: 'table-feature',
        criterion: 'table-presence',
        reason: 'Agent claimed acceptance without user authorization',
        authorizedBy: 'agent',
      } as any,
    ];
    expect(validateSceneReview(review).issues).toContainEqual(
      expect.objectContaining({ path: '$.waivers[0].authorizedBy' }),
    );
  });

  it('computes bounds for the complete primitive family', () => {
    expect(
      getScenePrimitiveBounds({ type: 'capsule', radius: 0.5, length: 2 }),
    ).toEqual({
      min: [-0.5, -1.5, -0.5],
      max: [0.5, 1.5, 0.5],
    });
    expect(
      getScenePrimitiveBounds({
        type: 'extrude',
        points: [
          [-2, -1],
          [3, -1],
          [0, 4],
        ],
        depth: 2,
      }),
    ).toEqual({ min: [-2, -1, -1], max: [3, 4, 1] });
    expect(
      getScenePrimitiveBounds({
        type: 'tube',
        points: [
          [0, 1, 2],
          [3, -1, 4],
        ],
        radius: 0.5,
      }),
    ).toEqual({ min: [-0.5, -1.5, 1.5], max: [3.5, 1.5, 4.5] });
  });

  it('applies reversible node patches with isolated command history', () => {
    const scene = makeScene();
    const history = new SceneCommandHistory(scene);
    const content = {
      type: 'asset' as const,
      asset: 'replacement-table',
      castShadow: true,
    };
    history.apply({ op: 'updateContent', nodeId: 'table', content });
    content.asset = 'mutated-after-apply';
    expect(history.document.nodes[1].content).toEqual({
      type: 'asset',
      asset: 'replacement-table',
      castShadow: true,
    });
    history.undo();
    expect(history.document).toEqual(scene);
    history.redo();
    expect(history.document.nodes[1].content?.type).toBe('asset');

    const result = applyScenePatch(scene, {
      op: 'updateConstraints',
      nodeId: 'chair',
      constraints: { lookAt: { mode: 'yaw-v1', target: [0, 0, 0] } },
    });
    expect(applyScenePatch(result.document, result.inverse).document).toEqual(
      scene,
    );
  });

  it('authors level-root components with reversible patches', () => {
    const scene = makeScene();
    const history = new SceneCommandHistory(scene);

    history.apply({
      component: 'com.iwsdk.components.DomeGradient',
      op: 'updateRootComponent',
      value: {
        equator: [0.5, 0.6, 0.7, 1],
        ground: [0.2, 0.25, 0.3, 1],
        intensity: 0.8,
        sky: [0.1, 0.3, 0.6, 1],
      },
    });
    expect(history.document.components).toMatchObject({
      'com.iwsdk.components.DomeGradient': { intensity: 0.8 },
    });

    history.apply({
      component: 'com.iwsdk.components.DomeGradient',
      op: 'updateRootComponent',
    });
    expect(history.document.components).toEqual({});
    history.undo();
    expect(history.document.components).toHaveProperty(
      'com.iwsdk.components.DomeGradient',
    );
    history.undo();
    expect(history.document).toEqual(scene);
  });

  it('authors persistent player-space components with reversible patches', () => {
    const scene = makeScene();
    const history = new SceneCommandHistory(scene);

    history.apply({
      component: 'PlayerMarker',
      op: 'updatePlayerComponent',
      target: 'left-target-ray',
      value: { enabled: true },
    });
    expect(history.document.player?.leftTargetRay?.components).toEqual({
      PlayerMarker: { enabled: true },
    });
    history.undo();
    expect(history.document).toEqual(scene);
    history.redo();
    history.apply({
      component: 'PlayerMarker',
      op: 'updatePlayerComponent',
      target: 'left-target-ray',
    });
    expect(history.document.player).toBeUndefined();
  });

  it('parents authored nodes to fixed player spaces and authors player placement', () => {
    const scene = makeScene();
    const history = new SceneCommandHistory(scene);

    history.apply({
      nodeId: 'table',
      op: 'moveNode',
      parent: { target: 'left-grip', type: 'player-space' },
      preserveWorldTransform: true,
    });
    expect(
      history.document.nodes.find((node) => node.id === 'table'),
    ).toMatchObject({
      parent: { target: 'left-grip', type: 'player-space' },
    });
    history.apply({
      op: 'updatePlayerTransform',
      target: 'player',
      transform: { position: [2, 0, -3] },
    });
    expect(history.document.player?.transform).toEqual({
      position: [2, 0, -3],
    });
    history.undo();
    history.undo();
    expect(history.document).toEqual(scene);

    const invalid = clone(scene);
    invalid.nodes[0].children = [
      {
        id: 'nested-player-child',
        parent: { target: 'head', type: 'player-space' },
      },
    ];
    expect(validateSceneDocument(invalid).issues).toContainEqual(
      expect.objectContaining({
        code: 'conflict',
        path: '$.nodes[0].children[0].parent',
      }),
    );

    expect(() =>
      history.apply({
        op: 'updatePlayerTransform',
        target: 'left-grip',
        transform: { position: [0, 0, 0] },
      } as never),
    ).toThrow('only supports Player Space');
  });

  it('updates framing roles atomically and restores omission through undo', () => {
    const scene = makeScene();
    const originalHash = hashSceneDocument(scene);
    const history = new SceneCommandHistory(scene);

    history.apply({
      framingRole: 'support',
      nodeId: 'table',
      op: 'updateFramingRole',
    });
    expect(history.document.nodes[1]).toMatchObject({
      framingRole: 'support',
      id: 'table',
    });
    expect(hashSceneDocument(history.document)).not.toBe(originalHash);

    history.undo();
    expect(history.document).toEqual(scene);
    expect(history.document.nodes[1]).not.toHaveProperty('framingRole');

    history.redo();
    expect(history.document.nodes[1].framingRole).toBe('support');

    const contentResult = applyScenePatch(history.document, {
      framingRole: 'content',
      nodeId: 'table',
      op: 'updateFramingRole',
    });
    expect(contentResult.document.nodes[1].framingRole).toBe('content');
    expect(
      applyScenePatch(contentResult.document, contentResult.inverse).document,
    ).toEqual(history.document);

    expect(() =>
      applyScenePatch(scene, {
        framingRole: 'background' as 'content',
        nodeId: 'table',
        op: 'updateFramingRole',
      }),
    ).toThrow('framingRole must be "content" or "support"');
    expect(() =>
      applyScenePatch(scene, {
        framingRole: 'support',
        nodeId: 'missing',
        op: 'updateFramingRole',
      }),
    ).toThrow('Unknown node "missing"');
    expect(scene).toEqual(makeScene());
  });

  it('applies node, environment, view, and whole-document transactions atomically', () => {
    const scene = makeScene();
    const history = new SceneCommandHistory(scene);
    history.applyTransaction([
      {
        op: 'addNode',
        node: {
          id: 'accent-ball',
          content: { type: 'asset', asset: 'accent-ball' },
        },
      },
      {
        op: 'setEnvironment',
        environment: { exposure: 1.25, shadows: false },
      },
      {
        op: 'addAuthoringView',
        view: {
          id: 'side',
          role: 'diagnostic',
          projection: 'orthographic',
          position: [10, 1, 0],
          target: [0, 1, 0],
          height: 8,
        },
      },
    ]);
    expect(history.document.nodes.at(-1)?.id).toBe('accent-ball');
    expect(history.document.authoring?.views?.at(-1)?.id).toBe('side');
    history.undo();
    expect(history.document).toEqual(scene);
    history.redo();
    expect(history.document.nodes.at(-1)?.id).toBe('accent-ball');

    const replacement = makeScene();
    replacement.nodes = [{ id: 'replacement' }];
    replacement.authoring = undefined;
    replacement.resources = {};
    history.replace(replacement);
    expect(history.document).toEqual(replacement);
    replacement.nodes[0].id = 'mutated-after-apply';
    expect(history.document.nodes[0].id).toBe('replacement');
  });

  it('rewrites every authoring node reference during an atomic rename', () => {
    const scene = makeScene();
    scene.nodes[2].components = {
      LinkedResource: {
        source: '/audio/chime.mp3',
        target: { id: 'table', type: 'node' },
      },
    };
    const feature = scene.authoring!.composition!.features[0];
    feature.identityCritical = true;
    feature.objectInspection = {
      silhouette: ['Keep the authored outline'],
      proportions: ['Keep the authored proportions'],
      parts: [{ id: 'body', description: 'Table body', nodeRefs: ['table'] }],
      negativeSpace: ['Keep the authored openings'],
      contacts: [
        {
          id: 'ground-contact',
          description: 'Table meets ground',
          nodeRefs: ['table'],
          targetNodeRefs: ['ground'],
        },
      ],
      materialResponse: ['Keep the authored response'],
      requiredViews: ['hero'],
      context: {
        background: 'authored',
        lighting: 'authored',
        includeNodeRefs: ['table'],
      },
    };
    const renamed = applyScenePatch(scene, {
      op: 'renameNode',
      nodeId: 'table',
      newNodeId: 'table-renamed',
    }).document;
    expect(renamed.nodes[1].id).toBe('table-renamed');
    expect(renamed.authoring?.composition?.features[0].nodeRefs).toEqual([
      'table-renamed',
    ]);
    expect(
      renamed.authoring?.composition?.features[0].acceptance[0],
    ).toMatchObject({ nodeRefs: ['table-renamed'] });
    expect(
      renamed.authoring?.composition?.features[0].objectInspection,
    ).toMatchObject({
      parts: [{ nodeRefs: ['table-renamed'] }],
      context: { includeNodeRefs: ['table-renamed'] },
    });
    expect(renamed.authoring?.nodeAnnotations?.[0].node).toBe('table-renamed');
    expect(renamed.nodes[2].components?.LinkedResource).toMatchObject({
      target: { id: 'table-renamed', type: 'node' },
    });
    expect(validateSceneDocument(renamed)).toEqual({ valid: true, issues: [] });
  });

  it('retains deterministic transform helpers on scene nodes', () => {
    expect(resolveLookAtYawDeg([0, 0, 0], [1, 0, 0])).toBe(90);
  });

  it('accepts zero and mirrored scene scales', () => {
    for (const scale of [0, -1, [1, 0, -2]] as const) {
      const scene: SceneDocument = {
        version: CURRENT_SCENE_VERSION,
        units: 'meters',
        resources: {},
        nodes: [
          {
            id: 'scaled-node',
            content: { type: 'group' },
            transform: { scale },
          },
        ],
      };

      expect(validateSceneDocument(scene)).toEqual({ issues: [], valid: true });
    }
  });

  it('preserves mirrored scale when resolving a world-preserving reparent', () => {
    const scene: SceneDocument = {
      version: CURRENT_SCENE_VERSION,
      units: 'meters',
      resources: {},
      nodes: [
        {
          id: 'parent',
          content: { type: 'group' },
          transform: { position: [2, 0, 0] },
          children: [
            {
              id: 'mirrored-child',
              content: { type: 'group' },
              transform: { scale: [-1, 1, 1] },
            },
          ],
        },
      ],
    };

    expect(resolveReparentTransform(scene, 'mirrored-child', null)).toEqual({
      position: [2, 0, 0],
      scale: [-1, 1, 1],
    });
  });

  it('rejects only world-preserving reparent operations that must decompose a zero-scale node', () => {
    const scene: SceneDocument = {
      version: CURRENT_SCENE_VERSION,
      units: 'meters',
      resources: {},
      nodes: [
        {
          id: 'parent',
          children: [
            {
              id: 'zero-scale-child',
              transform: { scale: [0, 1, 1] },
            },
          ],
        },
      ],
    };

    expect(() =>
      resolveReparentTransform(scene, 'zero-scale-child', null),
    ).toThrow('Cannot preserve the world transform of a zero-scale node');
  });

  it('aggregates transformed group children for bounds without mutation', () => {
    const scene: SceneDocument = {
      version: CURRENT_SCENE_VERSION,
      units: 'meters',
      resources: {},
      nodes: [
        {
          id: 'assembly',
          content: { type: 'group' },
          transform: { position: [10, 0, 0], rotationDeg: [0, 90, 0] },
          children: [
            {
              id: 'offset',
              content: { type: 'group' },
              transform: { position: [2, 0, 0] },
              children: [
                {
                  id: 'part',
                  content: { type: 'asset', asset: 'part-box' },
                  transform: { position: [0, 1, 1] },
                },
              ],
            },
          ],
        },
      ],
    };
    const before = clone(scene);

    expect(
      getNodeWorldBounds(scene, 'assembly', {
        resolveAssetBounds: resolveTestAssetBounds,
      }),
    ).toEqual({
      min: [9, 0, -3],
      max: [13, 2, -1],
    });
    expect(scene).toEqual(before);
  });

  it('resolves lookAt constraints without mutating authored transforms', () => {
    const scene: SceneDocument = {
      version: CURRENT_SCENE_VERSION,
      units: 'meters',
      resources: {},
      nodes: [
        {
          id: 'table',
          content: { type: 'asset', asset: 'table-model' },
          transform: { scale: 2 },
          children: [
            {
              id: 'lamp',
              content: { type: 'asset', asset: 'lamp-model' },
              constraints: {
                lookAt: { mode: 'yaw-v1', target: [2, 2, 0] },
              },
              transform: { position: [0, 1, 0] },
            },
          ],
        },
      ],
    };
    const before = clone(scene);

    const resolved = resolveSceneAuthoringTransforms(scene);
    expect(resolved.nodes[0].children?.[0].transform).toEqual({
      position: [0, 1, 0],
      rotationDeg: [0, 90, 0],
    });
    expect(scene).toEqual(before);
  });

  it('aggregates prefab geometry for every deterministic pattern distribution', () => {
    const distributions: ScenePatternDistribution[] = [
      { type: 'linear', count: 2, step: [3, 0, 0] },
      { type: 'grid', count: [2, 1, 2], spacing: [3, 1, 3] },
      { type: 'radial', count: 3, radius: 3, faceCenter: true },
      {
        type: 'along-path',
        points: [
          [0, 0, 0],
          [4, 0, 2],
        ],
        count: 3,
        orientToPath: true,
      },
      {
        type: 'scatter',
        count: 3,
        seed: 7,
        algorithm: 'pcg32-box-rejection-v1',
        collision: 'allow',
        region: { type: 'box', size: [4, 1, 4] },
      },
      {
        type: 'explicit',
        transforms: [
          { position: [-2, 0, 0] },
          { position: [2, 0, 0], scale: 2 },
        ],
      },
    ];
    const scene: SceneDocument = {
      version: CURRENT_SCENE_VERSION,
      units: 'meters',
      resources: {
        prefabs: [
          {
            id: 'marker',
            root: {
              id: 'root',
              content: { type: 'group' },
              transform: { rotationDeg: [0, 30, 0], scale: [1, 2, 1] },
              children: [
                {
                  id: 'body',
                  content: { type: 'asset', asset: 'marker-body' },
                  transform: { position: [1, 0.5, 0] },
                },
              ],
            },
          },
        ],
      },
      nodes: distributions.map((distribution, index) => ({
        id: `pattern-${index}`,
        content: {
          type: 'pattern',
          prefab: 'marker',
          distribution,
        },
      })),
    };
    const before = clone(scene);

    expect(getScenePatternInstanceCount(distributions[0])).toBe(2);
    expect(getScenePatternRequestedCount(distributions[1])).toBe(4);

    for (const node of scene.nodes) {
      const bounds = getNodeWorldBounds(scene, node.id, {
        resolveAssetBounds: resolveTestAssetBounds,
      });
      expect(bounds.max[0]).toBeGreaterThan(bounds.min[0]);
      expect(bounds.max[1]).toBeGreaterThan(bounds.min[1]);
      expect(bounds.max[2]).toBeGreaterThan(bounds.min[2]);
    }
    expect(scene).toEqual(before);
  });

  it('rejects authored and nested aliases of derived runtime node ids', () => {
    const scene: SceneDocument = {
      version: CURRENT_SCENE_VERSION,
      units: 'meters',
      resources: {
        prefabs: [
          {
            id: 'chair-parts',
            root: { id: 'root', content: { type: 'group' } },
          },
        ],
      },
      nodes: [
        {
          id: 'chair',
          content: { type: 'instance', prefab: 'chair-parts' },
        },
        { id: 'chair/root', content: { type: 'group' } },
      ],
    };
    expect(validateSceneDocument(scene).issues).toContainEqual(
      expect.objectContaining({
        code: 'duplicate-id',
        message: expect.stringContaining(
          'derived runtime node id "chair/root"',
        ),
      }),
    );

    scene.nodes = [
      {
        id: 'chairs',
        content: {
          type: 'pattern',
          prefab: 'chair-parts',
          distribution: { type: 'linear', count: 1, step: [1, 0, 0] },
        },
      },
      { id: 'chairs/0000/root', content: { type: 'group' } },
    ];
    expect(validateSceneDocument(scene).issues).toContainEqual(
      expect.objectContaining({
        code: 'duplicate-id',
        message: expect.stringContaining('"chairs/0000/root"'),
      }),
    );

    scene.resources.prefabs = [
      {
        id: 'inner',
        root: { id: 'root', content: { type: 'group' } },
      },
      {
        id: 'outer',
        root: {
          id: 'root',
          content: { type: 'group' },
          children: [
            { id: 'seat/root', content: { type: 'group' } },
            {
              id: 'seat',
              content: { type: 'instance', prefab: 'inner' },
            },
          ],
        },
      },
    ];
    scene.nodes = [
      { id: 'chair', content: { type: 'instance', prefab: 'outer' } },
    ];
    expect(validateSceneDocument(scene).issues).toContainEqual(
      expect.objectContaining({
        code: 'duplicate-id',
        message: expect.stringContaining('"chair/seat/root"'),
      }),
    );
  });

  it('keeps document and runtime hash formats explicit', () => {
    expect(hashSceneDocument(makeScene())).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(hashRuntimeSceneDocument(makeScene())).toMatch(
      /^sha256:[0-9a-f]{64}$/u,
    );
    expect(HASH_B).toMatch(/^sha256:/u);
  });

  it('validates bounded studio lighting and environment settings', () => {
    const scene = makeScene();
    scene.environment = {
      fog: { color: '#eeeeee', density: 0.04, type: 'exponential' },
      shadowMapType: 'pcf-soft',
      shadows: true,
    };
    scene.nodes[4].components = {
      'com.iwsdk.components.RectAreaLight': {
        color: [1, 1, 1, 1],
        height: 4,
        intensity: 3,
        width: 5,
      },
    };
    expect(validateSceneDocument(scene)).toEqual({ valid: true, issues: [] });

    scene.environment!.fog = {
      color: '#eeeeee',
      density: 0,
      type: 'exponential',
    };
    expect(validateSceneDocument(scene).issues).toContainEqual(
      expect.objectContaining({
        path: '$.environment.fog.density',
        code: 'schema',
      }),
    );
  });

  it('generates deterministic periodic maps with resolution-invariant normals', () => {
    const color = proceduralColorTexture(101, [64, 64]);
    const first = generateSceneProceduralTexture('albedo', color);
    const second = generateSceneProceduralTexture('albedo', color);
    expect(second.dataHash).toBe(first.dataHash);
    expect(
      generateSceneProceduralTexture('albedo', {
        ...color,
        seed: 102,
      }).dataHash,
    ).not.toBe(first.dataHash);

    const normal64 = generateSceneProceduralTexture('normal', {
      ...proceduralNormalTexture(73, [64, 64]),
      scale: [1, 1],
    }).data;
    const normal256 = generateSceneProceduralTexture('normal', {
      ...proceduralNormalTexture(73, [256, 256]),
      scale: [1, 1],
    }).data;
    expect(meanNormalZ(normal64)).toBeCloseTo(meanNormalZ(normal256), 1);
    expect(maxNormalEdgeDelta(normal256, 256, 256)).toBeLessThan(18);
  });

  it('capability-gates manifest asset nodes and component schema hashes', () => {
    const scene = makeScene();
    const markerHash = hashSceneComponentSchema(MARKER_SCHEMA);
    const directionalLightHash = hashSceneComponentSchema(
      DIRECTIONAL_LIGHT_SCHEMA,
    );
    const snapshot: SceneCapabilitySnapshot = {
      sdkVersion: '0.4.2',
      sceneVersions: [CURRENT_SCENE_VERSION],
      nodeContentTypes: ['group', 'instance', 'pattern'],
      patternTypes: [
        'linear',
        'grid',
        'radial',
        'along-path',
        'scatter',
        'explicit',
      ],
      shadowMapTypes: [],
      componentSchemaHashes: {
        DirectionalLight: directionalLightHash,
        Marker: markerHash,
      },
    };
    scene.authoring!.composition!.provenance.capabilityHash =
      hashSceneCapabilitySnapshot(snapshot);
    expect(
      validateSceneCapabilities(scene, snapshot, {
        componentCatalog: TEST_COMPONENT_CATALOG,
      }).issues,
    ).toContainEqual(
      expect.objectContaining({
        code: 'capability',
        message: expect.stringContaining('asset'),
      }),
    );
    snapshot.nodeContentTypes.push('asset');
    scene.authoring!.composition!.provenance.capabilityHash =
      hashSceneCapabilitySnapshot(snapshot);
    expect(
      validateSceneCapabilities(scene, snapshot, {
        componentCatalog: TEST_COMPONENT_CATALOG,
      }),
    ).toEqual({
      valid: true,
      issues: [],
    });
    scene.authoring!.composition!.provenance.capabilityHash = HASH_A;
    expect(
      validateSceneCapabilities(scene, snapshot, {
        componentCatalog: TEST_COMPONENT_CATALOG,
        validateAuthoringWorkflow: false,
      }),
    ).toEqual({ issues: [], valid: true });
    expect(hashSceneCapabilitySnapshot(snapshot)).toMatch(
      /^sha256:[0-9a-f]{64}$/u,
    );
  });
});

function proceduralColorTexture(seed: number, resolution: [number, number]) {
  return {
    algorithm: 'periodic-fbm-v1' as const,
    bands: [
      { amplitude: 0.7, frequency: [2, 3] as [number, number] },
      { amplitude: 0.3, frequency: [11, 13] as [number, number] },
    ],
    ramp: [
      { at: 0, color: '#08235f' as const },
      { at: 1, color: '#304d8c' as const },
    ],
    resolution,
    sampler: { wrapU: 'repeat' as const, wrapV: 'repeat' as const },
    seed,
    type: 'procedural' as const,
  };
}

function proceduralScalarTexture(seed: number, resolution: [number, number]) {
  const color = proceduralColorTexture(seed, resolution);
  const { ramp: _ramp, ...common } = color;
  return { ...common, range: [0.2, 0.8] as [number, number] };
}

function proceduralNormalTexture(seed: number, resolution: [number, number]) {
  const scalar = proceduralScalarTexture(seed, resolution);
  const { range: _range, ...common } = scalar;
  return common;
}

function meanNormalZ(data: Uint8Array): number {
  let sum = 0;
  for (let index = 2; index < data.length; index += 4) {
    sum += data[index] / 255;
  }
  return sum / (data.length / 4);
}

function maxNormalEdgeDelta(
  data: Uint8Array,
  width: number,
  height: number,
): number {
  let max = 0;
  for (let y = 0; y < height; y += 1) {
    const first = y * width * 4;
    const last = (y * width + width - 1) * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      max = Math.max(
        max,
        Math.abs(data[first + channel] - data[last + channel]),
      );
    }
  }
  return max;
}
