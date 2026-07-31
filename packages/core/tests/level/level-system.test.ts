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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '../../src/ecs/world.js';
import {
  DomeGradient,
  DomeTexture,
  IBLGradient,
  IBLTexture,
} from '../../src/environment/index.js';
import { LevelRoot } from '../../src/level/level-root.js';
import { SceneJSONImporter } from '../../src/level/level-scene-json-importer.js';
import {
  applySceneHeroCamera,
  LevelSystem,
} from '../../src/level/level-system.js';
import { LevelTag } from '../../src/level/level-tag.js';
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Scene,
} from '../../src/runtime/three.js';
import { Transform } from '../../src/transform/transform.js';

const mockImporter = vi.hoisted(() => ({
  failWith: undefined as Error | undefined,
  importedEntities: [] as any[],
  lastOwnedGeometry: undefined as BoxGeometry | undefined,
  mutateEnvironment: false,
  stageOwnedResources: false,
  load: vi.fn(async (world: World, _url: string, parentEntity: any) => {
    let object: Object3D = new Object3D();
    if (mockImporter.stageOwnedResources) {
      const geometry = new BoxGeometry();
      object = new Mesh(geometry, new MeshStandardMaterial());
      object.userData.iwsdkOwnsPrimitiveResources = true;
      mockImporter.lastOwnedGeometry = geometry;
    }
    const imported = world.createTransformEntity(object, parentEntity);
    mockImporter.importedEntities.push(imported);
    if (mockImporter.mutateEnvironment) {
      world.renderer.shadowMap.enabled = false;
      world.renderer.toneMappingExposure = 9;
    }
    if (mockImporter.failWith != null) {
      throw mockImporter.failWith;
    }
  }),
}));

// world.ts -> @iwsdk/xr-input -> cursor-visual.ts touches `document` at module
// load; provide a minimal canvas stub before importing.
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

beforeEach(() => {
  vi.restoreAllMocks();
  mockImporter.failWith = undefined;
  mockImporter.importedEntities.length = 0;
  mockImporter.lastOwnedGeometry = undefined;
  mockImporter.mutateEnvironment = false;
  mockImporter.stageOwnedResources = false;
  mockImporter.load.mockClear();
  vi.spyOn(SceneJSONImporter, 'load').mockImplementation(
    mockImporter.load as any,
  );
});

