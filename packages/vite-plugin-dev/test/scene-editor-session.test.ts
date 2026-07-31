/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  applyScenePatch,
  canonicalizeJson,
  createSceneComponentCatalog,
  hashSceneDocument,
  sha256,
  type SceneDocument,
} from '@iwsdk/scene-composition';
import { describe, expect, test, vi } from 'vitest';
import {
  SceneEditorSession,
  SCENE_EDITOR_TOOL_METHODS,
  type SceneEditorRenderStats,
} from '../src/editor/scene-editor-session.js';

const DOCUMENT = {
  resources: {},
  nodes: [
    {
      content: { asset: 'table', type: 'asset' },
      id: 'table-1',
      transform: { position: [0, 0, 0] },
    },
  ],
  units: 'meters',
  version: 'iwsdk.scene.v1',
};

const ASSET_BOUNDS: Record<
  string,
  { min: [number, number, number]; max: [number, number, number] }
> = {
  table: { min: [-1, 0, -1], max: [1, 0.5, 1] },
  vase: { min: [-0.1, 0, -0.1], max: [0.1, 0.4, 0.1] },
  ground: { min: [-2, -0.1, -2], max: [2, 0.1, 2] },
  landmark: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
  road: { min: [-2, -0.1, -2], max: [2, 0.1, 2] },
  'road-marking': { min: [-1, -0.1, 0], max: [1, 0.1, 0] },
  'floor-slab': { min: [-3, -0.2, -3], max: [3, 0.2, 3] },
  wall: { min: [-2, 0, -0.1], max: [2, 3, 0.1] },
};

const resolveAssetBounds = (assetId: string) => ASSET_BOUNDS[assetId];
const listAssets = () =>
  Object.entries(ASSET_BOUNDS).map(([id, bounds]) => ({
    bounds,
    id,
    kind: 'procedural' as const,
    name: id,
  }));

function applyPatches(
  document: SceneDocument,
  patches: Parameters<typeof applyScenePatch>[1][],
) {
  return applyScenePatch(document, { op: 'transaction', patches }).document;
}

