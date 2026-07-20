/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCENE_VERSION,
  SCENE_DOCUMENT_JSON_SCHEMA,
  SCENE_DOCUMENT_SCHEMA_ID,
  SceneCommandHistory,
  applyScenePatch,
  migrateSceneDocument,
  parseSceneDocument,
  resolveAlignTransforms,
  resolveLookAtTransform,
  resolveLookAtTransformInDocument,
  resolveLookAtYawDeg,
  resolvePlaceOnTransform,
  resolveSnapTransform,
  serializeSceneDocument,
  snapPositionToGrid,
  validateSceneDocument,
  type SceneDocument,
} from '../src/index.js';

function makeScene(): SceneDocument {
  return {
    assets: [
      {
        bounds: {
          max: [1, 1, 1],
          min: [-1, 0, -1],
        },
        id: 'table',
        type: 'gltf',
        uri: '/iwsdk-assets/table/table.gltf',
      },
      {
        bounds: {
          max: [0.25, 0.5, 0.25],
          min: [-0.25, 0, -0.25],
        },
        id: 'lamp',
        type: 'gltf',
        uri: '/iwsdk-assets/lamp/lamp.gltf',
      },
    ],
    nodes: [
      {
        asset: 'table',
        children: [
          {
            components: {
              'example.ChildMarker': {
                enabled: true,
              },
            },
            id: 'nested-child',
            transform: {
              position: [0, 0.1, 0],
            },
          },
        ],
        components: {
          'com.iwsdk.components.Interactable': {
            enabled: true,
          },
        },
        id: 'table-node',
        transform: {
          position: [2, 0, -1],
        },
      },
    ],
    units: 'meters',
    version: CURRENT_SCENE_VERSION,
  };
}

