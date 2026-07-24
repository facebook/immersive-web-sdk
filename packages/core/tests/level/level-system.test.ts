/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { signal } from '@preact/signals-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '../../src/ecs/world.js';
import { LevelRoot } from '../../src/level/level-root.js';
import { LevelSystem } from '../../src/level/level-system.js';
import { LevelTag } from '../../src/level/level-tag.js';
import { Object3D, PerspectiveCamera, Scene } from '../../src/runtime/three.js';
import { Transform } from '../../src/transform/transform.js';

const mockImporter = vi.hoisted(() => ({
  importedEntities: [] as any[],
  load: vi.fn(async (world: World, _url: string, parentEntity: any) => {
    const imported = world.createTransformEntity(new Object3D(), parentEntity);
    mockImporter.importedEntities.push(imported);
  }),
}));

vi.mock('../../src/level/level-glxf-importer.js', () => ({
  GLXFImporter: {
    load: mockImporter.load,
  },
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
  mockImporter.importedEntities.length = 0;
  mockImporter.load.mockClear();
});

describe('LevelSystem', () => {
  it('tags imported entities with the requested level id', async () => {
    const world = createLevelWorld();
    const levelUrl = '/levels/arena.glxf';

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
});

function createLevelWorld(): World {
  const world = new World();
  world.camera = new PerspectiveCamera();
  world.scene = new Scene();
  world.renderer = { xr: {} } as any;

  world
    .registerComponent(Transform)
    .registerComponent(LevelTag)
    .registerComponent(LevelRoot);

  world.sceneEntity = world.createTransformEntity(world.scene);
  const initialLevelRoot = world.createTransformEntity(undefined, {
    parent: world.sceneEntity,
  });
  initialLevelRoot.object3D!.name = 'LevelRoot';
  initialLevelRoot.addComponent(LevelRoot);
  world.activeLevel = signal(initialLevelRoot);

  world.registerSystem(LevelSystem, {
    configData: { defaultLighting: false },
  });

  return world;
}