describe('SceneEditorSession', () => {
  test('handles every native scene editor tool method', () => {
    const session = new SceneEditorSession({ document: DOCUMENT });

    for (const method of SCENE_EDITOR_TOOL_METHODS) {
      expect(session.handles(method)).toBe(true);
    }
    expect(session.handles('get_transform')).toBe(false);
  });

  test('atomically adopts valid disk changes while preserving valid selection', async () => {
    const phases: string[] = [];
    const replacement = structuredClone(DOCUMENT) as SceneDocument;
    replacement.nodes[0].transform = { position: [2, 0, 0] };
    const session = new SceneEditorSession({
      document: DOCUMENT,
      preloadDocumentResources: () => phases.push('preload'),
      instantiateDocumentPreview: () => phases.push('instantiate'),
      commitDocument: () => phases.push('commit'),
    });
    await session.dispatch('scene_select', { nodeIds: ['table-1'] });

    const result = await session.replaceFromDisk(replacement);

    expect(phases).toEqual(['preload', 'instantiate', 'commit']);
    expect(result.documentHash).toBe(hashSceneDocument(replacement));
    expect(session.document.nodes[0].transform).toEqual({
      position: [2, 0, 0],
    });
    expect(session.isDirty).toBe(false);
    await expect(session.dispatch('scene_get_selection', {})).resolves.toEqual({
      nodeIds: ['table-1'],
    });
  });

  test('does not overwrite unsaved human edits from disk', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });
    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [1, 0, 0] },
    });

    await expect(session.replaceFromDisk(DOCUMENT)).rejects.toThrow(
      /unsaved editor changes/,
    );
    expect(session.document.nodes[0].transform).toEqual({
      position: [1, 0, 0],
    });
  });

  test('reports deterministic scene capabilities and document hashes', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });

    const capabilities = (await session.dispatch(
      'scene_get_capabilities',
    )) as any;
    expect(capabilities).toMatchObject({
      capabilityHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      componentSchemaCount: 0,
      detail: 'summary',
      fullAvailable: true,
      nodeContentKinds: expect.arrayContaining([
        'asset',
        'group',
        'instance',
        'pattern',
      ]),
      ownershipModes: ['replace-new'],
      resourceKinds: ['prefab'],
      reviewSchemaHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      savedViewProjections: ['perspective', 'orthographic'],
      schemaVersions: ['iwsdk.scene.v1'],
      sceneSchemaHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      safetyLimits: {
        maxAbsoluteCoordinate: 1_000_000,
        maxNodes: 10_000,
        maxPatternExpansion: 10_000,
        maxResources: 4_096,
      },
      snapshot: {
        componentSchemaHashes: {},
        limits: {
          maxNodes: 10_000,
          maxPatternExpansion: 10_000,
          maxResources: 4_096,
        },
        nodeContentTypes: expect.arrayContaining(['asset']),
        patternTypes: expect.arrayContaining(['linear', 'scatter']),
        sceneVersions: ['iwsdk.scene.v1'],
        sdkVersion: '0.4.2',
        shadowMapTypes: ['basic', 'pcf', 'pcf-soft'],
      },
      uriSchemes: ['relative', 'http', 'https'],
    });
    expect(capabilities).not.toHaveProperty('componentSchemas');
    await expect(
      session.dispatch('scene_get_capabilities', { full: true }),
    ).resolves.toMatchObject({
      componentSchemas: [],
      detail: 'full',
    });
    await expect(
      session.dispatch('scene_get_capabilities', { full: 'yes' }),
    ).rejects.toThrow('full must be a boolean');
    expect(capabilities.capabilityHash).toBe(
      sha256(canonicalizeJson(capabilities.snapshot)),
    );
    expect(Object.keys(capabilities.snapshot).sort()).toEqual(
      [
        'componentSchemaHashes',
        'limits',
        'nodeContentTypes',
        'patternTypes',
        'sceneVersions',
        'sdkVersion',
        'shadowMapTypes',
      ].sort(),
    );
    await expect(session.dispatch('scene_get_document')).resolves.toMatchObject(
      {
        document: { resources: expect.any(Object), version: 'iwsdk.scene.v1' },
        documentHash: hashSceneDocument(session.document),
        runtimeHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    );
  });

  test('applies environment, view, and node patches atomically with one undo', async () => {
    const preloadDocumentResources = vi.fn();
    const instantiateDocumentPreview = vi.fn();
    const commitDocument = vi.fn();
    const session = new SceneEditorSession({
      commitDocument,
      document: DOCUMENT,
      instantiateDocumentPreview,
      preloadDocumentResources,
    });
    const baseDocument = session.document;
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      {
        environment: {
          exposure: 1.1,
          shadows: true,
          toneMapping: 'aces',
        },
        op: 'setEnvironment',
      },
      {
        op: 'addAuthoringView',
        view: {
          fov: 42,
          id: 'hero',
          position: [4, 3, 4],
          projection: 'perspective',
          role: 'hero',
          target: [0, 0, 0],
        },
      },
      {
        node: {
          content: { asset: 'vase', type: 'asset' },
          id: 'shrub',
          transform: { position: [2, 0.25, 0] },
        },
        op: 'addNode',
      },
    ];
    const candidate = applyPatches(baseDocument, patches);

    await expect(
      session.dispatch('scene_apply_transaction', {
        candidateDocumentHash: hashSceneDocument(candidate),
        expectedBaseDocumentHash: hashSceneDocument(baseDocument),
        ownershipMode: 'replace-new',
        patches,
      }),
    ).resolves.toMatchObject({
      action: 'transactionApplied',
      candidateDocumentHash: hashSceneDocument(candidate),
      lifecycle: {
        capabilityCompatible: 'passed',
        editorCommitted: 'passed',
        resourcesReady: 'passed',
        runtimeProven: 'not-run',
        schemaValid: 'passed',
      },
      patchCount: 3,
      valid: true,
    });
    expect(preloadDocumentResources).toHaveBeenCalledWith(candidate);
    expect(instantiateDocumentPreview).toHaveBeenCalledWith(candidate);
    expect(commitDocument).toHaveBeenCalledWith(candidate);
    expect(session.document).toMatchObject({
      authoring: { views: [expect.objectContaining({ id: 'hero' })] },
      environment: { toneMapping: 'aces' },
      nodes: expect.arrayContaining([expect.objectContaining({ id: 'shrub' })]),
    });

    await session.dispatch('scene_undo');
    expect(session.document).toEqual(baseDocument);
    await session.dispatch('scene_redo');
    expect(session.document).toEqual(candidate);
  });

  test('computes and returns candidate hashes when callers omit the optional assertion', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });
    const base = session.document;
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      { environment: { shadows: true }, op: 'setEnvironment' },
    ];
    const transactionCandidate = applyPatches(base, patches);

    await expect(
      session.dispatch('scene_apply_transaction', {
        expectedBaseDocumentHash: hashSceneDocument(base),
        patches,
      }),
    ).resolves.toMatchObject({
      action: 'transactionApplied',
      candidateDocumentHash: hashSceneDocument(transactionCandidate),
    });

    const replacementCandidate: SceneDocument = {
      ...transactionCandidate,
      nodes: [
        ...transactionCandidate.nodes,
        { content: { type: 'group' }, id: 'generated-root' },
      ],
    };
    await expect(
      session.dispatch('scene_replace_document', {
        document: replacementCandidate,
        expectedBaseDocumentHash: hashSceneDocument(transactionCandidate),
      }),
    ).resolves.toMatchObject({
      action: 'documentReplaced',
      candidateDocumentHash: hashSceneDocument(replacementCandidate),
    });
    expect(session.document).toEqual(replacementCandidate);
  });

  test('still requires a live base hash when the candidate assertion is omitted', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      { environment: { shadows: true }, op: 'setEnvironment' },
    ];
    const candidate = applyPatches(session.document, patches);

    await expect(
      session.dispatch('scene_apply_transaction', { patches }),
    ).rejects.toThrow('expectedBaseDocumentHash is required');
    await expect(
      session.dispatch('scene_replace_document', { document: candidate }),
    ).rejects.toThrow('expectedBaseDocumentHash is required');
    expect(session.document).toEqual(DOCUMENT);
  });

  test.each([
    ['preloadDocumentResources', 'failed', 'not-run'],
    ['instantiateDocumentPreview', 'passed', 'failed'],
    ['commitDocument', 'passed', 'failed'],
  ] as const)(
    'rolls back a failed %s hook without consuming undo history',
    async (hookName, expectedResourcesReady, expectedEditorCommitted) => {
      const rollbackDocument = vi.fn();
      const hooks = {
        commitDocument: vi.fn(),
        instantiateDocumentPreview: vi.fn(),
        preloadDocumentResources: vi.fn(),
      };
      hooks[hookName].mockRejectedValue(new Error(`${hookName} failed`));
      const session = new SceneEditorSession({
        document: DOCUMENT,
        ...hooks,
        rollbackDocument,
      });
      await session.dispatch('scene_select', { nodeIds: ['table-1'] });
      await session.dispatch('scene_set_transform', {
        nodeId: 'table-1',
        transform: { position: [0.25, 0, 0] },
      });
      const beforeFailure = session.document;
      const patches: Parameters<typeof applyScenePatch>[1][] = [
        {
          environment: { exposure: 1.1 },
          op: 'setEnvironment',
        },
      ];
      const candidate = applyPatches(beforeFailure, patches);

      await expect(
        session.dispatch('scene_apply_transaction', {
          candidateDocumentHash: hashSceneDocument(candidate),
          expectedBaseDocumentHash: hashSceneDocument(beforeFailure),
          patches,
        }),
      ).rejects.toMatchObject({
        lifecycle: {
          capabilityCompatible: 'passed',
          editorCommitted: expectedEditorCommitted,
          resourcesReady: expectedResourcesReady,
          runtimeProven: 'not-run',
          schemaValid: 'passed',
        },
        message: `${hookName} failed`,
      });
      expect(hooks.preloadDocumentResources).toHaveBeenCalledTimes(1);
      expect(hooks.instantiateDocumentPreview).toHaveBeenCalledTimes(
        hookName === 'preloadDocumentResources' ? 0 : 1,
      );
      expect(hooks.commitDocument).toHaveBeenCalledTimes(
        hookName === 'commitDocument' ? 1 : 0,
      );
      expect(rollbackDocument).toHaveBeenCalledWith(candidate, beforeFailure);
      expect(session.document).toEqual(beforeFailure);
      expect(await session.dispatch('scene_get_selection')).toEqual({
        nodeIds: ['table-1'],
      });
      expect(session.isDirty).toBe(true);

      await session.dispatch('scene_undo');
      expect(session.document.nodes[0]?.transform?.position).toEqual([0, 0, 0]);
    },
  );

  test('preserves the exact selection after a successful unrelated transaction', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          DOCUMENT.nodes[0],
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'shelf-lower',
            transform: { position: [0.25, 0, 0] },
          },
        ],
      },
      listAssets,
      resolveAssetBounds,
    });
    await session.dispatch('scene_select', { nodeIds: ['table-1'] });
    const base = session.document;
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      {
        nodeId: 'shelf-lower',
        op: 'updateTransform',
        transform: { position: [0.5, 0, 0] },
      },
    ];
    const candidate = applyPatches(base, patches);

    await expect(
      session.dispatch('scene_apply_transaction', {
        candidateDocumentHash: hashSceneDocument(candidate),
        expectedBaseDocumentHash: hashSceneDocument(base),
        patches,
      }),
    ).resolves.toMatchObject({
      action: 'transactionApplied',
      selection: ['table-1'],
    });
    await expect(session.dispatch('scene_get_selection')).resolves.toEqual({
      nodeIds: ['table-1'],
    });
  });

  test('discards an authorized transition after commit failure and authorizes a clean retry', async () => {
    const authorizeDocumentTransition = vi.fn();
    const discardDocumentTransition = vi.fn();
    const commitDocument = vi
      .fn()
      .mockRejectedValueOnce(new Error('install failed'))
      .mockResolvedValueOnce(undefined);
    const session = new SceneEditorSession({
      authorizeDocumentTransition,
      commitDocument,
      discardDocumentTransition,
      document: DOCUMENT,
    });
    const base = session.document;
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      { environment: { shadows: true }, op: 'setEnvironment' },
    ];
    const candidate = applyPatches(base, patches);
    const transaction = {
      candidateDocumentHash: hashSceneDocument(candidate),
      expectedBaseDocumentHash: hashSceneDocument(base),
      patches,
    };

    await expect(
      session.dispatch('scene_apply_transaction', transaction),
    ).rejects.toThrow('install failed');
    expect(discardDocumentTransition).toHaveBeenCalledTimes(1);
    expect(session.document).toEqual(base);

    await expect(
      session.dispatch('scene_apply_transaction', transaction),
    ).resolves.toMatchObject({ action: 'transactionApplied' });
    expect(authorizeDocumentTransition).toHaveBeenCalledTimes(2);
    expect(authorizeDocumentTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({ patch: { op: 'transaction', patches } }),
    );
    expect(discardDocumentTransition).toHaveBeenCalledTimes(1);
    expect(session.document).toEqual(candidate);
  });

  test('does not report an editor commit when no install hook is configured', async () => {
    const preloadDocumentResources = vi.fn();
    const instantiateDocumentPreview = vi.fn();
    const session = new SceneEditorSession({
      document: DOCUMENT,
      instantiateDocumentPreview,
      preloadDocumentResources,
    });
    const base = session.document;
    const candidate = applyPatches(base, [
      { environment: { shadows: true }, op: 'setEnvironment' },
    ]);

    await expect(
      session.dispatch('scene_replace_document', {
        candidateDocumentHash: hashSceneDocument(candidate),
        document: candidate,
        expectedBaseDocumentHash: hashSceneDocument(base),
      }),
    ).resolves.toMatchObject({
      lifecycle: {
        capabilityCompatible: 'passed',
        editorCommitted: 'not-run',
        resourcesReady: 'passed',
        runtimeProven: 'not-run',
        schemaValid: 'passed',
      },
    });
    expect(session.document).toEqual(candidate);
  });

  test('serializes document writes while async materialization is staged', async () => {
    let releasePreload: (() => void) | undefined;
    const preloadDocumentResources = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releasePreload = resolve;
        }),
    );
    const session = new SceneEditorSession({
      document: DOCUMENT,
      preloadDocumentResources,
    });
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      { environment: { shadows: true }, op: 'setEnvironment' },
    ];
    const base = session.document;
    const candidate = applyPatches(base, patches);
    const transaction = session.dispatch('scene_apply_transaction', {
      candidateDocumentHash: hashSceneDocument(candidate),
      expectedBaseDocumentHash: hashSceneDocument(base),
      patches,
    });
    await vi.waitFor(() => expect(preloadDocumentResources).toHaveBeenCalled());

    await expect(
      session.dispatch('scene_set_transform', {
        nodeId: 'table-1',
        transform: { position: [1, 0, 0] },
      }),
    ).rejects.toThrow('materialization is in progress');
    releasePreload?.();
    await expect(transaction).resolves.toMatchObject({
      action: 'transactionApplied',
    });
    expect(session.document).toEqual(candidate);
  });

  test('rejects stale or dishonest transaction hashes before resource preload', async () => {
    const preloadDocumentResources = vi.fn();
    const session = new SceneEditorSession({
      document: DOCUMENT,
      preloadDocumentResources,
    });
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      { environment: { shadows: true }, op: 'setEnvironment' },
    ];
    const candidate = applyPatches(session.document, patches);

    await expect(
      session.dispatch('scene_apply_transaction', {
        candidateDocumentHash: hashSceneDocument(candidate),
        expectedBaseDocumentHash: `sha256:${'0'.repeat(64)}`,
        patches,
      }),
    ).rejects.toThrow('Scene document changed');
    await expect(
      session.dispatch('scene_apply_transaction', {
        candidateDocumentHash: `sha256:${'f'.repeat(64)}`,
        expectedBaseDocumentHash: hashSceneDocument(session.document),
        patches,
      }),
    ).rejects.toThrow('Candidate document hash mismatch');
    await expect(
      session.dispatch('scene_replace_document', {
        candidateDocumentHash: `sha256:${'f'.repeat(64)}`,
        document: candidate,
        expectedBaseDocumentHash: hashSceneDocument(session.document),
      }),
    ).rejects.toThrow('Candidate document hash mismatch');
    expect(preloadDocumentResources).not.toHaveBeenCalled();
  });

  test('replaces a complete scene document atomically and restores it in one undo', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });
    await session.dispatch('scene_select', { nodeIds: ['table-1'] });
    const base = session.document;
    const candidate: SceneDocument = {
      nodes: [{ content: { type: 'group' }, id: 'generated-root' }],
      resources: {},
      units: 'meters',
      version: 'iwsdk.scene.v1',
    };

    await expect(
      session.dispatch('scene_replace_document', {
        candidateDocumentHash: hashSceneDocument(candidate),
        document: candidate,
        expectedBaseDocumentHash: hashSceneDocument(base),
      }),
    ).resolves.toMatchObject({
      action: 'documentReplaced',
      candidateDocumentHash: hashSceneDocument(candidate),
    });
    expect(session.document).toEqual(candidate);
    expect(await session.dispatch('scene_get_selection')).toEqual({
      nodeIds: [],
    });

    await session.dispatch('scene_undo');
    expect(session.document).toEqual(base);
  });

  test('accepts a null base hash only for a blank new scene', async () => {
    const blank: SceneDocument = {
      nodes: [],
      resources: {},
      units: 'meters',
      version: 'iwsdk.scene.v1',
    };
    const candidate: SceneDocument = {
      ...blank,
      nodes: [{ content: { type: 'group' }, id: 'root' }],
    };
    const session = new SceneEditorSession({ document: blank });

    await expect(
      session.dispatch('scene_replace_document', {
        candidateDocumentHash: hashSceneDocument(candidate),
        document: candidate,
        expectedBaseDocumentHash: null,
      }),
    ).resolves.toMatchObject({ action: 'documentReplaced' });
    await expect(
      session.dispatch('scene_replace_document', {
        candidateDocumentHash: hashSceneDocument(candidate),
        document: candidate,
        expectedBaseDocumentHash: null,
      }),
    ).rejects.toThrow('live document is not blank');
  });

  test('rejects capability-invalid transaction candidates before resource preload', async () => {
    const preloadDocumentResources = vi.fn();
    const session = new SceneEditorSession({
      document: DOCUMENT,
      preloadDocumentResources,
    });
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      {
        node: {
          components: { NotRegistered: {} },
          content: { type: 'group' },
          id: 'invalid-component-node',
        },
        op: 'addNode',
      },
    ];
    const candidate = applyPatches(session.document, patches);

    await expect(
      session.dispatch('scene_apply_transaction', {
        candidateDocumentHash: hashSceneDocument(candidate),
        expectedBaseDocumentHash: hashSceneDocument(session.document),
        patches,
      }),
    ).rejects.toThrow('Cannot commit invalid scene');
    expect(preloadDocumentResources).not.toHaveBeenCalled();
    expect(session.document.nodes).toHaveLength(1);
  });

  test('rejects derived runtime id collisions before editor materialization', async () => {
    const preloadDocumentResources = vi.fn();
    const session = new SceneEditorSession({
      document: DOCUMENT,
      preloadDocumentResources,
    });
    const base = session.document;
    const candidate: SceneDocument = {
      nodes: [
        {
          id: 'chair',
          content: { type: 'instance', prefab: 'chair-parts' },
        },
        { id: 'chair/root', content: { type: 'group' } },
      ],
      resources: {
        prefabs: [
          {
            id: 'chair-parts',
            root: { id: 'root', content: { type: 'group' } },
          },
        ],
      },
      units: 'meters',
      version: 'iwsdk.scene.v1',
    };

    await expect(
      session.dispatch('scene_replace_document', {
        candidateDocumentHash: sha256(canonicalizeJson(candidate)),
        document: candidate,
        expectedBaseDocumentHash: hashSceneDocument(base),
      }),
    ).rejects.toThrow('derived runtime node id "chair/root"');
    expect(preloadDocumentResources).not.toHaveBeenCalled();
    expect(session.document).toEqual(base);
  });

  test('lists component schemas derived from the manifest catalog', async () => {
    const session = new SceneEditorSession({
      componentCatalog: createSceneComponentCatalog([
        {
          fields: {
            isVisible: { default: true, type: 'Boolean' },
          },
          id: 'Visibility',
          source: 'iwsdk',
        },
        {
          fields: {
            config: { default: '', type: 'String' },
            maxWidth: { default: 1, type: 'Float32' },
          },
          id: 'PanelUI',
          source: 'app',
        },
      ]),
      document: DOCUMENT,
    });

    await expect(
      session.dispatch('scene_list_component_schemas', {}),
    ).resolves.toMatchObject({
      componentSchemas: [
        expect.objectContaining({ id: 'PanelUI' }),
        expect.objectContaining({ id: 'Visibility' }),
      ],
    });
    await expect(
      session.dispatch('scene_list_component_schemas', { query: 'visibility' }),
    ).resolves.toEqual({
      componentSchemas: [
        {
          fields: {
            isVisible: { default: true, type: 'Boolean' },
          },
          id: 'Visibility',
          source: 'iwsdk',
        },
      ],
    });
  });

  test('adds, orients, selects, undoes, and redoes scene nodes', async () => {
    const session = new SceneEditorSession({
      document: DOCUMENT,
      listAssets,
      resolveAssetBounds,
    });

    await session.dispatch('scene_add_node', {
      node: {
        content: { asset: 'vase', type: 'asset' },
        id: 'vase-1',
        transform: { position: [0.4, 0.5, 0] },
      },
    });
    const lookAtResult = await session.dispatch('scene_look_at', {
      nodeId: 'vase-1',
      target: [0, 0, 1],
    });
    await session.dispatch('scene_select', { nodeIds: ['vase-1'] });

    expect(lookAtResult).toMatchObject({
      action: 'nodeOriented',
      valid: true,
    });
    expect(await session.dispatch('scene_get_selection')).toEqual({
      nodeIds: ['vase-1'],
    });
    expect(await session.dispatch('scene_get_hierarchy')).toMatchObject({
      hierarchy: [{ id: 'table-1' }, { id: 'vase-1' }],
    });
    expect(session.document.nodes[1]?.transform?.position).toEqual([
      0.4, 0.5, 0,
    ]);

    await session.dispatch('scene_undo');
    expect(session.document.nodes[1]?.transform?.rotationDeg).toBeUndefined();

    await session.dispatch('scene_redo');
    expect(session.document.nodes[1]?.transform?.rotationDeg?.[1]).toBeCloseTo(
      338.1985,
    );
  });

  test('composes, edits, and validates manifest assets', async () => {
    const session = new SceneEditorSession({
      document: {
        resources: {},
        nodes: [
          {
            content: { asset: 'ground', receiveShadow: true, type: 'asset' },
            id: 'ground',
            transform: { position: [0, 0.1, 0] },
          },
        ],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      },
      listAssets,
      resolveAssetBounds,
    });

    await session.dispatch('scene_add_node', {
      node: {
        content: { asset: 'landmark', type: 'asset' },
        id: 'landmark',
        transform: { position: [1, 0.7, -1] },
      },
    });

    expect(session.document.nodes[1]).toMatchObject({
      content: { asset: 'landmark', type: 'asset' },
      id: 'landmark',
      transform: { position: [1, 0.7, -1] },
    });
    await expect(
      session.dispatch('scene_get_hierarchy'),
    ).resolves.toMatchObject({
      hierarchy: [
        { asset: 'ground', id: 'ground' },
        { asset: 'landmark', id: 'landmark' },
      ],
    });
    await expect(session.dispatch('scene_validate')).resolves.toMatchObject({
      issues: [],
      lifecycle: {
        capabilityCompatible: 'passed',
        editorCommitted: 'not-run',
        resourcesReady: 'not-run',
        runtimeProven: 'not-run',
        schemaValid: 'passed',
      },
      valid: true,
    });

    await session.dispatch('scene_apply_patch', {
      patch: {
        content: {
          asset: 'table',
          type: 'asset',
        },
        nodeId: 'landmark',
        op: 'updateContent',
      },
    });
    expect(session.document.nodes[1]?.content).toMatchObject({
      asset: 'table',
      type: 'asset',
    });

    await session.dispatch('scene_undo');
    expect(session.document.nodes[1]?.content).toMatchObject({
      asset: 'landmark',
    });
    await session.dispatch('scene_redo');
    expect(session.document.nodes[1]?.content).toMatchObject({
      asset: 'table',
    });
  });

  test('accepts rotated manifest asset transforms', async () => {
    const session = new SceneEditorSession({
      document: {
        resources: {},
        nodes: [
          {
            content: { asset: 'road', type: 'asset' },
            id: 'road',
            transform: { position: [0, 0.1, 0] },
          },
          {
            content: { asset: 'road-marking', type: 'asset' },
            id: 'road-marking',
            transform: {
              position: [0, 0.205, 0],
              rotationDeg: [-90, 0, 0],
            },
          },
        ],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      },
      listAssets,
      resolveAssetBounds,
    });

    await expect(session.dispatch('scene_validate')).resolves.toMatchObject({
      issues: [],
      valid: true,
    });
  });

  test('saves serialized JSON and returns screenshots through injected handlers', async () => {
    const saveDocument = vi.fn().mockResolvedValue({
      bytes: 42,
      path: 'src/scene.iwsdk.scene.json',
      savedAt: '2026-06-30T00:00:00.000Z',
    });
    const screenshot = vi.fn().mockReturnValue({
      camera: {
        fov: 50,
        lookAt: [0, 0, 0],
        position: [0, 8, 0],
        view: 'top',
      },
      imageData: 'png',
      mimeType: 'image/png',
    });
    const session = new SceneEditorSession({
      document: DOCUMENT,
      saveDocument,
      screenshot,
    });

    await session.dispatch('scene_set_camera', { view: 'top' });
    const image = await session.dispatch('scene_screenshot', {
      height: 256,
      view: 'top',
      width: 256,
    });
    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [0.25, 0, 0] },
    });
    expect(session.isDirty).toBe(true);
    const saved = await session.dispatch('scene_save');

    expect(session.isDirty).toBe(false);
    expect(screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'top' }),
      { captureMode: 'render', height: 256, width: 256 },
    );
    expect(image).toMatchObject({ imageData: 'png', mimeType: 'image/png' });
    expect(JSON.parse(saveDocument.mock.calls[0][0])).toMatchObject({
      resources: expect.any(Object),
      version: 'iwsdk.scene.v1',
    });
    expect(saved).toMatchObject({
      bytes: 42,
      dirty: false,
      path: 'src/scene.iwsdk.scene.json',
    });
  });

  test('renders isolated UIKitML asset previews through the injected renderer', async () => {
    const renderUIPreview = vi.fn().mockResolvedValue({
      assetId: 'welcome-panel',
      background: '#112233',
      height: 240,
      imageData: 'png',
      mimeType: 'image/png',
      width: 320,
    });
    const session = new SceneEditorSession({
      document: DOCUMENT,
      renderUIPreview,
    });

    await expect(
      session.dispatch('ui_render_preview', {
        assetId: 'welcome-panel',
        background: '#112233',
        height: 240,
        width: 320,
      }),
    ).resolves.toMatchObject({
      assetId: 'welcome-panel',
      imageData: 'png',
      mimeType: 'image/png',
    });
    expect(renderUIPreview).toHaveBeenCalledWith('welcome-panel', {
      background: '#112233',
      height: 240,
      width: 320,
    });
  });

  test('lists only UIKitML assets for isolated UI rendering', async () => {
    const session = new SceneEditorSession({
      document: DOCUMENT,
      listAssets: () => [
        { id: 'table', kind: 'gltf', name: 'Table' },
        { id: 'welcome-panel', kind: 'uikitml', name: 'Welcome Panel' },
        { id: 'settings-panel', kind: 'uikitml', name: 'Settings Panel' },
      ],
    });

    await expect(session.dispatch('ui_list_assets', {})).resolves.toEqual({
      assets: [
        { id: 'welcome-panel', kind: 'uikitml', name: 'Welcome Panel' },
        { id: 'settings-panel', kind: 'uikitml', name: 'Settings Panel' },
      ],
    });
    await expect(
      session.dispatch('ui_list_assets', { query: 'settings' }),
    ).resolves.toEqual({
      assets: [
        { id: 'settings-panel', kind: 'uikitml', name: 'Settings Panel' },
      ],
    });
  });

  test('keeps the session dirty when an edit lands during an awaited save', async () => {
    let resolveSave:
      | ((value: { bytes: number; path: string }) => void)
      | undefined;
    const saveDocument = vi.fn(
      () =>
        new Promise<{ bytes: number; path: string }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const session = new SceneEditorSession({
      document: DOCUMENT,
      saveDocument,
    });

    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [0.25, 0, 0] },
    });
    const savePromise = session.dispatch('scene_save');
    expect(saveDocument).toHaveBeenCalledTimes(1);

    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [0.5, 0, 0] },
    });
    resolveSave?.({ bytes: 42, path: 'src/scene.iwsdk.scene.json' });

    await expect(savePromise).resolves.toMatchObject({
      dirty: true,
    });
    expect(session.isDirty).toBe(true);
    expect(session.document.nodes[0].transform?.position).toEqual([0.5, 0, 0]);
  });

  test('keeps a failed save as a dirty candidate and supports an idempotent retry', async () => {
    const saveDocument = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('temporary persistence failure'), {
          recoverable: true,
          retryAction: 'scene_save',
        }),
      )
      .mockResolvedValueOnce({
        bytes: 42,
        path: 'src/scene.iwsdk.scene.json',
      });
    const session = new SceneEditorSession({
      document: DOCUMENT,
      saveDocument,
    });
    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [0.25, 0, 0] },
    });

    await expect(session.dispatch('scene_save')).rejects.toMatchObject({
      recoverable: true,
      retryAction: 'scene_save',
    });
    expect(session.isDirty).toBe(true);
    expect(session.document.nodes[0].transform?.position).toEqual([0.25, 0, 0]);

    await expect(session.dispatch('scene_save')).resolves.toMatchObject({
      dirty: false,
    });
    expect(saveDocument).toHaveBeenCalledTimes(2);
    expect(saveDocument.mock.calls[0][0]).toBe(saveDocument.mock.calls[1][0]);
  });

  test('tracks dirty state against the last saved document snapshot', async () => {
    const saveDocument = vi.fn().mockResolvedValue({
      bytes: 42,
      path: 'src/scene.iwsdk.scene.json',
    });
    const session = new SceneEditorSession({
      document: DOCUMENT,
      saveDocument,
    });

    expect(session.isDirty).toBe(false);
    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [0.25, 0, 0] },
    });
    expect(session.isDirty).toBe(true);
    await expect(session.dispatch('scene_get_document')).resolves.toMatchObject(
      {
        dirty: true,
      },
    );

    await session.dispatch('scene_undo');
    expect(session.isDirty).toBe(false);
    await expect(session.dispatch('scene_get_document')).resolves.toMatchObject(
      {
        dirty: false,
      },
    );

    await session.dispatch('scene_redo');
    expect(session.isDirty).toBe(true);
    await session.dispatch('scene_save');
    expect(session.isDirty).toBe(false);

    await session.dispatch('scene_undo');
    expect(session.isDirty).toBe(true);
    await session.dispatch('scene_redo');
    expect(session.isDirty).toBe(false);
  });

  test('supports every named screenshot camera view and rejects unknown views', async () => {
    const screenshot = vi.fn().mockImplementation((camera, size) => ({
      camera,
      imageData: `${camera.view}:${size.width}x${size.height}`,
      mimeType: 'image/png',
    }));
    const session = new SceneEditorSession({
      document: DOCUMENT,
      screenshot,
    });

    for (const view of [
      'top',
      'front',
      'back',
      'left',
      'right',
      'quarter',
      'orbit',
    ]) {
      await expect(
        session.dispatch('scene_screenshot', {
          height: 240,
          view,
          width: 320,
        }),
      ).resolves.toMatchObject({
        camera: { view },
        imageData: `${view}:320x240`,
        mimeType: 'image/png',
      });
    }

    await session.dispatch('scene_set_camera', { view: 'right' });
    await expect(
      session.dispatch('scene_screenshot', {
        height: 180,
        view: 'current',
        width: 240,
      }),
    ).resolves.toMatchObject({
      camera: { position: [8, 2, 0], view: 'right' },
      imageData: 'right:240x180',
      mimeType: 'image/png',
    });

    await expect(
      session.dispatch('scene_screenshot', { view: 'diagonal' }),
    ).rejects.toThrow('view must be one of');
  });

  test('resolves exact saved perspective and orthographic authoring views', async () => {
    const screenshot = vi.fn().mockImplementation((camera, size) => ({
      camera,
      height: size.height,
      imageData: `${camera.projection}:${camera.viewId}`,
      mimeType: 'image/png',
      width: size.width,
    }));
    const session = new SceneEditorSession({ document: DOCUMENT, screenshot });
    await session.dispatch('scene_apply_transaction', {
      candidateDocumentHash: hashSceneDocument(
        applyPatches(session.document, [
          {
            op: 'addAuthoringView',
            view: {
              height: 7.25,
              id: 'ortho-plan',
              position: [2, 9, 3],
              projection: 'orthographic',
              role: 'diagnostic',
              target: [0.5, 0, -0.5],
            },
          },
          {
            op: 'addAuthoringView',
            view: {
              fov: 37,
              id: 'hero-perspective',
              position: [5, 4, 6],
              projection: 'perspective',
              role: 'hero',
              target: [0, 1, 0],
            },
          },
        ]),
      ),
      expectedBaseDocumentHash: hashSceneDocument(session.document),
      patches: [
        {
          op: 'addAuthoringView',
          view: {
            height: 7.25,
            id: 'ortho-plan',
            position: [2, 9, 3],
            projection: 'orthographic',
            role: 'diagnostic',
            target: [0.5, 0, -0.5],
          },
        },
        {
          op: 'addAuthoringView',
          view: {
            fov: 37,
            id: 'hero-perspective',
            position: [5, 4, 6],
            projection: 'perspective',
            role: 'hero',
            target: [0, 1, 0],
          },
        },
      ],
    });

    await expect(
      session.dispatch('scene_set_camera', { viewId: 'ortho-plan' }),
    ).resolves.toMatchObject({
      camera: {
        height: 7.25,
        lookAt: [0.5, 0, -0.5],
        position: [2, 9, 3],
        projection: 'orthographic',
        view: 'custom',
        viewId: 'ortho-plan',
      },
    });
    await expect(
      session.dispatch('scene_screenshot', {
        height: 480,
        viewId: 'ortho-plan',
        width: 640,
      }),
    ).resolves.toMatchObject({
      camera: {
        height: 7.25,
        projection: 'orthographic',
        viewId: 'ortho-plan',
      },
      height: 480,
      imageData: 'orthographic:ortho-plan',
      width: 640,
    });
    await expect(
      session.dispatch('scene_capture_review', {
        height: 360,
        viewId: 'hero-perspective',
        width: 512,
      }),
    ).resolves.toMatchObject({
      camera: {
        fov: 37,
        projection: 'perspective',
        viewId: 'hero-perspective',
      },
      height: 360,
      reviewCamera: {
        fov: 37,
        position: [5, 4, 6],
        projection: 'perspective',
        target: [0, 1, 0],
      },
      width: 512,
    });
    await expect(
      session.dispatch('scene_set_camera', { view: 'front' }),
    ).resolves.toMatchObject({
      camera: {
        projection: 'perspective',
        view: 'front',
      },
    });
    await expect(
      session.dispatch('scene_set_camera', { viewId: 'missing' }),
    ).rejects.toThrow('Saved authoring view "missing" does not exist');
  });

  test('supports deterministic orbit screenshot steps', async () => {
    const screenshot = vi.fn().mockImplementation((camera) => ({
      camera,
      imageData: `orbit:${camera.position.join(',')}`,
      mimeType: 'image/png',
    }));
    const session = new SceneEditorSession({
      document: DOCUMENT,
      screenshot,
    });

    await expect(
      session.dispatch('scene_screenshot', { orbitStep: 0, view: 'orbit' }),
    ).resolves.toMatchObject({
      camera: { position: [5.66, 3, 0], view: 'orbit' },
    });
    await expect(
      session.dispatch('scene_screenshot', { orbitStep: 2, view: 'orbit' }),
    ).resolves.toMatchObject({
      camera: { position: [0, 3, 5.66], view: 'orbit' },
    });
    await expect(
      session.dispatch('scene_screenshot', { step: -1, view: 'orbit' }),
    ).resolves.toMatchObject({
      camera: { position: [4.0022, 3, -4.0022], view: 'orbit' },
    });
  });

  test('compares two screenshots through the injected screenshot handler', async () => {
    const screenshot = vi.fn().mockImplementation((camera) => ({
      camera,
      imageData: `image:${camera.view}`,
      mimeType: 'image/png',
    }));
    const session = new SceneEditorSession({
      document: DOCUMENT,
      screenshot,
    });

    await expect(
      session.dispatch('scene_compare_screenshots', {
        first: { view: 'top' },
        height: 128,
        second: { view: 'front' },
        width: 128,
      }),
    ).resolves.toMatchObject({
      first: { camera: { view: 'top' }, imageData: 'image:top' },
      firstImageDataLength: 'image:top'.length,
      matches: false,
      second: { camera: { view: 'front' }, imageData: 'image:front' },
      secondImageDataLength: 'image:front'.length,
    });
    expect(screenshot).toHaveBeenCalledTimes(2);
    expect(screenshot).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ view: 'top' }),
      { captureMode: 'render', height: 128, width: 128 },
    );
    expect(screenshot).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ view: 'front' }),
      { captureMode: 'render', height: 128, width: 128 },
    );
  });

  test('captures hash-bound review metadata with raw renderer statistics', async () => {
    const setReviewLens = vi.fn();
    const capturedRenderStats: SceneEditorRenderStats = {
      available: true,
      calls: 12,
      environment: { renderer: 'WebGLRenderer', toneMapping: 'aces' },
      frameTimeSamplesMs: [10.5, 11.25],
      framingBounds: {
        max: [1, 0.5, 1],
        min: [-1, 0, -1],
        size: [2, 0.5, 2],
      },
      geometryCount: 3,
      lines: 4,
      materialCount: 2,
      meshCount: 3,
      nodeCount: 1,
      objectCount: 4,
      points: 3,
      programs: 6,
      shadowCasters: 2,
      textures: 5,
      triangles: 2400,
      visibleNodeIds: ['table-1'],
      worldBounds: {
        max: [1, 0.5, 1],
        min: [-1, 0, -1],
        size: [2, 0.5, 2],
      },
    };
    const renderStats = vi
      .fn()
      .mockReturnValue({ ...capturedRenderStats, calls: 99 });
    const screenshot = vi.fn().mockImplementation((camera) => ({
      camera,
      height: 480,
      imageData: 'review-png',
      mimeType: 'image/png',
      renderStats: capturedRenderStats,
      rendererEnvironment: { colorSpace: 'srgb' },
      screenshotSha256: `sha256:${'a'.repeat(64)}`,
      visibleNodeIds: ['table-1'],
      width: 640,
    }));
    const session = new SceneEditorSession({
      document: DOCUMENT,
      renderStats,
      screenshot,
      setReviewLens,
    });

    await expect(
      session.dispatch('scene_set_review_lens', { lens: 'geometry' }),
    ).resolves.toMatchObject({
      documentHash: hashSceneDocument(session.document),
      lens: 'geometry',
    });
    const capture = await session.dispatch('scene_capture_review', {
      featureState: { focalObject: 'pass' },
      height: 480,
      view: 'front',
      width: 640,
    });

    expect(setReviewLens).toHaveBeenCalledWith('geometry');
    expect(renderStats).not.toHaveBeenCalled();
    expect(capture).toMatchObject({
      camera: { view: 'front' },
      capabilityHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      captureToken: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      documentHash: hashSceneDocument(session.document),
      featureState: { focalObject: 'pass' },
      height: 480,
      lens: 'geometry',
      renderStats: {
        available: true,
        calls: 12,
        frameTimeSamplesMs: [10.5, 11.25],
        framingBounds: {
          max: [1, 0.5, 1],
          min: [-1, 0, -1],
          size: [2, 0.5, 2],
        },
        geometryCount: 3,
        nodeCount: 1,
        triangles: 2400,
        visibleNodeIds: ['table-1'],
      },
      rendererEnvironment: { colorSpace: 'srgb' },
      reviewCamera: {
        fov: 50,
        position: [0, 2, 8],
        projection: 'perspective',
        target: [0, 0, 0],
      },
      runtimeHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      screenshotHashAvailable: true,
      screenshotSha256: `sha256:${'a'.repeat(64)}`,
      visibilityAvailable: true,
      visibleNodeIds: ['table-1'],
      width: 640,
    });
    expect(capture).not.toHaveProperty('imageData');
    const captureToken = (capture as { captureToken: string }).captureToken;
    expect(session.getPendingReviewCapture(captureToken)).toMatchObject({
      captureToken,
      documentHash: hashSceneDocument(session.document),
      imageData: 'review-png',
    });
    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [1, 0, 0] },
    });
    expect(() => session.getPendingReviewCapture(captureToken)).toThrow(
      'unknown or was invalidated',
    );
  });

  test('keeps identical review capture tokens scoped to their editor session', async () => {
    const screenshot = vi.fn().mockImplementation((camera) => ({
      camera,
      height: 128,
      imageData: 'same-review-png',
      mimeType: 'image/png',
      screenshotSha256: `sha256:${'a'.repeat(64)}`,
      width: 128,
    }));
    const firstSession = new SceneEditorSession({
      document: DOCUMENT,
      screenshot,
    });
    const secondSession = new SceneEditorSession({
      document: DOCUMENT,
      screenshot,
    });

    const [firstCapture, secondCapture] = (await Promise.all([
      firstSession.dispatch('scene_capture_review', {
        height: 128,
        width: 128,
      }),
      secondSession.dispatch('scene_capture_review', {
        height: 128,
        width: 128,
      }),
    ])) as Array<{
      captureToken: string;
      renderStats: { available: boolean; reason?: string };
    }>;

    expect(firstCapture.captureToken).not.toBe(secondCapture.captureToken);
    expect(firstCapture.renderStats).toEqual({
      available: false,
      reason:
        'The editor runtime has not registered a renderer statistics bridge.',
    });
    expect(
      firstSession.getPendingReviewCapture(firstCapture.captureToken),
    ).toMatchObject({
      ...firstCapture,
      imageData: 'same-review-png',
    });
    expect(() =>
      firstSession.getPendingReviewCapture(secondCapture.captureToken),
    ).toThrow('captureToken is unknown');
  });

  test('uses the authoritative token returned by review capture registration', async () => {
    const serverToken = `sha256:${'b'.repeat(64)}` as const;
    const registerReviewCapture = vi.fn().mockResolvedValue({
      captureToken: serverToken,
    });
    const session = new SceneEditorSession({
      document: DOCUMENT,
      registerReviewCapture,
      screenshot: (camera) => ({
        camera,
        height: 128,
        imageData: 'registered-review-png',
        mimeType: 'image/png',
        screenshotSha256: `sha256:${'a'.repeat(64)}`,
        width: 128,
      }),
    });

    const capture = (await session.dispatch('scene_capture_review', {
      height: 128,
      includeImageData: true,
      width: 128,
    })) as { captureToken: string; imageData: string };

    expect(registerReviewCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        captureToken: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        imageData: 'registered-review-png',
      }),
    );
    expect(capture.captureToken).toBe(serverToken);
    expect(capture.imageData).toBe('registered-review-png');
    expect(session.getPendingReviewCapture(serverToken)).toMatchObject({
      captureToken: serverToken,
      imageData: 'registered-review-png',
    });
  });

  test('rejects a review capture when the scene changes during rendering', async () => {
    let finishScreenshot: (result: {
      camera: Record<string, unknown>;
      height: number;
      imageData: string;
      mimeType: 'image/png';
      screenshotSha256: `sha256:${string}`;
      width: number;
    }) => void = () => {
      throw new Error('Screenshot resolver was not initialized');
    };
    const screenshot = vi.fn().mockImplementation(
      (_camera) =>
        new Promise((resolve) => {
          finishScreenshot = resolve;
        }),
    );
    const session = new SceneEditorSession({ document: DOCUMENT, screenshot });
    const capturePromise = session.dispatch('scene_capture_review', {
      height: 128,
      width: 128,
    });
    await vi.waitFor(() => expect(screenshot).toHaveBeenCalledOnce());
    const rejection = expect(capturePromise).rejects.toThrow(
      'changed while review capture was in progress',
    );

    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [1, 0, 0] },
    });
    finishScreenshot({
      camera: screenshot.mock.calls[0][0],
      height: 128,
      imageData: 'stale-review-png',
      mimeType: 'image/png',
      screenshotSha256: `sha256:${'b'.repeat(64)}`,
      width: 128,
    });

    await rejection;
  });

  test('reports renderer metrics as unavailable when no bridge is installed', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });

    await expect(session.dispatch('scene_get_render_stats')).resolves.toEqual({
      available: false,
      reason:
        'The editor runtime has not registered a renderer statistics bridge.',
    });
  });

  test('requires current renderer metrics to include framing bounds', async () => {
    const session = new SceneEditorSession({
      document: DOCUMENT,
      renderStats: () =>
        ({
          available: true,
          calls: 0,
          environment: {},
          frameTimeSamplesMs: [],
          geometryCount: 0,
          lines: 0,
          materialCount: 0,
          meshCount: 0,
          nodeCount: 0,
          objectCount: 0,
          points: 0,
          programs: 0,
          shadowCasters: 0,
          textures: 0,
          triangles: 0,
          visibleNodeIds: [],
          worldBounds: null,
        }) as SceneEditorRenderStats,
    });

    await expect(session.dispatch('scene_get_render_stats')).rejects.toThrow(
      'Renderer statistic framingBounds must be an object or null',
    );
  });

  test('allows arbitrary transforms while rejecting unknown assets', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'sunken-vase',
            transform: { position: [0, -0.2, 0] },
          },
        ],
      },
      listAssets,
      resolveAssetBounds,
    });

    expect(await session.dispatch('scene_validate')).toMatchObject({
      issues: [],
      valid: true,
    });

    await expect(
      session.dispatch('scene_add_node', {
        node: { content: { asset: 'missing', type: 'asset' }, id: 'bad' },
      }),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          message: 'unknown manifest asset "missing"',
          nodeId: 'bad',
        }),
      ]),
      valid: false,
    });
  });

  test('keeps composition review policy outside editor save validation', async () => {
    const prompt = 'A table';
    const saveDocument = vi.fn().mockResolvedValue({ path: 'scene.json' });
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        authoring: {
          composition: {
            feasibility: {
              reasons: ['Requires an authoring decision'],
              status: 'blocked',
            },
            features: [],
            input: { kind: 'text', prompt },
            mode: 'static',
            provenance: {
              adapter: { id: 'test', version: '1' },
              capabilityHash: `sha256:${'a'.repeat(64)}`,
              inputHashes: [sha256(prompt)],
              skill: { id: 'iwsdk-scene-composer', version: '1' },
            },
            representationPolicy: {
              allowed: ['asset'],
              fidelityCeiling: 'test',
            },
            review: {
              heroView: 'missing',
              lenses: ['final'],
              maxCorrectionRounds: 1,
              requiredViews: ['missing'],
            },
            target: {
              assetPolicy: 'manifest-assets',
              surfaces: ['browser'],
            },
          },
        },
      },
      listAssets,
      saveDocument,
    });

    await expect(session.dispatch('scene_validate')).resolves.toMatchObject({
      issues: [],
      valid: true,
    });
    await session.dispatch('scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [0, 4, 0] },
    });
    await expect(session.dispatch('scene_save')).resolves.toMatchObject({
      dirty: false,
      path: 'scene.json',
    });
    expect(saveDocument).toHaveBeenCalledOnce();
  });

  test('does not require manifest bounds for document integrity', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            content: { asset: 'environment-desk', type: 'asset' },
            components: { LocomotionEnvironment: {} },
            id: 'environment',
            transform: { position: [0, -0.106921583, 0] },
          },
          {
            content: { asset: 'robot', type: 'asset' },
            id: 'robot-distance-grab',
            transform: { position: [0, 0.95, -2], scale: 0.5 },
          },
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'plant-on-environment',
            transform: { position: [0.65, 0.95, -1.65], scale: 1.25 },
          },
        ],
      },
      knownComponents: ['LocomotionEnvironment'],
    });

    const validation = await session.dispatch('scene_validate');
    expect(validation).toMatchObject({ valid: true });
  });

  test('accepts deprecated Interactable component aliases as RayInteractable', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            content: { asset: 'table', type: 'asset' },
            components: {
              Interactable: {},
              'com.iwsdk.components.Interactable': {},
            },
            id: 'legacy-interactable-table',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
      listAssets,
      knownComponents: ['RayInteractable'],
      resolveAssetBounds,
    });

    await expect(session.dispatch('scene_validate')).resolves.toMatchObject({
      issues: [],
      valid: true,
    });
  });

  test('rejects invalid tool requests, malformed patches, duplicate ids, and missing save handlers', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });

    await expect(
      session.dispatch('scene_select', { nodeIds: ['missing-node'] }),
    ).rejects.toThrow('Unknown scene node "missing-node"');
    await expect(
      session.dispatch('scene_apply_patch', {
        patch: { nodeId: '', op: 'removeNode' },
      }),
    ).rejects.toThrow('nodeId must be a non-empty string');
    await expect(
      session.dispatch('scene_add_node', {
        node: { content: { asset: 'vase', type: 'asset' }, id: 'table-1' },
      }),
    ).rejects.toThrow('Cannot add duplicate node "table-1"');
    await expect(session.dispatch('scene_save')).rejects.toThrow(
      'Scene editor was not configured with a save handler',
    );
  });

  test('applies undoable node metadata patches through scene_apply_patch', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });

    await expect(
      session.dispatch('scene_apply_patch', {
        patch: {
          nodeId: 'table-1',
          op: 'setNodeMetadata',
          value: {
            'iwsdk.note': 'intentional support object',
            'iwsdk.validation': { allowFloating: true },
          },
        },
      }),
    ).resolves.toMatchObject({
      action: 'patchApplied',
      dirty: true,
      valid: true,
    });
    await expect(session.dispatch('scene_get_document')).resolves.toMatchObject(
      {
        document: {
          nodes: [
            expect.objectContaining({
              id: 'table-1',
              metadata: {
                'iwsdk.note': 'intentional support object',
                'iwsdk.validation': { allowFloating: true },
              },
            }),
          ],
        },
      },
    );

    await session.dispatch('scene_undo');
    await expect(session.dispatch('scene_get_document')).resolves.toMatchObject(
      {
        document: {
          nodes: [expect.not.objectContaining({ metadata: expect.anything() })],
        },
      },
    );

    await session.dispatch('scene_redo');
    await expect(session.dispatch('scene_get_document')).resolves.toMatchObject(
      {
        document: {
          nodes: [
            expect.objectContaining({
              metadata: {
                'iwsdk.note': 'intentional support object',
                'iwsdk.validation': { allowFloating: true },
              },
            }),
          ],
        },
      },
    );
    await expect(
      session.dispatch('scene_apply_patch', {
        patch: {
          nodeId: 'table-1',
          op: 'setNodeMetadata',
          value: [],
        },
      }),
    ).rejects.toThrow('value must be a JSON object');
  });

  test('sets content and support framing roles without replacing the node', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });
    const original = session.document.nodes[0];

    await expect(
      session.dispatch('scene_set_framing_role', {
        framingRole: 'support',
        nodeId: 'table-1',
      }),
    ).resolves.toMatchObject({
      action: 'framingRoleUpdated',
      dirty: true,
      framingRole: 'support',
      nodeId: 'table-1',
      valid: true,
    });
    expect(session.document.nodes[0]).toEqual({
      ...original,
      framingRole: 'support',
    });

    await session.dispatch('scene_undo');
    expect(session.document.nodes[0]).toEqual(original);
    expect(session.document.nodes[0]).not.toHaveProperty('framingRole');

    await session.dispatch('scene_redo');
    expect(session.document.nodes[0].framingRole).toBe('support');
    await session.dispatch('scene_set_framing_role', {
      framingRole: 'content',
      nodeId: 'table-1',
    });
    expect(session.document.nodes[0].framingRole).toBe('content');

    await expect(
      session.dispatch('scene_set_framing_role', {
        framingRole: 'background',
        nodeId: 'table-1',
      }),
    ).rejects.toThrow('framingRole must be "content" or "support"');
  });

  test('carries framing-role corrections through hash-checked transactions', async () => {
    const authorizeDocumentTransition = vi.fn();
    const session = new SceneEditorSession({
      authorizeDocumentTransition,
      document: DOCUMENT,
    });
    const base = session.document;
    const patches: Parameters<typeof applyScenePatch>[1][] = [
      {
        framingRole: 'support',
        nodeId: 'table-1',
        op: 'updateFramingRole',
      },
    ];
    const candidate = applyPatches(base, patches);
    const correction = {
      defectTags: ['camera-framing'],
      kind: 'scene',
      previousReview: {
        path: 'reviews/round-0001.iwsdk.scene-review.json',
        reviewSha256: `sha256:${'a'.repeat(64)}`,
      },
    };

    await expect(
      session.dispatch('scene_apply_transaction', {
        candidateDocumentHash: hashSceneDocument(candidate),
        correction,
        expectedBaseDocumentHash: hashSceneDocument(base),
        patches,
      }),
    ).resolves.toMatchObject({
      action: 'transactionApplied',
      candidateDocumentHash: hashSceneDocument(candidate),
      patchCount: 1,
    });
    expect(authorizeDocumentTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate,
        correction,
        expectedBaseDocumentHash: hashSceneDocument(base),
        operation: 'transaction',
        patch: { op: 'transaction', patches },
      }),
    );
    expect(session.document.nodes[0].framingRole).toBe('support');

    await expect(
      session.dispatch('scene_apply_transaction', {
        candidateDocumentHash: hashSceneDocument(candidate),
        correction,
        expectedBaseDocumentHash: hashSceneDocument(base),
        patches,
      }),
    ).rejects.toThrow('Scene document changed');
    expect(session.document).toEqual(candidate);

    await session.dispatch('scene_undo');
    expect(session.document).toEqual(base);
    await session.dispatch('scene_redo');
    expect(session.document).toEqual(candidate);
  });

  test('moves nodes between hierarchy parents and reorders siblings through patch tools', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          DOCUMENT.nodes[0],
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'vase-1',
            transform: { position: [0.25, 0, 0] },
          },
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'vase-2',
            transform: { position: [0.5, 0, 0] },
          },
        ],
      },
    });

    await session.dispatch('scene_select', { nodeIds: ['vase-1'] });
    const moved = await session.dispatch('scene_apply_patch', {
      patch: {
        nodeId: 'vase-1',
        op: 'moveNode',
        parentId: 'table-1',
      },
    });

    expect(moved).toMatchObject({
      action: 'patchApplied',
      selection: ['vase-1'],
      valid: true,
    });
    expect(session.document.nodes.map((node) => node.id)).toEqual([
      'table-1',
      'vase-2',
    ]);
    expect(session.document.nodes[0]?.children?.map((node) => node.id)).toEqual(
      ['vase-1'],
    );
    await expect(
      session.dispatch('scene_apply_patch', {
        patch: {
          nodeId: 'table-1',
          op: 'moveNode',
          parentId: 'vase-1',
        },
      }),
    ).rejects.toThrow(
      'Cannot move node "table-1" under its descendant "vase-1"',
    );

    await session.dispatch('scene_apply_patch', {
      patch: {
        childIds: ['vase-2', 'table-1'],
        op: 'reorderChildren',
        parentId: null,
      },
    });
    expect(session.document.nodes.map((node) => node.id)).toEqual([
      'vase-2',
      'table-1',
    ]);

    await session.dispatch('scene_apply_patch', {
      patch: {
        index: 1,
        nodeId: 'vase-1',
        op: 'moveNode',
        parentId: null,
      },
    });
    expect(session.document.nodes.map((node) => node.id)).toEqual([
      'vase-2',
      'vase-1',
      'table-1',
    ]);

    const preserveWorldSession = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            ...DOCUMENT.nodes[0],
            transform: { position: [0, 0, 0], scale: [2, 1, 2] },
          },
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'world-stable-vase',
            transform: { position: [2, 0, 2], scale: 2 },
          },
        ],
      },
    });
    await preserveWorldSession.dispatch('scene_apply_patch', {
      patch: {
        nodeId: 'world-stable-vase',
        op: 'moveNode',
        parentId: 'table-1',
        preserveWorldTransform: true,
      },
    });
    expect(
      preserveWorldSession.document.nodes[0]?.children?.[0]?.transform,
    ).toEqual({
      position: [1, 0, 1],
      scale: [1, 2, 1],
    });
    await preserveWorldSession.dispatch('scene_undo');
    expect(preserveWorldSession.document.nodes[1]?.transform).toEqual({
      position: [2, 0, 2],
      scale: 2,
    });

    expect(session.document.nodes[2]?.children ?? []).toEqual([]);

    await session.dispatch('scene_undo');
    expect(session.document.nodes[1]?.children?.map((node) => node.id)).toEqual(
      ['vase-1'],
    );
    await session.dispatch('scene_redo');
    expect(session.document.nodes.map((node) => node.id)).toEqual([
      'vase-2',
      'vase-1',
      'table-1',
    ]);
  });

  test('renames selected nodes through patch tools without stale selection', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          DOCUMENT.nodes[0],
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'vase-1',
            transform: { position: [0.25, 0, 0] },
          },
        ],
      },
    });

    await session.dispatch('scene_select', { nodeIds: ['vase-1'] });
    const renamed = await session.dispatch('scene_apply_patch', {
      patch: {
        newNodeId: 'vase-renamed',
        nodeId: 'vase-1',
        op: 'renameNode',
      },
    });

    expect(renamed).toMatchObject({
      action: 'patchApplied',
      selection: ['vase-renamed'],
      valid: true,
    });
    expect(session.document.nodes.map((node) => node.id)).toEqual([
      'table-1',
      'vase-renamed',
    ]);
    await expect(
      session.dispatch('scene_apply_patch', {
        patch: {
          newNodeId: 'table-1',
          nodeId: 'vase-renamed',
          op: 'renameNode',
        },
      }),
    ).rejects.toThrow(
      'Cannot rename node "vase-renamed" to duplicate id "table-1"',
    );

    await session.dispatch('scene_undo');
    expect(await session.dispatch('scene_get_selection')).toEqual({
      nodeIds: [],
    });
    expect(session.document.nodes.map((node) => node.id)).toEqual([
      'table-1',
      'vase-1',
    ]);
  });

  test('duplicates and removes node subtrees while keeping selection valid', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            content: { asset: 'table', type: 'asset' },
            children: [
              {
                content: { asset: 'vase', type: 'asset' },
                id: 'vase-child',
                transform: { position: [0, 0.5, 0] },
              },
            ],
            id: 'table-parent',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
    });

    await expect(
      session.dispatch('scene_duplicate_node', {
        newNodeId: 'table-copy',
        nodeId: 'table-parent',
      }),
    ).resolves.toMatchObject({
      action: 'nodeDuplicated',
      newNodeId: 'table-copy',
      selection: ['table-copy'],
    });
    expect(await session.dispatch('scene_get_hierarchy')).toMatchObject({
      hierarchy: [
        { id: 'table-parent' },
        {
          children: [{ id: 'table-copy-vase-child' }],
          id: 'table-copy',
        },
      ],
    });

    await session.dispatch('scene_select', { nodeIds: ['vase-child'] });
    await expect(
      session.dispatch('scene_remove_node', { nodeId: 'table-parent' }),
    ).resolves.toMatchObject({
      action: 'nodeRemoved',
      selection: [],
    });
    await expect(session.dispatch('scene_get_selection')).resolves.toEqual({
      nodeIds: [],
    });
    await expect(
      session.dispatch('scene_get_hierarchy'),
    ).resolves.toMatchObject({
      hierarchy: [
        {
          children: [{ id: 'table-copy-vase-child' }],
          id: 'table-copy',
        },
      ],
    });
  });

  test('rejects invalid documents before opening an editor session', () => {
    expect(
      () =>
        new SceneEditorSession({
          document: {
            ...DOCUMENT,
            nodes: [
              { asset: 'missing', id: 'duplicate' },
              {
                content: { asset: 'vase', type: 'asset' },
                id: 'duplicate',
                transform: { position: [0, Number.NaN, 0] },
              },
            ],
          },
        }),
    ).toThrow('Invalid IWSDK scene document');
  });

  test('filters logs and rejects malformed screenshot comparison requests', async () => {
    const screenshot = vi.fn().mockImplementation((camera) => ({
      camera,
      imageData: `image:${camera.view}`,
      mimeType: 'image/png',
    }));
    const session = new SceneEditorSession({ document: DOCUMENT, screenshot });

    await session.dispatch('scene_select', { nodeIds: ['table-1'] });
    await expect(
      session.dispatch('scene_get_logs', { count: 1, level: 'info' }),
    ).resolves.toMatchObject({
      logs: [
        expect.objectContaining({
          level: 'info',
          message: 'Selected 1 node(s)',
        }),
      ],
    });
    await expect(
      session.dispatch('scene_get_logs', { level: 'debug' }),
    ).rejects.toThrow('level must be one of info, warn, error');
    await expect(
      session.dispatch('scene_compare_screenshots', {
        first: { view: 'top' },
      }),
    ).rejects.toThrow('second must be an object');
  });

  test('accepts elevated objects without physical placement metadata', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          DOCUMENT.nodes[0],
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'floating-vase',
            transform: { position: [3, 1.2, 0] },
          },
        ],
      },
      listAssets,
      resolveAssetBounds,
    });

    expect(await session.dispatch('scene_validate')).toMatchObject({
      issues: [],
      valid: true,
    });
  });

  test('validates scene component names with app-specific extension points', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            content: { asset: 'table', type: 'asset' },
            components: {
              'com.iwsdk.components.PanelUI': { config: 'panel.uikitml' },
              MissingComponent: {},
            },
            id: 'component-node',
            transform: { position: [0, 0, 0] },
          },
          {
            content: { asset: 'vase', type: 'asset' },
            components: {
              CustomInspectable: {},
            },
            id: 'custom-node',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
      knownComponents: ['CustomInspectable', 'PanelUI'],
    });

    expect(await session.dispatch('scene_validate')).toMatchObject({
      valid: false,
      issues: [
        {
          message: expect.stringContaining('MissingComponent'),
          nodeId: 'component-node',
          path: '$.nodes[0].components["MissingComponent"]',
          suggestedFix: expect.stringContaining('Register "MissingComponent"'),
        },
      ],
    });
    expect(
      JSON.stringify(await session.dispatch('scene_validate')),
    ).not.toContain('CustomInspectable');
  });

  test('validates raw component properties against the manifest catalog before save', async () => {
    const saveDocument = vi.fn();
    const session = new SceneEditorSession({
      componentCatalog: createSceneComponentCatalog([
        {
          fields: {
            anchor: {
              enum: { Center: 'center', Edge: 'edge' },
              type: 'Enum',
            },
            config: { type: 'String' },
            maxWidth: { max: 2, min: 0, type: 'Float32' },
            offset: { type: 'Vec3' },
          },
          id: 'PanelUI',
          source: 'iwsdk',
        },
      ]),
      document: {
        ...DOCUMENT,
        nodes: [
          {
            content: { asset: 'table', type: 'asset' },
            components: {
              'com.iwsdk.components.PanelUI': {
                anchor: 'invalid',
                config: 7,
                maxWidth: 4,
                offset: [1, 2],
              },
            },
            id: 'panel-node',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
      saveDocument,
    });

    await expect(session.dispatch('scene_validate')).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          message: 'value does not match Enum',
          nodeId: 'panel-node',
          path: '$.nodes[0].components["com.iwsdk.components.PanelUI"].anchor',
        }),
        expect.objectContaining({
          message: 'value does not match String',
          nodeId: 'panel-node',
          path: '$.nodes[0].components["com.iwsdk.components.PanelUI"].config',
        }),
        expect.objectContaining({
          message: 'value does not match Float32',
          nodeId: 'panel-node',
          path: '$.nodes[0].components["com.iwsdk.components.PanelUI"].maxWidth',
        }),
        expect.objectContaining({
          message: 'value does not match Vec3',
          nodeId: 'panel-node',
          path: '$.nodes[0].components["com.iwsdk.components.PanelUI"].offset',
        }),
      ]),
    });
    await expect(session.dispatch('scene_save')).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('value does not match'),
          nodeId: 'panel-node',
        }),
      ]),
    });
    expect(saveDocument).not.toHaveBeenCalled();
  });

  test('blocks save when editor validation fails and preserves registered custom component saves', async () => {
    const invalidSaveDocument = vi.fn();
    const invalidSession = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            content: { asset: 'table', type: 'asset' },
            components: {
              MissingComponent: {},
            },
            id: 'component-node',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
      saveDocument: invalidSaveDocument,
    });

    await expect(invalidSession.dispatch('scene_save')).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          message: expect.stringContaining('MissingComponent'),
          nodeId: 'component-node',
        }),
      ],
    });
    expect(invalidSaveDocument).not.toHaveBeenCalled();

    const validSaveDocument = vi.fn().mockResolvedValue({
      bytes: 120,
      path: 'public/scenes/main.iwsdk.scene.json',
    });
    const validSession = new SceneEditorSession({
      componentCatalog: createSceneComponentCatalog([
        {
          fields: { label: { type: 'String' } },
          id: 'CustomInspectable',
          source: 'app',
        },
      ]),
      document: {
        ...DOCUMENT,
        nodes: [
          {
            content: { asset: 'table', type: 'asset' },
            components: {
              CustomInspectable: { label: 'runtime-owned' },
            },
            id: 'custom-node',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
      saveDocument: validSaveDocument,
    });

    await expect(validSession.dispatch('scene_save')).resolves.toMatchObject({
      dirty: false,
      path: 'public/scenes/main.iwsdk.scene.json',
    });
    expect(validSaveDocument).toHaveBeenCalledTimes(1);
  });
});
