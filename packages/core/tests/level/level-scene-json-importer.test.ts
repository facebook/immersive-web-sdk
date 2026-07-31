/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CURRENT_SCENE_VERSION,
  type SceneDocument,
  validateSceneDocument,
} from '@iwsdk/scene-composition';
import { signal } from '@preact/signals-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createComponent, Types } from '../../src/ecs/component.js';
import type { Entity } from '../../src/ecs/entity.js';
import { World } from '../../src/ecs/world.js';
import { RayInteractable } from '../../src/input/state-tags.js';
import { LevelComponentApplier } from '../../src/level/level-component-applier.js';
import { GLXFImporter } from '../../src/level/level-glxf-importer.js';
import { LevelImporter } from '../../src/level/level-importer.js';
import { SceneJSONImporter } from '../../src/level/level-scene-json-importer.js';
import { LevelSystem } from '../../src/level/level-system.js';
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  Vector3,
} from '../../src/runtime/index.js';
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
    resources: {},
    nodes: [
      {
        content: { asset: 'table', type: 'asset' },
        children: [
          {
            constraints: {
              lookAt: { mode: 'yaw-v1', target: [2, 1, 1] },
            },
            content: { asset: 'lamp', type: 'asset' },
            components: {
              NativeSmoke: {
                enabled: true,
              },
            },
            id: 'lamp-node',
            transform: { position: [0, 1, 0] },
          },
        ],
        components: {
          PanelUI: {
            config: '/ui/panel.uikitml',
            maxWidth: 2,
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

  const assetBounds = {
    table: { max: [1, 1, 1], min: [-1, 0, -1] },
    lamp: { max: [0.25, 0.5, 0.25], min: [-0.25, 0, -0.25] },
    book: { max: [0.5, 0.1, 0.5], min: [-0.5, 0, -0.5] },
    vase: { max: [0.1, 0.3, 0.1], min: [-0.1, 0, -0.1] },
    chair: { max: [0.5, 0.5, 0.5], min: [-0.5, -0.5, -0.5] },
    building: { max: [1.5, 1, 0.5], min: [-1.5, -1, -0.5] },
  } as const;
  const instantiate = vi.fn(async (assetId: string) => {
    if (!(assetId in assetBounds)) {
      throw new Error(`Unknown renderable asset "${assetId}"`);
    }
    if (assetId === 'building') {
      return new Mesh(
        new BoxGeometry(3, 2, 1),
        new MeshStandardMaterial({ color: '#336699' }),
      );
    }
    const object = new Object3D();
    const child = new Object3D();
    child.name = `${assetId}-asset`;
    object.add(child);
    return object;
  });
  const world = {
    componentCatalog: undefined,
    assets: {
      bounds: (assetId: string) =>
        assetBounds[assetId as keyof typeof assetBounds],
      instantiate,
    },
    createTransformEntity: vi.fn((object: Object3D, parent: FakeEntity) => {
      const entity = makeEntity(object, nextIndex++);
      entity.parentEntity = parent;
      entities.push(entity);
      return entity;
    }),
    getActiveRoot: vi.fn(() => rootObject),
    registerComponent: vi.fn(),
  };

  return {
    entities,
    instantiate,
    root,
    rootObject,
    world: world as unknown as World,
  };
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

function makeEnvironmentRenderer() {
  let clearAlpha = 1;
  return {
    getClearAlpha: () => clearAlpha,
    setClearAlpha: (value: number) => {
      clearAlpha = value;
    },
    shadowMap: { enabled: false },
    toneMapping: 0,
    toneMappingExposure: 1,
    xr: {},
  } as any;
}

describe('SceneJSONImporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads draft authoring metadata that is not review-complete', async () => {
    const { root, world } = makeWorld();
    const scene = makeScene();
    const hash = `sha256:${'0'.repeat(64)}`;
    scene.authoring = {
      composition: {
        assumptions: [],
        feasibility: { status: 'supported' },
        features: [
          {
            acceptance: [
              {
                id: 'table-present',
                kind: 'presence',
                nodeRefs: ['table-node'],
                view: 'hero',
              },
            ],
            description: 'The table is the identity-critical subject.',
            id: 'table-feature',
            identityCritical: true,
            nodeRefs: ['table-node'],
            priority: 'required',
          },
        ],
        input: { kind: 'text', prompt: 'A table', references: [] },
        mode: 'static',
        provenance: {
          adapter: { id: 'text-intake', version: '1.0.0' },
          capabilityHash: hash,
          inputHashes: [hash],
          skill: { id: 'iwsdk-scene-composer', version: '1.0.0' },
        },
        representationPolicy: {
          allowed: ['asset'],
          fidelityCeiling: 'draft',
        },
        review: {
          heroView: 'hero',
          lenses: ['layout', 'geometry', 'final'],
          maxCorrectionRounds: 2,
          requiredViews: ['hero'],
        },
        target: {
          assetPolicy: 'manifest-assets',
          style: 'draft',
          surfaces: ['browser'],
        },
      },
      nodeAnnotations: [
        {
          featureRefs: ['table-feature'],
          node: 'table-node',
          reviewLayer: 'geometry',
        },
      ],
      views: [
        {
          fov: 45,
          id: 'hero',
          position: [0, 2, 4],
          projection: 'perspective',
          role: 'hero',
          target: [0, 1, 0],
        },
      ],
    };

    expect(validateSceneDocument(scene)).toMatchObject({ valid: false });
    await expect(
      SceneJSONImporter.loadDocument(world, scene, root),
    ).resolves.toMatchObject({ document: expect.any(Object) });
  });

  it('resolves imported scene modules before lowering the runtime document', async () => {
    const { root, world } = makeWorld();
    const moduleDocument: SceneDocument = {
      version: CURRENT_SCENE_VERSION,
      units: 'meters',
      resources: {},
      nodes: [
        {
          id: 'chair',
          content: { type: 'asset', asset: 'chair' },
        },
      ],
    };
    const fetchModule = vi.fn(
      async () =>
        new Response(JSON.stringify(moduleDocument), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchModule);

    const result = await SceneJSONImporter.loadDocument(
      world,
      {
        version: CURRENT_SCENE_VERSION,
        units: 'meters',
        imports: [
          {
            id: 'alcove',
            src: './modules/alcove.iwsdk.scene.json',
            transform: { position: [2, 0, 0] },
          },
        ],
        resources: {},
        nodes: [],
      },
      root,
      'https://example.test/scenes/root.iwsdk.scene.json',
    );

    expect(fetchModule).toHaveBeenCalledWith(
      'https://example.test/scenes/modules/alcove.iwsdk.scene.json',
    );
    expect(result.dependencies).toEqual([
      expect.objectContaining({
        namespace: 'alcove',
        source: 'https://example.test/scenes/modules/alcove.iwsdk.scene.json',
      }),
    ]);
    expect([...result.nodes.keys()]).toEqual(['alcove', 'alcove/chair']);
    expect(result.document.imports).toBeUndefined();
    expect(result.document.nodes[0]).toMatchObject({
      id: 'alcove',
      transform: { position: [2, 0, 0] },
    });
  });

  it('requires a document URL when a scene document imports modules', async () => {
    const { root, world } = makeWorld();

    await expect(
      SceneJSONImporter.loadDocument(
        world,
        {
          version: CURRENT_SCENE_VERSION,
          units: 'meters',
          imports: [{ id: 'module', src: './module.iwsdk.scene.json' }],
          resources: {},
          nodes: [],
        },
        root,
      ),
    ).rejects.toThrow(/require a document URL/);
  });

  it('loads native scene JSON into Object3D hierarchy, ECS entities, and components', async () => {
    const { entities, instantiate, root, rootObject, world } = makeWorld();
    const assetRoot = new Object3D();
    const assetChild = new Object3D();
    assetChild.name = 'asset-child';
    assetRoot.add(assetChild);
    assetRoot.name = 'asset-root';
    instantiate.mockImplementation(async (assetId) =>
      assetId === 'lamp'
        ? assetRoot.clone(true)
        : Object.assign(new Object3D(), { name: 'table-asset' }),
    );

    const result = await SceneJSONImporter.loadDocument(
      world,
      makeScene(),
      root,
    );

    expect(instantiate).toHaveBeenCalledWith('table');
    expect(instantiate).toHaveBeenCalledWith('lamp');
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
    expect(lamp.object3D.userData).toMatchObject({
      iwsdkSceneContent: { asset: 'lamp', type: 'asset' },
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

  it('loads procedural manifest assets as real Three.js meshes', async () => {
    const { entities, root, rootObject, world } = makeWorld();
    const scene: SceneDocument = {
      resources: {},
      nodes: [
        {
          content: {
            asset: 'building',
            castShadow: false,
            receiveShadow: true,
            type: 'asset',
          },
          id: 'building',
          name: 'Building mesh',
          transform: { position: [4, 1, -2] },
        },
      ],
      units: 'meters',
      version: CURRENT_SCENE_VERSION,
    };

    const result = await SceneJSONImporter.loadDocument(world, scene, root);
    const imported = result.nodes.get('building');

    expect(entities).toHaveLength(1);
    expect(imported).toMatchObject({
      assetId: 'building',
      entity: entities[0],
      nodeId: 'building',
    });
    expect(imported?.object).toBeInstanceOf(Mesh);

    const mesh = imported?.object as Mesh;
    expect(mesh.name).toBe('Building mesh');
    expect(mesh.position.toArray()).toEqual([4, 1, -2]);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.geometry).toMatchObject({
      parameters: { depth: 1, height: 2, width: 3 },
      type: 'BoxGeometry',
    });
    expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);

    const material = mesh.material as MeshStandardMaterial;
    expect(material.color.getHexString()).toBe('336699');
    expect(mesh.userData).toMatchObject({
      iwsdkSceneAssetId: 'building',
      iwsdkSceneNodeId: 'building',
    });
    expect(rootObject.children).toEqual([mesh]);
  });

  it('maps deprecated Interactable component aliases to RayInteractable', async () => {
    const { entities, root, world } = makeWorld();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = makeScene();
    scene.nodes = [
      {
        content: { type: 'group' },
        components: {
          Interactable: {},
        },
        id: 'unprefixed-legacy-interactable',
      },
      {
        content: { type: 'group' },
        components: {
          'com.iwsdk.components.Interactable': {},
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

  it('rolls back attached assets and entities without disposing shared manifest resources', async () => {
    const { entities, instantiate, root, rootObject, world } = makeWorld();
    const material = new MeshStandardMaterial();
    const geometry = new BoxGeometry(1, 1, 1);
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    instantiate.mockResolvedValue(new Mesh(geometry, material));
    const scene = makeScene();
    scene.nodes = [
      {
        components: { MissingComponent: {} },
        content: { asset: 'table', type: 'asset' },
        id: 'bad-asset-node',
      },
    ];

    await expect(
      SceneJSONImporter.loadDocument(world, scene, root),
    ).rejects.toThrow('Unknown component "MissingComponent"');

    expect(entities).toHaveLength(1);
    expect(entities[0].destroy).toHaveBeenCalledOnce();
    expect(rootObject.children).toEqual([]);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
  });

  it('rejects unknown manifest assets before mutating runtime parent state', async () => {
    const { entities, root, rootObject, world } = makeWorld();
    rootObject.userData.sentinel = 'unchanged';
    const scene = makeScene();
    scene.nodes = [
      {
        content: { asset: 'missing', type: 'asset' },
        id: 'missing-node',
      },
    ];

    await expect(
      SceneJSONImporter.loadDocument(world, scene, root),
    ).rejects.toThrow('Unknown renderable asset "missing"');

    expect(entities).toHaveLength(0);
    expect(rootObject.children).toEqual([]);
    expect(rootObject.userData).toEqual({ sentinel: 'unchanged' });
  });

  it('treats type and props as ordinary fields in raw component payloads', () => {
    const { root, world } = makeWorld();

    LevelComponentApplier.applyComponents(
      root,
      {
        NativeSmoke: {
          props: {},
          type: 'PanelUI',
        },
      },
      world,
      { nodeId: 'raw-node', strict: true },
    );
    expect(root.componentCalls).toContainEqual({
      component: NativeSmoke,
      props: {},
    });
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
    const scene: SceneDocument = {
      nodes: [{ id: 'scene-root' }],
      resources: {},
      units: 'meters',
      version: CURRENT_SCENE_VERSION,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => scene,
        ok: true,
        status: 200,
        statusText: 'OK',
      }),
    );
    const result = await SceneJSONImporter.load(
      world,
      '/scenes/main.iwsdk.scene.json',
      root,
    );

    expect(fetch).toHaveBeenCalledWith('/scenes/main.iwsdk.scene.json');
    expect(result.document).toMatchObject({
      nodes: [{ id: 'scene-root' }],
      resources: {},
      units: 'meters',
      version: CURRENT_SCENE_VERSION,
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
    const runtimeScene = new Scene();
    const sceneEntity = makeEntity(runtimeScene, 3);
    const createdRoots: FakeEntity[] = [];
    const scene = makeScene();
    const loadDocument = vi
      .spyOn(LevelImporter, 'loadDocument')
      .mockResolvedValue(undefined);

    world.sceneEntity = sceneEntity;
    world.scene = runtimeScene;
    world.renderer = makeEnvironmentRenderer();
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

  it('rejects a superseded level load before registering the next one', async () => {
    const world = new World();
    const scene = makeScene();
    const firstLoad = world.loadLevel('/first.glxf');
    const firstRejection = expect(firstLoad).rejects.toThrow(
      'Level load was superseded by a newer request',
    );

    await Promise.resolve();

    const secondLoad = world.loadSceneDocument(scene);
    await firstRejection;
    expect(world.requestedLevelUrl).toBeUndefined();
    expect(world.requestedLevelDocument).toBe(scene);

    world._resolveLevelLoad?.();
    await secondLoad;
  });
});