describe('LevelSystem', () => {
  it('applies the composed perspective hero view to the browser camera', () => {
    const world = createLevelWorld();
    const applied = applySceneHeroCamera(world, {
      authoring: {
        composition: {
          review: { heroView: 'hero' },
        },
        views: [
          {
            fov: 38,
            id: 'hero',
            position: [4, 3, 6],
            projection: 'perspective',
            role: 'hero',
            target: [0, 1, 0],
          },
        ],
      },
    } as SceneDocument);

    expect(applied).toBe(true);
    expect(world.camera.position.toArray()).toEqual([4, 3, 6]);
    expect((world.camera as PerspectiveCamera).fov).toBe(38);
    expect(world.camera.userData.iwsdkSceneHeroView).toMatchObject({
      id: 'hero',
      target: [0, 1, 0],
    });
  });

  it('does not override the camera while an immersive session is presenting', () => {
    const world = createLevelWorld();
    world.renderer.xr.isPresenting = true;
    expect(
      applySceneHeroCamera(world, {
        authoring: {
          composition: { review: { heroView: 'hero' } },
          views: [
            {
              fov: 38,
              id: 'hero',
              position: [4, 3, 6],
              projection: 'perspective',
              role: 'hero',
              target: [0, 1, 0],
            },
          ],
        },
      } as SceneDocument),
    ).toBe(false);
    expect(world.camera.position.toArray()).toEqual([0, 0, 0]);
  });

  it('tags imported entities with the requested level id', async () => {
    const world = createLevelWorld();
    const levelUrl = '/levels/arena.iwsdk.scene.json';

    const loadPromise = world.loadLevel(levelUrl);
    world.update(0, 0);
    await loadPromise;

    expect(world.activeLevelId).toBe(levelUrl);
    expect(mockImporter.load).toHaveBeenCalledWith(
      world,
      levelUrl,
      world.activeLevel.value,
    );
    expect(mockImporter.importedEntities).toHaveLength(1);
    expect(mockImporter.importedEntities[0].getValue(LevelTag, 'id')).toBe(
      levelUrl,
    );
  });

  it('keeps the active level intact and rejects when a staged load fails', async () => {
    const world = createLevelWorld();
    const initialLoad = world.loadLevel('/levels/working.iwsdk.scene.json');
    world.update(0, 0);
    await initialLoad;

    const previousRoot = world.activeLevel.value;
    const previousObject = mockImporter.importedEntities[0].object3D;
    const sceneChildCount = world.scene.children.length;
    const loadError = new Error('fixture load failed');
    mockImporter.failWith = loadError;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const failedLoad = world.loadLevel('/levels/broken.iwsdk.scene.json');
    world.update(0, 0);

    await expect(failedLoad).rejects.toBe(loadError);
    expect(world.activeLevel.value).toBe(previousRoot);
    expect(world.activeLevelId).toBe('/levels/working.iwsdk.scene.json');
    expect(previousObject.parent).toBe(previousRoot.object3D);
    expect(world.scene.children).toHaveLength(sceneChildCount);
    expect(consoleError).toHaveBeenCalledWith(
      '[LevelSystem] Failed to load level',
      loadError,
    );
    consoleError.mockRestore();
  });

  it('restores the active environment and disposes staged resources after import failure', async () => {
    const world = createLevelWorld();
    const firstLoad = world.loadSceneDocument(makeEnvironmentScene(true, true));
    world.update(0, 0);
    await firstLoad;

    const previousRoot = world.activeLevel.value;
    const previousBackground = world.scene.background;
    expect(previousBackground).toBeInstanceOf(Color);
    expect((previousBackground as Color).getHexString()).toBe('111111');
    expect(world.renderer.toneMapping).toBe(ACESFilmicToneMapping);
    expect(world.renderer.toneMappingExposure).toBe(2);
    expect(world.renderer.shadowMap.enabled).toBe(true);

    mockImporter.stageOwnedResources = true;
    mockImporter.mutateEnvironment = true;
    const loadError = new Error('preload failed');
    mockImporter.failWith = loadError;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failedLoad = world.loadLevel('/levels/broken.iwsdk.scene.json');
    world.update(0, 0);
    const stagedGeometry = mockImporter.lastOwnedGeometry!;
    const disposeGeometry = vi.spyOn(stagedGeometry, 'dispose');

    await expect(failedLoad).rejects.toBe(loadError);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(world.activeLevel.value).toBe(previousRoot);
    expect(world.scene.background).toBe(previousBackground);
    expect(world.renderer.getClearAlpha()).toBe(1);
    expect(world.renderer.toneMapping).toBe(ACESFilmicToneMapping);
    expect(world.renderer.toneMappingExposure).toBe(2);
    expect(world.renderer.shadowMap.enabled).toBe(true);
    consoleError.mockRestore();
  });

  it('cleans up the previous scene resources and environment after replacement', async () => {
    const world = createLevelWorld();
    const initialBackground = world.scene.background;
    const firstLoad = world.loadSceneDocument(makeEnvironmentScene(true, true));
    world.update(0, 0);
    await firstLoad;

    const previousRoot = world.activeLevel.value;
    const mesh = previousRoot.object3D!.getObjectByName('owned-box') as Mesh;
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    expect(previousRoot.object3D!.userData.iwsdkSceneResources).toEqual({});
    expect(world.scene.background).toBe(initialBackground);

    const replacement = world.loadSceneDocument(makeEnvironmentScene());
    world.update(0, 0);
    await replacement;

    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(previousRoot.object3D).toBeUndefined();
    expect(world.scene.background).toBe(initialBackground);
    expect(world.renderer.getClearAlpha()).toBe(1);
    expect(world.renderer.toneMapping).toBe(NoToneMapping);
    expect(world.renderer.toneMappingExposure).toBe(1);
    expect(world.renderer.shadowMap.enabled).toBe(false);
  });

  it('uses environment components as the only authored dome and IBL sources', async () => {
    const world = createLevelWorld();
    const document = makeEnvironmentScene();
    document.components = {
      'com.iwsdk.components.DomeGradient': {},
      'com.iwsdk.components.IBLTexture': { src: 'room' },
    };
    const load = world.loadSceneDocument(document);
    world.update(0, 0);
    await load;

    expect(world.activeLevel.value.hasComponent(DomeGradient)).toBe(true);
    expect(world.activeLevel.value.hasComponent(IBLTexture)).toBe(true);
    expect(world.activeLevel.value.hasComponent(IBLGradient)).toBe(false);
  });

  it('does not inject background or IBL components when they are unauthored', async () => {
    const world = createLevelWorld();
    const document = makeEnvironmentScene();

    const load = world.loadSceneDocument(document);
    world.update(0, 0);
    await load;

    expect(world.activeLevel.value.hasComponent(DomeGradient)).toBe(false);
    expect(world.activeLevel.value.hasComponent(IBLGradient)).toBe(false);
  });

  it('uses explicit scene root components without restoring removed defaults', async () => {
    const world = createLevelWorld();
    const document = makeEnvironmentScene();
    document.components = {
      'com.iwsdk.components.DomeGradient': {
        equator: [0.4, 0.5, 0.6, 1],
        ground: [0.2, 0.25, 0.3, 1],
        intensity: 0.7,
        sky: [0.1, 0.2, 0.5, 1],
      },
    };

    const load = world.loadSceneDocument(document);
    world.update(0, 0);
    await load;

    const root = world.activeLevel.value;
    expect(root.hasComponent(DomeGradient)).toBe(true);
    expect(root.getValue(DomeGradient, 'intensity')).toBeCloseTo(0.7);
    expect(root.hasComponent(IBLGradient)).toBe(false);

    const emptyDocument = makeEnvironmentScene();
    emptyDocument.components = {};
    const emptyLoad = world.loadSceneDocument(emptyDocument);
    world.update(0, 0);
    await emptyLoad;

    expect(world.activeLevel.value.hasComponent(DomeGradient)).toBe(false);
    expect(world.activeLevel.value.hasComponent(IBLGradient)).toBe(false);
  });
});

