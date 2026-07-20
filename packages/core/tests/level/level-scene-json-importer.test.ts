/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CURRENT_SCENE_VERSION,
  type SceneDocument,
} from '@iwsdk/scene-composition';
import { signal } from '@preact/signals-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetManager } from '../../src/asset/index.js';
import { createComponent, Types } from '../../src/ecs/component.js';
import type { Entity } from '../../src/ecs/entity.js';
import { World } from '../../src/ecs/world.js';
import { RayInteractable } from '../../src/input/state-tags.js';
import { LevelComponentApplier } from '../../src/level/level-component-applier.js';
import { GLXFImporter } from '../../src/level/level-glxf-importer.js';
import { LevelImporter } from '../../src/level/level-importer.js';
import { SceneJSONImporter } from '../../src/level/level-scene-json-importer.js';
import { LevelSystem } from '../../src/level/level-system.js';
import { Object3D, Vector3 } from '../../src/runtime/index.js';
import { PanelUI } from '../../src/ui/index.js';

// The runtime barrel pulls in xr-input's cursor-visual.ts, which touches
// `document` at module load; provide a minimal canvas stub before importing.
vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        arc: () => {},
        beginPath: () => {},
        clearRect: () => {},
        fill: () => {},
        fillStyle: '',
        lineWidth: 0,
        stroke: () => {},
        strokeStyle: '',
      }),
      height: 0,
      width: 0,
    }),
  };
});

const NativeSmoke = createComponent('NativeSmoke', {
  enabled: { type: Types.Boolean, default: false },
});

interface ComponentCall {
  component: { id: string };
  props: unknown;
}

interface FakeEntity extends Entity {
  componentCalls: ComponentCall[];
  destroy: ReturnType<typeof vi.fn>;
  parentEntity?: FakeEntity;
}

function makeScene(): SceneDocument {
  return {
    assets: [
      {
        bounds: {
          max: [1, 1, 1],
          min: [-1, 0, -1],
        },
        id: 'table',
        type: 'other',
        uri: '/unused/table',
      },
      {
        bounds: {
          max: [0.25, 0.5, 0.25],
          min: [-0.25, 0, -0.25],
        },
        id: 'lamp',
        type: 'gltf',
        uri: '/assets/lamp.gltf',
      },
    ],
    nodes: [
      {
        asset: 'table',
        children: [
          {
            asset: 'lamp',
            components: {
              NativeSmoke: {
                props: {
                  enabled: true,
                },
                type: 'NativeSmoke',
              },
            },
            id: 'lamp-node',
            transform: {
              lookAt: [2, 1, 1],
              placeOn: 'table-node',
            },
          },
        ],
        components: {
          PanelUI: {
            props: {
              config: '/ui/panel.uikitml',
              maxWidth: 2,
            },
            type: 'PanelUI',
          },
          'com.iwsdk.components.RayInteractable': {},
        },
        id: 'table-node',
        transform: {
          position: [2, 0, -1],
          rotationDeg: [0, 90, 0],
          scale: [1, 2, 1],
        },
      },
    ],
    units: 'meters',
    version: CURRENT_SCENE_VERSION,
  };
}

function makeWorld() {
  let nextIndex = 1;
  const rootObject = new Object3D();
  const root = makeEntity(rootObject, nextIndex++);
  const entities: FakeEntity[] = [];

  const world = {
    createTransformEntity: vi.fn((object: Object3D, parent: FakeEntity) => {
      const entity = makeEntity(object, nextIndex++);
      entity.parentEntity = parent;
      entities.push(entity);
      return entity;
    }),
    getActiveRoot: vi.fn(() => rootObject),
    registerComponent: vi.fn(),
  };

  return { entities, root, rootObject, world: world as unknown as World };
}

function makeEntity(object3D: Object3D, index: number): FakeEntity {
  const componentCalls: ComponentCall[] = [];
  const entity = {
    addComponent: vi.fn((component: { id: string }, props?: unknown) => {
      componentCalls.push({ component, props: props ?? {} });
      return entity;
    }),
    componentCalls,
    destroy: vi.fn(),
    hasComponent: vi.fn(() => false),
    index,
    object3D,
  } as unknown as FakeEntity;

  return entity;
}

