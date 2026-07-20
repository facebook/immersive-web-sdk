/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { SceneDocument } from '@iwsdk/scene-composition';
import { describe, expect, test, vi } from 'vitest';
import {
  SceneEditorSession,
  SCENE_EDITOR_TOOL_METHODS,
} from '../src/editor/scene-editor-session.js';

const DOCUMENT: SceneDocument = {
  assets: [
    {
      bounds: { max: [1, 0.5, 1], min: [-1, 0, -1] },
      id: 'table',
      uri: '/assets/table.glb',
    },
    {
      bounds: { max: [0.1, 0.4, 0.1], min: [-0.1, 0, -0.1] },
      id: 'vase',
      uri: '/assets/vase.glb',
    },
  ],
  nodes: [
    {
      asset: 'table',
      id: 'table-1',
      transform: { position: [0, 0, 0] },
    },
  ],
  units: 'meters',
  version: 'iwsdk.scene.v1',
};

describe('SceneEditorSession', () => {
  test('handles every native scene editor tool method', () => {
    const session = new SceneEditorSession({ document: DOCUMENT });

    for (const method of SCENE_EDITOR_TOOL_METHODS) {
      expect(session.handles(method)).toBe(true);
    }
    expect(session.handles('get_transform')).toBe(false);
  });

  test('lists typed component schemas from session and scene documents', async () => {
    const session = new SceneEditorSession({
      componentSchemas: [
        {
          fields: {
            isVisible: { default: true, type: 'Boolean' },
          },
          id: 'Visibility',
          source: 'iwsdk',
        },
      ],
      document: {
        ...DOCUMENT,
        componentSchemas: [
          {
            fields: {
              config: { default: '', type: 'String' },
              maxWidth: { default: 1, type: 'Float32' },
            },
            id: 'PanelUI',
            source: 'scene',
          },
        ],
      },
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

  test('adds, places, orients, selects, undoes, and redoes scene nodes', async () => {
    const session = new SceneEditorSession({ document: DOCUMENT });

    await session.dispatch('scene_add_node', {
      node: {
        asset: 'vase',
        id: 'vase-1',
        transform: { position: [0.4, 0, 0] },
      },
    });
    await session.dispatch('scene_place_on', {
      align: 'preserve-xz',
      nodeId: 'vase-1',
      targetId: 'table-1',
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
    expect(session.document.nodes[1]?.transform?.placeOn).toBeUndefined();

    await session.dispatch('scene_undo');
    expect(session.document.nodes[1]?.transform?.rotationDeg).toBeUndefined();

    await session.dispatch('scene_redo');
    expect(session.document.nodes[1]?.transform?.rotationDeg?.[1]).toBeCloseTo(
      338.1985,
    );
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
      { height: 256, width: 256 },
    );
    expect(image).toMatchObject({ imageData: 'png', mimeType: 'image/png' });
    expect(saveDocument.mock.calls[0][0]).toContain('"version"');
    expect(saved).toMatchObject({
      bytes: 42,
      dirty: false,
      path: 'src/scene.iwsdk.scene.json',
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
      { height: 128, width: 128 },
    );
    expect(screenshot).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ view: 'front' }),
      { height: 128, width: 128 },
    );
  });

  test('returns validation issues for unknown assets and below-floor placement', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            asset: 'vase',
            id: 'sunken-vase',
            transform: { position: [0, -0.2, 0] },
          },
        ],
      },
    });

    expect(await session.dispatch('scene_validate')).toMatchObject({
      valid: false,
      issues: [
        {
          message: expect.stringContaining('penetrates below the floor'),
          nodeId: 'sunken-vase',
          path: '$.nodes[0].transform.position',
          suggestedFix: expect.stringContaining('scene_place_on'),
        },
      ],
    });

    await expect(
      session.dispatch('scene_add_node', {
        node: { asset: 'missing', id: 'bad' },
      }),
    ).rejects.toThrow('unknown asset "missing"');
  });

  test('does not use raw authoring-unit asset bounds as meter placement errors', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        assets: [
          ...DOCUMENT.assets,
          {
            bounds: {
              max: [862.17626953125, 871.5792236328125, 117.95475769042969],
              min: [-862.1762084960938, -704.1123046875, -423.6421203613281],
            },
            id: 'environment-desk',
            name: 'Environment Desk',
            uri: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
          },
          {
            bounds: {
              max: [29.710256576538086, 68.02915954589844, 28.88426399230957],
              min: [
                -29.710256576538086, -22.996440887451172, -73.18901824951172,
              ],
            },
            id: 'robot',
            uri: '/iwsdk-assets/robot/robot.gltf',
          },
        ],
        nodes: [
          {
            asset: 'environment-desk',
            components: { LocomotionEnvironment: {} },
            id: 'environment',
            transform: { position: [0, -0.106921583, 0] },
          },
          {
            asset: 'robot',
            id: 'robot-distance-grab',
            transform: { position: [0, 0.95, -2], scale: 0.5 },
          },
          {
            asset: 'vase',
            id: 'plant-on-environment',
            transform: { position: [0.65, 0.95, -1.65], scale: 1.25 },
          },
        ],
      },
      knownComponents: ['LocomotionEnvironment'],
    });

    const validation = await session.dispatch('scene_validate');
    expect(validation).toMatchObject({ valid: true });
    expect(JSON.stringify(validation)).not.toContain(
      'penetrates below the floor',
    );
    expect(JSON.stringify(validation)).not.toContain('appears unsupported');
  });

  test('accepts deprecated Interactable component aliases as RayInteractable', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            asset: 'table',
            components: {
              Interactable: {
                props: {},
                type: 'Interactable',
              },
              'com.iwsdk.components.Interactable': {
                props: {},
                type: 'Interactable',
              },
            },
            id: 'legacy-interactable-table',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
    });

    await expect(session.dispatch('scene_validate')).resolves.toEqual({
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
        node: { asset: 'vase', id: 'table-1' },
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
            note: 'intentional support object',
            validation: { allowFloating: true },
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
                note: 'intentional support object',
                validation: { allowFloating: true },
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
                note: 'intentional support object',
                validation: { allowFloating: true },
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

  test('moves nodes between hierarchy parents and reorders siblings through patch tools', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          DOCUMENT.nodes[0],
          {
            asset: 'vase',
            id: 'vase-1',
            transform: { position: [0.25, 0, 0] },
          },
          {
            asset: 'vase',
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
            asset: 'vase',
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
            asset: 'vase',
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
            asset: 'table',
            children: [
              {
                asset: 'vase',
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

  test('reports base validation issues for invalid authored documents', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            asset: 'missing',
            id: 'duplicate',
          },
          {
            asset: 'vase',
            id: 'duplicate',
            transform: { position: [0, Number.NaN, 0] },
          },
        ],
      } as unknown as SceneDocument,
    });

    await expect(session.dispatch('scene_validate')).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          message: 'unknown asset "missing"',
          nodeId: 'duplicate',
          path: '$.nodes[0].asset',
          suggestedFix: expect.stringContaining('scene_list_assets'),
        }),
        expect.objectContaining({
          message: 'duplicate node id "duplicate"',
          nodeId: 'duplicate',
          path: '$.nodes[1].id',
          suggestedFix: expect.stringContaining('Rename one duplicate node id'),
        }),
        expect.objectContaining({
          message: 'value must be a finite [x, y, z] tuple',
          nodeId: 'duplicate',
          path: '$.nodes[1].transform.position',
          suggestedFix: expect.stringContaining('finite numeric tuples'),
        }),
      ]),
    });
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

  test('detects unsupported elevated objects but allows intentional floating metadata', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          DOCUMENT.nodes[0],
          {
            asset: 'vase',
            id: 'floating-vase',
            transform: { position: [3, 1.2, 0] },
          },
          {
            asset: 'vase',
            id: 'wall-sconce',
            metadata: { validation: { allowFloating: true } },
            transform: { position: [0, 2.2, -2] },
          },
        ],
      },
    });

    expect(await session.dispatch('scene_validate')).toMatchObject({
      valid: false,
      issues: [
        {
          message: expect.stringContaining('floating-vase'),
          nodeId: 'floating-vase',
          suggestedFix: expect.stringContaining('scene_place_on'),
        },
      ],
    });
    expect(
      JSON.stringify(await session.dispatch('scene_validate')),
    ).not.toContain('wall-sconce');
  });

  test('validates scene component names with app-specific extension points', async () => {
    const session = new SceneEditorSession({
      document: {
        ...DOCUMENT,
        nodes: [
          {
            asset: 'table',
            components: {
              'com.iwsdk.components.PanelUI': { config: 'panel.json' },
              MissingComponent: {},
            },
            id: 'component-node',
            transform: { position: [0, 0, 0] },
          },
          {
            asset: 'vase',
            components: {
              CustomInspectable: {},
            },
            id: 'custom-node',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
      knownComponents: ['CustomInspectable'],
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

  test('validates known typed component payloads against their schemas before save', async () => {
    const saveDocument = vi.fn();
    const session = new SceneEditorSession({
      componentSchemas: [
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
      ],
      document: {
        ...DOCUMENT,
        nodes: [
          {
            asset: 'table',
            components: {
              'com.iwsdk.components.PanelUI': {
                props: {
                  anchor: 'invalid',
                  config: 7,
                  maxWidth: 4,
                  offset: [1, 2],
                },
                type: 'PanelUI',
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
          message:
            'component field "anchor" must be one of the schema enum values',
          nodeId: 'panel-node',
          path: '$.nodes[0].components["com.iwsdk.components.PanelUI"].props["anchor"]',
        }),
        expect.objectContaining({
          message: 'component field "config" must be a string',
          nodeId: 'panel-node',
          path: '$.nodes[0].components["com.iwsdk.components.PanelUI"].props["config"]',
        }),
        expect.objectContaining({
          message: 'component field "maxWidth" is outside the allowed range',
          nodeId: 'panel-node',
          path: '$.nodes[0].components["com.iwsdk.components.PanelUI"].props["maxWidth"]',
        }),
        expect.objectContaining({
          message: 'component field "offset" must be a finite 3-number tuple',
          nodeId: 'panel-node',
          path: '$.nodes[0].components["com.iwsdk.components.PanelUI"].props["offset"]',
        }),
      ]),
    });
    await expect(session.dispatch('scene_save')).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('component field'),
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
            asset: 'table',
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
      document: {
        ...DOCUMENT,
        nodes: [
          {
            asset: 'table',
            components: {
              CustomInspectable: { label: 'runtime-owned' },
            },
            id: 'custom-node',
            transform: { position: [0, 0, 0] },
          },
        ],
      },
      knownComponents: ['CustomInspectable'],
      saveDocument: validSaveDocument,
    });

    await expect(validSession.dispatch('scene_save')).resolves.toMatchObject({
      dirty: false,
      path: 'public/scenes/main.iwsdk.scene.json',
    });
    expect(validSaveDocument).toHaveBeenCalledTimes(1);
  });
});