function makeEnvironmentScene(
  configureRenderer = false,
  withAsset = false,
): SceneDocument {
  return {
    ...(!configureRenderer
      ? {}
      : {
          environment: {
            exposure: 2,
            shadows: true,
            toneMapping: 'aces' as const,
          },
        }),
    nodes: withAsset
      ? [
          {
            content: { asset: 'owned-box', type: 'asset' },
            id: 'owned-box',
          },
        ]
      : [],
    resources: {},
    units: 'meters',
    version: CURRENT_SCENE_VERSION,
  };
}

function createLevelWorld(): World {
  const world = new World();
  world.camera = new PerspectiveCamera();
  world.scene = new Scene();
  let clearAlpha = 1;
  world.renderer = {
    getClearAlpha: () => clearAlpha,
    setClearAlpha: (value: number) => {
      clearAlpha = value;
    },
    shadowMap: { enabled: false },
    toneMapping: NoToneMapping,
    toneMappingExposure: 1,
    xr: {},
  } as any;
  world.scene.background = new Color('#111111');
  const sharedGeometry = new BoxGeometry(1, 1, 1);
  const sharedMaterial = new MeshStandardMaterial();
  world.assets = {
    bounds: () => ({ min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }),
    instantiate: async () => new Mesh(sharedGeometry, sharedMaterial),
  } as any;

  world
    .registerComponent(Transform)
    .registerComponent(LevelTag)
    .registerComponent(LevelRoot)
    .registerComponent(DomeGradient)
    .registerComponent(DomeTexture)
    .registerComponent(IBLGradient)
    .registerComponent(IBLTexture);

  world.sceneEntity = world.createTransformEntity(world.scene);
  const initialLevelRoot = world.createTransformEntity(undefined, {
    parent: world.sceneEntity,
  });
  initialLevelRoot.object3D!.name = 'LevelRoot';
  initialLevelRoot.addComponent(LevelRoot);
  world.activeLevel = signal(initialLevelRoot);

  world.registerSystem(LevelSystem);

  return world;
}