describe('SceneJSONImporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads native scene JSON into Object3D hierarchy, ECS entities, and components', async () => {
    const { entities, root, rootObject, world } = makeWorld();
    const assetRoot = new Object3D();
    const assetChild = new Object3D();
    assetChild.name = 'asset-child';
    assetRoot.add(assetChild);
    assetRoot.name = 'asset-root';
    vi.spyOn(AssetManager, 'loadGLTF').mockResolvedValue({
      scene: assetRoot,
      scenes: [assetRoot],
    } as any);
    vi.spyOn(AssetManager, 'getGLTF').mockReturnValue(null);

    const result = await SceneJSONImporter.loadDocument(
      world,
      makeScene(),
      root,
    );

    expect(AssetManager.loadGLTF).toHaveBeenCalledWith(
      '/assets/lamp.gltf',
      'lamp',
    );
    expect(entities).toHaveLength(2);
    expect(rootObject.children.map((child) => child.name)).toEqual([
      'table-node',
    ]);

    const table = entities[0];
    const lamp = entities[1];
    expect(result.rootEntities).toEqual([table]);
    expect([...result.nodes.keys()]).toEqual(['table-node', 'lamp-node']);
    expect(result.nodes.get('table-node')).toMatchObject({
      assetId: 'table',
      componentTypes: ['PanelUI', 'com.iwsdk.components.RayInteractable'],
      entity: table,
      nodeId: 'table-node',
      object: table.object3D,
    });
    expect(result.nodes.get('lamp-node')).toMatchObject({
      assetId: 'lamp',
      componentTypes: ['NativeSmoke'],
      entity: lamp,
      nodeId: 'lamp-node',
      object: lamp.object3D,
      parentNodeId: 'table-node',
    });
    expect(table.parentEntity).toBe(root);
    expect(lamp.parentEntity).toBe(table);
    expect(table.object3D.children.map((child) => child.name)).toEqual([
      'lamp-node',
    ]);
    expect(table.object3D.userData).toMatchObject({
      iwsdkSceneAssetId: 'table',
      iwsdkSceneNodeId: 'table-node',
    });
    expect(lamp.object3D.userData).toMatchObject({
      iwsdkSceneAssetId: 'lamp',
      iwsdkSceneNodeId: 'lamp-node',
    });
    expect(lamp.object3D.children[0]?.userData).toMatchObject({
      iwsdkSceneAssetId: 'lamp',
      iwsdkSceneNodeId: 'lamp-node',
    });

    expect(table.object3D.position.toArray()).toEqual([2, 0, -1]);
    expect(table.object3D.scale.toArray()).toEqual([1, 2, 1]);
    expect(table.object3D.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(lamp.object3D.position.toArray()).toEqual([0, 1, 0]);
    expect(lamp.object3D.getWorldPosition(new Vector3()).toArray()).toEqual([
      2, 2, -1,
    ]);
    expect(lamp.object3D.rotation.y).toBeCloseTo((Math.PI * 3) / 2);

    expect(table.componentCalls.map((call) => call.component.id)).toContain(
      RayInteractable.id,
    );
    expect(table.componentCalls).toContainEqual({
      component: PanelUI,
      props: {
        config: '/ui/panel.json',
        maxHeight: 1,
        maxWidth: 2,
      },
    });
    expect(lamp.componentCalls).toContainEqual({
      component: NativeSmoke,
      props: {
        enabled: true,
      },
    });
  });

  it('maps deprecated Interactable component aliases to RayInteractable', async () => {
    const { entities, root, world } = makeWorld();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = makeScene();
    scene.nodes = [
      {
        asset: 'table',
        components: {
          Interactable: {
            props: {},
            type: 'Interactable',
          },
        },
        id: 'unprefixed-legacy-interactable',
      },
      {
        asset: 'table',
        components: {
          'com.iwsdk.components.Interactable': {
            props: {},
            type: 'Interactable',
          },
        },
        id: 'prefixed-legacy-interactable',
      },
    ];

    await SceneJSONImporter.loadDocument(world, scene, root);

    expect(entities).toHaveLength(2);
    expect(entities[0]?.componentCalls).toContainEqual({
      component: RayInteractable,
      props: {},
    });
    expect(entities[1]?.componentCalls).toContainEqual({
      component: RayInteractable,
      props: {},
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('fails native scene runtime component imports with node and component context', async () => {
    const { root, world } = makeWorld();
    const scene = makeScene();
    scene.nodes = [
      {
        asset: 'table',
        components: {
          MissingComponent: {},
        },
        id: 'bad-node',
      },
    ];

    await expect(
      SceneJSONImporter.loadDocument(world, scene, root),
    ).rejects.toThrow(
      'Scene node "bad-node" component "MissingComponent": Unknown component "MissingComponent"',
    );
  });

  it('fails strict typed component mismatches with node and component context', () => {
    const { root, world } = makeWorld();

    expect(() =>
      LevelComponentApplier.applyComponents(
        root,
        {
          NativeSmoke: {
            props: {},
            type: 'PanelUI',
          },
        },
        world,
        { nodeId: 'typed-node', strict: true },
      ),
    ).toThrow(
      'Scene node "typed-node" component "NativeSmoke": Typed component payload type "PanelUI" does not match component key "NativeSmoke".',
    );
  });

  it('keeps legacy component imports prefix-gated while native strict imports allow bare keys', () => {
    const { root, world } = makeWorld();

    LevelComponentApplier.applyComponents(
      root,
      {
        RayInteractable: {},
      },
      world,
    );
    expect(root.componentCalls).not.toContainEqual({
      component: RayInteractable,
      props: {},
    });

    LevelComponentApplier.applyComponents(
      root,
      {
        'com.iwsdk.components.RayInteractable': {},
      },
      world,
    );
    expect(root.componentCalls).toContainEqual({
      component: RayInteractable,
      props: {},
    });

    const nativeEntity = makeEntity(new Object3D(), 999);
    LevelComponentApplier.applyComponents(
      nativeEntity,
      {
        RayInteractable: {},
      },
      world,
      { strict: true },
    );
    expect(nativeEntity.componentCalls).toContainEqual({
      component: RayInteractable,
      props: {},
    });
  });

  it('fetches, validates, and loads scene URLs', async () => {
    const { root, world } = makeWorld();
    const previousVersionScene = {
      ...makeScene(),
      version: 'iwsdk.scene.v0',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => previousVersionScene,
        ok: true,
        status: 200,
        statusText: 'OK',
      }),
    );
    vi.spyOn(AssetManager, 'loadGLTF').mockResolvedValue({
      scene: new Object3D(),
      scenes: [],
    } as any);
    vi.spyOn(AssetManager, 'getGLTF').mockReturnValue(null);

    const result = await SceneJSONImporter.load(
      world,
      '/scenes/main.iwsdk.scene.json',
      root,
    );

    expect(fetch).toHaveBeenCalledWith('/scenes/main.iwsdk.scene.json');
    expect(result.document).toMatchObject({
      metadata: {
        migratedFrom: 'iwsdk.scene.v0',
      },
      version: CURRENT_SCENE_VERSION,
    });
  });

  it('resolves placeOn dependencies before document order', async () => {
    const { root, world } = makeWorld();
    const scene: SceneDocument = {
      assets: [
        {
          bounds: { max: [1, 1, 1], min: [-1, 0, -1] },
          id: 'table',
          type: 'other',
          uri: '/unused/table',
        },
        {
          bounds: { max: [0.5, 0.1, 0.5], min: [-0.5, 0, -0.5] },
          id: 'book',
          type: 'other',
          uri: '/unused/book',
        },
        {
          bounds: { max: [0.1, 0.3, 0.1], min: [-0.1, 0, -0.1] },
          id: 'vase',
          type: 'other',
          uri: '/unused/vase',
        },
      ],
      nodes: [
        {
          asset: 'vase',
          id: 'vase-node',
          transform: { placeOn: 'book-node' },
        },
        {
          asset: 'book',
          id: 'book-node',
          transform: { placeOn: 'table-node' },
        },
        {
          asset: 'table',
          id: 'table-node',
        },
      ],
      units: 'meters',
      version: CURRENT_SCENE_VERSION,
    };

    const result = await SceneJSONImporter.loadDocument(world, scene, root);

    expect(result.document.nodes[1].transform).toEqual({
      position: [0, 1, 0],
    });
    expect(result.document.nodes[0].transform).toEqual({
      position: [0, 1.1, 0],
    });
  });

  it('routes native scene JSON URLs separately from legacy GLXF URLs', async () => {
    const { root, world } = makeWorld();
    const sceneLoad = vi
      .spyOn(SceneJSONImporter, 'load')
      .mockResolvedValue(undefined);
    const glxfLoad = vi
      .spyOn(GLXFImporter, 'load')
      .mockResolvedValue(undefined);

    await LevelImporter.load(
      world,
      '/scenes/main.iwsdk.scene.json?cache=1',
      root,
    );
    await LevelImporter.load(world, '/legacy/Composition.glxf', root);

    expect(sceneLoad).toHaveBeenCalledTimes(1);
    expect(glxfLoad).toHaveBeenCalledTimes(1);
  });

  it('loads in-memory scene documents through the World.loadSceneDocument level path', async () => {
    const world = new World();
    const existingRoot = makeEntity(new Object3D(), 1);
    const existingLevelEntity = makeEntity(new Object3D(), 2);
    const sceneEntity = makeEntity(new Object3D(), 3);
    const createdRoots: FakeEntity[] = [];
    const scene = makeScene();
    const loadDocument = vi
      .spyOn(LevelImporter, 'loadDocument')
      .mockResolvedValue(undefined);

    world.sceneEntity = sceneEntity;
    world.activeLevel = signal(existingRoot);
    world.createTransformEntity = vi.fn((object?: Object3D) => {
      const entity = makeEntity(
        object ?? new Object3D(),
        10 + createdRoots.length,
      );
      createdRoots.push(entity);
      return entity;
    }) as any;

    const loadPromise = world.loadSceneDocument(scene);
    expect(world.requestedLevelDocument).toBe(scene);
    expect(world.requestedLevelUrl).toBeUndefined();

    const system = new LevelSystem(world, {} as any, 0);
    (system as any).queries = {
      levelEntities: {
        entities: [existingLevelEntity],
      },
    };
    (system as any).config = {
      defaultLighting: {
        value: false,
      },
    };

    system.update();
    await loadPromise;

    expect(existingLevelEntity.destroy).toHaveBeenCalledTimes(1);
    expect(world.requestedLevelDocument).toBeUndefined();
    expect(world.requestedLevelUrl).toBeUndefined();
    expect(createdRoots).toHaveLength(1);
    expect(world.activeLevel.value).toBe(createdRoots[0]);
    expect(createdRoots[0].object3D?.name).toBe('LevelRoot');
    expect(loadDocument).toHaveBeenCalledWith(world, scene, createdRoots[0]);
  });

  it('settles a superseded level load promise before registering the next one', async () => {
    const world = new World();
    const scene = makeScene();
    const firstLoad = world.loadLevel('/first.glxf');
    let firstSettled = false;
    void firstLoad.then(() => {
      firstSettled = true;
    });

    await Promise.resolve();
    expect(firstSettled).toBe(false);

    const secondLoad = world.loadSceneDocument(scene);
    await firstLoad;
    expect(firstSettled).toBe(true);
    expect(world.requestedLevelUrl).toBeUndefined();
    expect(world.requestedLevelDocument).toBe(scene);

    world._resolveLevelLoad?.();
    await secondLoad;
  });
});
