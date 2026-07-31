/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { createComponent, Types } from '../../src/ecs/component.js';
import { World } from '../../src/ecs/world.js';
import { applyScenePlayerRig } from '../../src/level/level-player-rig.js';
import { Object3D } from '../../src/runtime/index.js';

const PlayerMarker = createComponent('PlayerMarker', {
  label: { default: '', type: Types.String },
});

describe('scene player rig', () => {
  it('reconciles scene-authored components on persistent player spaces', () => {
    const world = new World();
    world.registerComponent(PlayerMarker);
    world.playerEntity = world.createTransformEntity(new Object3D());
    world.cameraEntity = world.createTransformEntity(new Object3D());
    world.playerHeadEntity = world.createTransformEntity(new Object3D());
    world.playerSpaceEntities = {
      head: world.playerHeadEntity,
      raySpaces: {
        left: world.createTransformEntity(new Object3D()),
        right: world.createTransformEntity(new Object3D()),
      },
      gripSpaces: {
        left: world.createTransformEntity(new Object3D()),
        right: world.createTransformEntity(new Object3D()),
      },
      indexTipSpaces: {
        left: world.createTransformEntity(new Object3D()),
        right: world.createTransformEntity(new Object3D()),
      },
    };
    const setPlayerPosition = vi.fn();
    world.onAuthoredPlayerPosition(setPlayerPosition);

    applyScenePlayerRig(world, {
      leftTargetRay: {
        components: { PlayerMarker: { label: 'ray' } },
      },
    });
    expect(
      world.playerSpaceEntities.raySpaces.left.getValue(PlayerMarker, 'label'),
    ).toBe('ray');

    applyScenePlayerRig(world, {
      transform: {
        position: [3, 0, -2],
        rotationDeg: [0, 90, 0],
      },
      rightGrip: {
        components: { PlayerMarker: { label: 'grip' } },
      },
    });
    expect(
      world.playerSpaceEntities.raySpaces.left.hasComponent(PlayerMarker),
    ).toBe(false);
    expect(
      world.playerSpaceEntities.gripSpaces.right.getValue(
        PlayerMarker,
        'label',
      ),
    ).toBe('grip');
    expect(
      world.playerSpaceEntities.gripSpaces.right.object3D?.position.toArray(),
    ).toEqual([0, 0, 0]);
    expect(world.playerEntity.object3D?.position.toArray()).toEqual([3, 0, -2]);
    expect(setPlayerPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 3, y: 0, z: -2 }),
    );

    applyScenePlayerRig(world, undefined);
    expect(world.playerEntity.object3D?.position.toArray()).toEqual([0, 0, 0]);
    expect(setPlayerPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 0, y: 0, z: 0 }),
    );
  });
});
