/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';
import { World } from '../../src/ecs/world.js';
import { Object3D } from '../../src/runtime/index.js';

vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        arc: () => {},
        beginPath: () => {},
        clearRect: () => {},
        fill: () => {},
        stroke: () => {},
      }),
    }),
  };
});

describe('World scene node lookup', () => {
  it('finds authored objects and their owning entities by stable node id', () => {
    const world = new World();
    const root = new Object3D();
    const object = new Object3D();
    object.userData.iwsdkSceneNodeId = 'settings-panel';
    root.add(object);

    const entity = world.createEntity();
    entity.object3D = object;
    object.entityIdx = entity.index;
    world.activeLevel = signal({ object3D: root } as any);

    expect(world.getSceneObject('settings-panel')).toBe(object);
    expect(world.requireSceneObject('settings-panel')).toBe(object);
    expect(world.getSceneEntity('settings-panel')).toBe(entity);
    expect(world.requireSceneEntity('settings-panel')).toBe(entity);
    expect(world.getSceneObject('missing')).toBeUndefined();
    expect(() => world.requireSceneObject('missing')).toThrow(
      'Scene object "missing" was not found in the active level',
    );
  });
});
