/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  SceneBuiltinEntity,
  ScenePlayerRig,
  ScenePlayerTarget,
  SceneTransform,
} from '@iwsdk/scene-composition';
import type { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import { MathUtils } from '../runtime/index.js';
import { LevelComponentApplier } from './level-component-applier.js';
import { applySceneTransform } from './level-scene-object.js';

interface AppliedPlayerRigState {
  baseline: SceneTransform | undefined;
  resolveEntityReference?: (reference: unknown) => Entity | undefined;
  rig?: ScenePlayerRig;
}

export interface ApplyScenePlayerRigOptions {
  resolveEntityReference?: (reference: unknown) => Entity | undefined;
}

const appliedPlayerRigs = new WeakMap<World, AppliedPlayerRigState>();

/** Reconcile scene-authored components on persistent player-rig entities. */
export function applyScenePlayerRig(
  world: World,
  nextRig: ScenePlayerRig | undefined,
  options: ApplyScenePlayerRigOptions = {},
): void {
  const state = appliedPlayerRigs.get(world) ?? createPlayerRigState(world);
  const previousRig = state.rig;
  removePlayerRigComponents(world, previousRig);
  restorePlayerTransform(world, state.baseline);
  try {
    applyPlayerRig(world, nextRig, options.resolveEntityReference);
    syncLocomotionPlayerPosition(world);
    state.rig = nextRig == null ? undefined : structuredClone(nextRig);
    state.resolveEntityReference = options.resolveEntityReference;
    appliedPlayerRigs.set(world, state);
  } catch (error) {
    removePlayerRigComponents(world, nextRig);
    restorePlayerTransform(world, state.baseline);
    applyPlayerRig(world, previousRig, state.resolveEntityReference);
    syncLocomotionPlayerPosition(world);
    throw error;
  }
}

function applyPlayerRig(
  world: World,
  rig: ScenePlayerRig | undefined,
  resolveEntityReference:
    | ((reference: unknown) => Entity | undefined)
    | undefined,
): void {
  if (world.playerEntity?.object3D != null) {
    applySceneTransform(world.playerEntity.object3D, rig?.transform);
  }
  for (const [label, entity, descriptor] of playerRigTargets(world, rig)) {
    if (descriptor?.components == null) {
      continue;
    }
    LevelComponentApplier.applyComponents(
      entity,
      descriptor.components,
      world,
      {
        nodeId: `$player/${label}`,
        resolveEntityReference,
        strict: true,
      },
    );
  }
}

function createPlayerRigState(world: World): AppliedPlayerRigState {
  return {
    baseline:
      world.playerEntity?.object3D == null
        ? undefined
        : captureTransform(world.playerEntity),
  };
}

function captureTransform(entity: Entity): SceneTransform {
  const object = entity.object3D!;
  return {
    position: object.position.toArray(),
    rotationDeg: [
      MathUtils.radToDeg(object.rotation.x),
      MathUtils.radToDeg(object.rotation.y),
      MathUtils.radToDeg(object.rotation.z),
    ],
    scale: object.scale.toArray(),
  };
}

function restorePlayerTransform(
  world: World,
  baseline: SceneTransform | undefined,
) {
  if (world.playerEntity?.object3D != null && baseline != null) {
    applySceneTransform(world.playerEntity.object3D, baseline);
  }
}

function syncLocomotionPlayerPosition(world: World): void {
  const player = world.playerEntity?.object3D;
  if (player == null) {
    return;
  }
  world.setAuthoredPlayerPosition(player.position);
}

function removePlayerRigComponents(
  world: World,
  rig: ScenePlayerRig | undefined,
): void {
  for (const [, entity, descriptor] of playerRigTargets(world, rig)) {
    LevelComponentApplier.removeComponents(entity, descriptor?.components);
  }
}

function playerRigTargets(
  world: World,
  rig: ScenePlayerRig | undefined,
): Array<[ScenePlayerTarget, Entity, SceneBuiltinEntity | undefined]> {
  const spaces = world.playerSpaceEntities;
  const targets: Array<
    [ScenePlayerTarget, Entity | undefined, SceneBuiltinEntity | undefined]
  > = [
    ['player', world.playerEntity, rig],
    ['camera', world.cameraEntity, rig?.camera],
    ['head', world.playerHeadEntity, rig?.head],
    ['left-target-ray', spaces?.raySpaces.left, rig?.leftTargetRay],
    ['right-target-ray', spaces?.raySpaces.right, rig?.rightTargetRay],
    ['left-grip', spaces?.gripSpaces.left, rig?.leftGrip],
    ['right-grip', spaces?.gripSpaces.right, rig?.rightGrip],
  ];
  return targets.filter(
    (
      entry,
    ): entry is [ScenePlayerTarget, Entity, SceneBuiltinEntity | undefined] =>
      entry[1]?.object3D != null,
  );
}

/** Resolve one persistent runtime player-space entity. */
export function getScenePlayerTargetEntity(
  world: World,
  target: ScenePlayerTarget,
): Entity {
  const match = playerRigTargets(world, undefined).find(
    ([candidate]) => candidate === target,
  );
  if (match == null) {
    throw new Error(`Player-space target "${target}" is unavailable`);
  }
  return match[1];
}