describe('@iwsdk/scene-composition', () => {
  it('validates native scene documents and reports actionable issues', () => {
    const valid = validateSceneDocument(makeScene());
    expect(valid.valid).toBe(true);
    expect(valid.issues).toEqual([]);

    const invalid = validateSceneDocument({
      ...makeScene(),
      nodes: [
        { asset: 'missing', id: 'duplicate' },
        { id: 'duplicate', transform: { position: [0, Number.NaN, 0] } },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.issues.map((issue) => issue.path)).toContain(
      '$.nodes[0].asset',
    );
    expect(invalid.issues.map((issue) => issue.message)).toContain(
      'duplicate node id "duplicate"',
    );

    const missingReference = validateSceneDocument({
      ...makeScene(),
      nodes: [
        {
          id: 'floating-lamp',
          transform: { placeOn: 'missing-table' },
        },
      ],
    });

    expect(missingReference.valid).toBe(false);
    expect(missingReference.issues).toContainEqual({
      message: 'unknown placeOn target "missing-table"',
      path: '$.nodes[0].transform.placeOn',
    });
  });

  it('validates typed component schemas and payloads', () => {
    const typedScene: SceneDocument = {
      ...makeScene(),
      componentSchemas: [
        {
          fields: {
            config: { default: '', type: 'String' },
            maxHeight: { default: 1, type: 'Float32' },
            maxWidth: { default: 1, type: 'Float32' },
          },
          id: 'PanelUI',
          source: 'iwsdk',
        },
      ],
      nodes: [
        {
          components: {
            'com.iwsdk.components.PanelUI': {
              props: {
                config: '/ui/panel.json',
                maxHeight: 1,
                maxWidth: 2,
              },
              type: 'PanelUI',
            },
          },
          id: 'panel-node',
        },
      ],
    };

    expect(validateSceneDocument(typedScene)).toEqual({
      issues: [],
      valid: true,
    });

    const invalid = validateSceneDocument({
      ...typedScene,
      componentSchemas: [
        typedScene.componentSchemas![0],
        typedScene.componentSchemas![0],
        {
          fields: {
            bad: { default: () => null, type: 'Function' },
          },
          id: 'BadComponent',
          source: 'external',
        },
      ],
      nodes: [
        {
          components: {
            'com.iwsdk.components.PanelUI': {
              props: [],
              type: 'WrongType',
            },
          },
          id: 'bad-panel-node',
        },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'duplicate component schema id "PanelUI"',
        'component field type is not supported',
        'component field default must be JSON serializable',
        'component schema source must be "iwsdk", "app", or "scene"',
        'typed component "com.iwsdk.components.PanelUI" type must match its component key',
        'typed component "com.iwsdk.components.PanelUI" props must be a JSON object',
      ]),
    );
  });

  it('parses, validates, and serializes scenes with stable formatting', () => {
    const scene = makeScene();
    const serialized = serializeSceneDocument(scene);
    const parsed = parseSceneDocument(serialized);

    expect(parsed).toEqual(scene);
    expect(serializeSceneDocument(parsed)).toBe(serialized);
    expect(serialized.endsWith('\n')).toBe(true);
  });

  it('exports a JSON Schema for editor and agent tooling', () => {
    expect(SCENE_DOCUMENT_JSON_SCHEMA.$id).toBe(SCENE_DOCUMENT_SCHEMA_ID);
    expect(SCENE_DOCUMENT_JSON_SCHEMA.properties.version).toEqual({
      const: CURRENT_SCENE_VERSION,
      description: 'Scene document schema version.',
    });
    expect(SCENE_DOCUMENT_JSON_SCHEMA.required).toEqual([
      'version',
      'units',
      'nodes',
    ]);
    expect(SCENE_DOCUMENT_JSON_SCHEMA.$defs.node.properties.children).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/node' },
    });
    expect(
      JSON.parse(JSON.stringify(SCENE_DOCUMENT_JSON_SCHEMA)),
    ).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        asset: { required: ['id', 'uri'] },
        transform: {
          properties: {
            lookAt: { $ref: '#/$defs/vec3' },
            placeOn: {
              oneOf: [
                { type: 'string', minLength: 1 },
                { $ref: '#/$defs/placeOn' },
              ],
            },
          },
        },
      },
    });
  });

  it('applies reversible scene patches and maintains command history', () => {
    const scene = makeScene();
    const added = applyScenePatch(scene, {
      node: {
        asset: 'lamp',
        id: 'lamp-node',
      },
      op: 'addNode',
      parentId: 'table-node',
    });

    expect(added.document.nodes[0].children?.map((node) => node.id)).toEqual([
      'nested-child',
      'lamp-node',
    ]);

    const transformed = applyScenePatch(added.document, {
      nodeId: 'lamp-node',
      op: 'updateTransform',
      transform: {
        position: [2, 1, -1],
        rotationDeg: [0, 90, 0],
      },
    });

    expect(
      transformed.document.nodes[0].children?.find(
        (node) => node.id === 'lamp-node',
      )?.transform,
    ).toEqual({
      position: [2, 1, -1],
      rotationDeg: [0, 90, 0],
    });

    const removed = applyScenePatch(transformed.document, transformed.inverse);
    expect(
      removed.document.nodes[0].children?.find(
        (node) => node.id === 'lamp-node',
      )?.transform,
    ).toBeUndefined();

    const history = new SceneCommandHistory(scene);
    history.apply({
      nodeId: 'table-node',
      op: 'updateComponent',
      component: 'com.iwsdk.components.Interactable',
      value: {
        enabled: false,
      },
    });

    expect(
      history.document.nodes[0].components?.[
        'com.iwsdk.components.Interactable'
      ],
    ).toEqual({ enabled: false });
    history.undo();
    expect(
      history.document.nodes[0].components?.[
        'com.iwsdk.components.Interactable'
      ],
    ).toEqual({ enabled: true });
    history.redo();
    expect(
      history.document.nodes[0].components?.[
        'com.iwsdk.components.Interactable'
      ],
    ).toEqual({ enabled: false });
  });

  it('moves nodes between parents reversibly and rejects hierarchy cycles', () => {
    const scene = applyScenePatch(makeScene(), {
      node: {
        asset: 'lamp',
        id: 'lamp-node',
      },
      op: 'addNode',
    }).document;

    const movedUnderTable = applyScenePatch(scene, {
      nodeId: 'lamp-node',
      op: 'moveNode',
      parentId: 'table-node',
    });
    expect(movedUnderTable.document.nodes.map((node) => node.id)).toEqual([
      'table-node',
    ]);
    expect(
      movedUnderTable.document.nodes[0].children?.map((node) => node.id),
    ).toEqual(['nested-child', 'lamp-node']);

    const scaledScene = applyScenePatch(
      applyScenePatch(makeScene(), {
        nodeId: 'table-node',
        op: 'updateTransform',
        transform: {
          position: [2, 0, -1],
          scale: [2, 1, 2],
        },
      }).document,
      {
        node: {
          asset: 'lamp',
          id: 'world-stable-lamp',
          transform: {
            position: [4, 0, 1],
            scale: 2,
          },
        },
        op: 'addNode',
      },
    ).document;
    const preserveWorldMove = applyScenePatch(scaledScene, {
      nodeId: 'world-stable-lamp',
      op: 'moveNode',
      parentId: 'table-node',
      preserveWorldTransform: true,
    });
    const worldStableLamp = preserveWorldMove.document.nodes[0].children?.find(
      (node) => node.id === 'world-stable-lamp',
    );
    expect(worldStableLamp?.transform).toEqual({
      position: [1, 0, 1],
      scale: [1, 2, 1],
    });
    expect(preserveWorldMove.inverse).toMatchObject({
      nodeId: 'world-stable-lamp',
      op: 'moveNode',
      parentId: null,
      preserveWorldTransform: true,
    });
    const preserveWorldRestored = applyScenePatch(
      preserveWorldMove.document,
      preserveWorldMove.inverse,
    );
    expect(preserveWorldRestored.document.nodes[1].transform).toEqual({
      position: [4, 0, 1],
      scale: 2,
    });

    const restored = applyScenePatch(
      movedUnderTable.document,
      movedUnderTable.inverse,
    );
    expect(restored.document.nodes.map((node) => node.id)).toEqual([
      'table-node',
      'lamp-node',
    ]);
    expect(restored.document.nodes[0].children?.map((node) => node.id)).toEqual(
      ['nested-child'],
    );

    const unparented = applyScenePatch(movedUnderTable.document, {
      index: 0,
      nodeId: 'nested-child',
      op: 'moveNode',
      parentId: null,
    });
    expect(unparented.document.nodes.map((node) => node.id)).toEqual([
      'nested-child',
      'table-node',
    ]);
    expect(
      unparented.document.nodes[1].children?.map((node) => node.id),
    ).toEqual(['lamp-node']);

    expect(() =>
      applyScenePatch(movedUnderTable.document, {
        nodeId: 'table-node',
        op: 'moveNode',
        parentId: 'nested-child',
      }),
    ).toThrow(
      'Cannot move node "table-node" under its descendant "nested-child"',
    );
  });

  it('preserves world transforms through rotated parents without materializing identity transforms', () => {
    const scene = applyScenePatch(
      applyScenePatch(makeScene(), {
        nodeId: 'table-node',
        op: 'updateTransform',
        transform: {
          position: [2, 0, -1],
          rotationDeg: [0, 90, 0],
          scale: [1, 2, 1],
        },
      }).document,
      {
        node: {
          asset: 'lamp',
          id: 'world-stable-rotated-lamp',
          transform: {
            position: [4, 0, 1],
            rotationDeg: [0, 45, 0],
            scale: 2,
          },
        },
        op: 'addNode',
      },
    ).document;

    const moved = applyScenePatch(scene, {
      nodeId: 'world-stable-rotated-lamp',
      op: 'moveNode',
      parentId: 'table-node',
      preserveWorldTransform: true,
    });
    const movedLamp = moved.document.nodes[0].children?.find(
      (node) => node.id === 'world-stable-rotated-lamp',
    );
    expect(movedLamp?.transform).toEqual({
      position: [-2, 0, 2],
      rotationDeg: [0, -45, 0],
      scale: [2, 1, 2],
    });

    const restored = applyScenePatch(moved.document, moved.inverse);
    expect(restored.document.nodes[1].transform).toEqual({
      position: [4, 0, 1],
      rotationDeg: [0, 45, 0],
      scale: 2,
    });

    const identityMoveScene: SceneDocument = {
      nodes: [{ id: 'parent' }, { id: 'bare-child' }],
      units: 'meters',
      version: CURRENT_SCENE_VERSION,
    };
    const identityMove = applyScenePatch(identityMoveScene, {
      nodeId: 'bare-child',
      op: 'moveNode',
      parentId: 'parent',
      preserveWorldTransform: true,
    });
    expect(
      identityMove.document.nodes[0].children?.[0].transform,
    ).toBeUndefined();
    const identityRestored = applyScenePatch(
      identityMove.document,
      identityMove.inverse,
    );
    expect(identityRestored.document.nodes[1].transform).toBeUndefined();
  });

  it('renames nodes reversibly and rejects duplicate ids', () => {
    const renamed = applyScenePatch(makeScene(), {
      newNodeId: 'table-renamed',
      nodeId: 'table-node',
      op: 'renameNode',
    });

    expect(renamed.document.nodes[0].id).toBe('table-renamed');
    expect(renamed.inverse).toEqual({
      newNodeId: 'table-node',
      nodeId: 'table-renamed',
      op: 'renameNode',
    });

    const restored = applyScenePatch(renamed.document, renamed.inverse);
    expect(restored.document.nodes[0].id).toBe('table-node');

    expect(() =>
      applyScenePatch(makeScene(), {
        newNodeId: 'nested-child',
        nodeId: 'table-node',
        op: 'renameNode',
      }),
    ).toThrow('Cannot rename node "table-node" to duplicate id "nested-child"');
  });

  it('keeps command history strict by default but can wrap invalid loaded documents for validation tools', () => {
    const invalid = {
      ...makeScene(),
      nodes: [
        {
          asset: 'missing',
          id: 'bad-node',
        },
      ],
    } as unknown as SceneDocument;

    expect(() => new SceneCommandHistory(invalid)).toThrow(
      'Invalid IWSDK scene document',
    );

    const history = new SceneCommandHistory(invalid, {
      validateInitialDocument: false,
    });
    expect(history.document.nodes[0]).toMatchObject({
      asset: 'missing',
      id: 'bad-node',
    });
  });

  it('rejects malformed scene patches before mutating documents', () => {
    const scene = makeScene();

    expect(() =>
      applyScenePatch(scene, {
        op: 'moveNode',
        nodeId: '',
      } as any),
    ).toThrow('nodeId must be a non-empty string');

    expect(() =>
      applyScenePatch(scene, {
        node: {
          asset: 'lamp',
          id: 'bad-index',
        },
        op: 'addNode',
        index: -1,
      }),
    ).toThrow('index must be a non-negative integer');

    expect(() =>
      applyScenePatch(scene, {
        component: 'example.BadPayload',
        nodeId: 'table-node',
        op: 'updateComponent',
        value: Number.NaN,
      } as any),
    ).toThrow('value must be JSON serializable');

    expect(scene).toEqual(makeScene());
  });

  it('undoes editor metadata patches by deleting previously absent editor blocks', () => {
    const scene = makeScene();
    const updatedDocumentMetadata = applyScenePatch(scene, {
      op: 'setEditorMetadata',
      value: { expanded: true },
    });
    expect(updatedDocumentMetadata.document.editor).toEqual({ expanded: true });
    expect(
      applyScenePatch(
        updatedDocumentMetadata.document,
        updatedDocumentMetadata.inverse,
      ).document.editor,
    ).toBeUndefined();

    const updatedNodeMetadata = applyScenePatch(scene, {
      nodeId: 'table-node',
      op: 'setEditorMetadata',
      value: { locked: true },
    });
    expect(updatedNodeMetadata.document.nodes[0].editor).toEqual({
      locked: true,
    });
    expect(
      applyScenePatch(updatedNodeMetadata.document, updatedNodeMetadata.inverse)
        .document.nodes[0].editor,
    ).toBeUndefined();
  });

  it('does not materialize children arrays while rejecting childless reorders', () => {
    const scene: SceneDocument = {
      nodes: [{ id: 'empty-parent' }],
      units: 'meters',
      version: CURRENT_SCENE_VERSION,
    };

    const reordered = applyScenePatch(scene, {
      childIds: [],
      op: 'reorderChildren',
      parentId: 'empty-parent',
    });
    expect(reordered.document.nodes[0].children).toBeUndefined();
    expect(scene.nodes[0].children).toBeUndefined();
  });

  it('resolves lookAt yaw and placeOn transforms deterministically', () => {
    expect(resolveLookAtYawDeg([0, 0, 0], [1, 0, 0])).toBe(90);
    expect(resolveLookAtYawDeg([0, 0, 0], [0, 0, -1])).toBe(180);

    const scene = makeScene();
    const addLamp = applyScenePatch(scene, {
      node: {
        asset: 'lamp',
        id: 'lamp-node',
        transform: {
          position: [10, 0, 10],
        },
      },
      op: 'addNode',
    }).document;

    const lamp = addLamp.nodes.find((node) => node.id === 'lamp-node');
    expect(lamp).toBeDefined();
    expect(resolveLookAtTransform(lamp!, [10, 0, 11]).rotationDeg).toEqual([
      0, 0, 0,
    ]);

    expect(resolvePlaceOnTransform(addLamp, 'lamp-node', 'table-node')).toEqual(
      {
        position: [2, 1, -1],
      },
    );

    const nestedLamp = applyScenePatch(scene, {
      node: {
        asset: 'lamp',
        id: 'nested-lamp',
        transform: {
          position: [10, 0, 10],
        },
      },
      op: 'addNode',
      parentId: 'table-node',
    }).document;
    const nestedLampPlacement = resolvePlaceOnTransform(
      nestedLamp,
      'nested-lamp',
      'table-node',
    );
    expect(nestedLampPlacement).toEqual({
      position: [0, 1, 0],
    });
    const placedNestedLamp = applyScenePatch(nestedLamp, {
      nodeId: 'nested-lamp',
      op: 'updateTransform',
      transform: nestedLampPlacement,
    }).document;
    expect(
      resolveLookAtTransformInDocument(
        placedNestedLamp,
        'nested-lamp',
        [2, 1, 0],
      ).rotationDeg,
    ).toEqual([0, 0, 0]);
  });

  it('snaps transforms and aligns centers or bounds edges deterministically', () => {
    expect(snapPositionToGrid([0.24, 0.26, -0.26], { gridSize: 0.25 })).toEqual(
      [0.25, 0.25, -0.25],
    );
    expect(
      snapPositionToGrid([0.36, 0.74, 0.37], {
        axes: ['x', 'z'],
        gridSize: [0.5, 1, 0.25],
        origin: [0.1, 0, 0],
      }),
    ).toEqual([0.6, 0.74, 0.25]);
    expect(
      resolveSnapTransform({
        id: 'free-node',
        transform: { position: [1.49, 0.51, -1.51], rotationDeg: [0, 30, 0] },
      }),
    ).toEqual({
      position: [1, 1, -2],
      rotationDeg: [0, 30, 0],
    });

    const scene = applyScenePatch(makeScene(), {
      node: {
        asset: 'lamp',
        id: 'lamp-node',
        transform: {
          position: [10, 0, 3],
          scale: [2, 1, 1],
        },
      },
      op: 'addNode',
    }).document;

    expect(
      resolveAlignTransforms(scene, ['lamp-node'], {
        axis: 'x',
        edge: 'center',
        targetNodeId: 'table-node',
      })['lamp-node'],
    ).toEqual({
      position: [2, 0, 3],
      scale: [2, 1, 1],
    });
    expect(
      resolveAlignTransforms(scene, ['lamp-node'], {
        axis: 'x',
        edge: 'min',
        targetEdge: 'max',
        targetNodeId: 'table-node',
      })['lamp-node'],
    ).toEqual({
      position: [3.5, 0, 3],
      scale: [2, 1, 1],
    });
    expect(
      resolveAlignTransforms(scene, ['lamp-node'], {
        axis: 'z',
        edge: 'max',
        targetValue: 1,
      })['lamp-node'],
    ).toEqual({
      position: [10, 0, 0.75],
      scale: [2, 1, 1],
    });
    expect(() => resolveAlignTransforms(scene, [], { axis: 'x' })).toThrow(
      'At least one node id is required for alignment',
    );
  });

  it('resolves placeOn, lookAt, and align in world space under rotated parents', () => {
    const scene = applyScenePatch(
      applyScenePatch(makeScene(), {
        nodeId: 'table-node',
        op: 'updateTransform',
        transform: {
          position: [2, 0, -1],
          rotationDeg: [0, 90, 0],
          scale: [1, 2, 1],
        },
      }).document,
      {
        node: {
          asset: 'lamp',
          id: 'nested-lamp',
          transform: {
            position: [10, 0, 10],
          },
        },
        op: 'addNode',
        parentId: 'table-node',
      },
    ).document;

    const placement = resolvePlaceOnTransform(
      scene,
      'nested-lamp',
      'table-node',
    );
    expect(placement).toEqual({ position: [0, 1, 0] });

    const placedScene = applyScenePatch(scene, {
      nodeId: 'nested-lamp',
      op: 'updateTransform',
      transform: placement,
    }).document;
    expect(
      resolveLookAtTransformInDocument(placedScene, 'nested-lamp', [2, 2, 0])
        .rotationDeg,
    ).toEqual([0, 270, 0]);

    const aligned = resolveAlignTransforms(placedScene, ['nested-lamp'], {
      axis: 'x',
      edge: 'center',
      targetValue: 3,
    })['nested-lamp'];
    expect(aligned.position).toEqual([0, 1, 1]);
  });

  it('runs the phase-1 E2E document flow without browser or runtime imports', () => {
    const previousVersionFixture = {
      ...makeScene(),
      version: 'iwsdk.scene.v0',
    };
    const migrated = migrateSceneDocument(previousVersionFixture);
    const history = new SceneCommandHistory(migrated);

    history.apply({
      node: {
        asset: 'lamp',
        id: 'task-lamp',
        transform: {
          position: [0, 0, 0],
        },
      },
      op: 'addNode',
    });
    const placeOn = resolvePlaceOnTransform(
      history.document,
      'task-lamp',
      'table-node',
    );
    history.apply({
      nodeId: 'task-lamp',
      op: 'updateTransform',
      transform: resolveLookAtTransform(
        {
          id: 'task-lamp',
          transform: placeOn,
        },
        [2, 1, 1],
      ),
    });
    history.apply({
      component: 'example.AuthoringNote',
      nodeId: 'task-lamp',
      op: 'updateComponent',
      value: {
        createdBy: 'test',
      },
    });
    history.undo();
    history.redo();

    const serialized = serializeSceneDocument(history.document);
    const reloaded = parseSceneDocument(serialized);
    const taskLamp = reloaded.nodes.find((node) => node.id === 'task-lamp');

    expect(reloaded.metadata?.migratedFrom).toBe('iwsdk.scene.v0');
    expect(taskLamp?.transform?.position).toEqual([2, 1, -1]);
    expect(taskLamp?.transform?.rotationDeg).toEqual([0, 0, 0]);
    expect(taskLamp?.components?.['example.AuthoringNote']).toEqual({
      createdBy: 'test',
    });
  });
});
