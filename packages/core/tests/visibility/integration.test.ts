/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CURRENT_SCENE_VERSION } from '@iwsdk/scene-composition';
import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';
import { World } from '../../src/ecs/world.js';
import { LevelComponentApplier } from '../../src/level/level-component-applier.js';
import { SceneJSONImporter } from '../../src/level/level-scene-json-importer.js';
import { LevelTag } from '../../src/level/level-tag.js';
import { Object3D, Scene } from '../../src/runtime/three.js';
import { Transform } from '../../src/transform/transform-component.js';
import {
  Visibility,
  VisibilitySystem,
} from '../../src/visibility/visibility.js';

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

describe('Visibility integration', () => {
  it('makes visibility intrinsic and keeps Object3D and ECS state in sync', () => {
    const world = createVisibilityWorld();
    const object = new Object3D();
    object.visible = false;

    const entity = world.createTransformEntity(object);

    expect(entity.hasComponent(Transform)).toBe(true);
    expect(entity.hasComponent(Visibility)).toBe(true);
    expect(entity.getValue(Visibility, 'isVisible')).toBe(false);
    expect(object.visible).toBe(false);

    object.visible = true;
    expect(entity.getValue(Visibility, 'isVisible')).toBe(true);

    entity.setValue(Visibility, 'isVisible', false);
    expect(object.visible).toBe(false);

    const dataEntity = world.createEntity();
    expect(dataEntity.hasComponent(Visibility)).toBe(false);
  });

  it('restores a writable Three.js property if Visibility is removed', () => {
    const world = createVisibilityWorld();
    const object = new Object3D();
    const entity = world.createTransformEntity(object);
    object.visible = false;

    entity.removeComponent(Visibility);
    object.visible = true;

    expect(object.visible).toBe(true);
  });

  it('updates rather than duplicates legacy intrinsic components', () => {
    const world = createVisibilityWorld();
    const entity = world.createTransformEntity(new Object3D());
    const components = {
      'com.iwsdk.components.Visibility': { isVisible: false },
    };

    LevelComponentApplier.applyComponents(entity, components, world, {
      strict: true,
    });
    expect(entity.hasComponent(Visibility)).toBe(true);
    expect(entity.object3D?.visible).toBe(false);

    LevelComponentApplier.removeComponents(entity, components);
    expect(entity.hasComponent(Visibility)).toBe(true);
    expect(entity.object3D?.visible).toBe(true);
  });

  it('gives canonical scene visibility precedence over legacy components', async () => {
    const world = createVisibilityWorld();
    world.assets = {
      bounds: () => undefined,
      instantiate: async () => new Object3D(),
    } as any;

    const result = await SceneJSONImporter.loadDocument(
      world,
      {
        nodes: [
          {
            components: {
              'com.iwsdk.components.Visibility': { isVisible: false },
            },
            content: { type: 'group' },
            id: 'canonical-wins',
            visible: true,
          },
        ],
        resources: {},
        units: 'meters',
        version: CURRENT_SCENE_VERSION,
      },
      world.activeLevel.value,
    );

    const imported = result.nodes.get('canonical-wins');
    expect(imported?.object.visible).toBe(true);
    expect(imported?.entity.getValue(Visibility, 'isVisible')).toBe(true);
  });
});

function createVisibilityWorld(): World {
  const world = new World();
  world
    .registerComponent(Transform)
    .registerComponent(Visibility)
    .registerComponent(LevelTag)
    .registerSystem(VisibilitySystem);

  world.scene = new Scene();
  world.sceneEntity = world.createTransformEntity(world.scene);
  const activeLevel = world.createTransformEntity(undefined, {
    parent: world.sceneEntity,
  });
  world.activeLevel = signal(activeLevel);
  return world;
}
