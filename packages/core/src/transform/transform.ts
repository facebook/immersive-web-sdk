/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity, NullEntity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import { LevelTag } from '../level/index.js';
import { Quaternion, Vector3, Euler } from '../runtime/three.js';
import { SyncedEuler } from './synced-euler.js';
import { SyncedQuaternion } from './synced-quaternion.js';
import { SyncedVector3 } from './synced-vector3.js';
import { Transform } from './transform-component.js';

export { Transform } from './transform-component.js';

function attachToEntity(entity: Entity): void {
  const object3D = entity.object3D;
  if (!object3D) {
    return;
  }
  if ((object3D as any).__transformAttached) {
    return;
  }
  (object3D as any).__transformAttached = true;

  object3D.entityIdx = entity.index;
  object3D.positionView = entity.getVectorView(
    Transform,
    'position',
  ) as Float32Array;
  object3D.quaternionView = entity.getVectorView(
    Transform,
    'orientation',
  ) as Float32Array;
  object3D.scaleView = entity.getVectorView(Transform, 'scale') as Float32Array;

  // if component values contains NaN, keep original values instead
  if (object3D.positionView.some(Number.isNaN)) {
    object3D.position.toArray(object3D.positionView);
  }
  if (object3D.quaternionView.some(Number.isNaN)) {
    object3D.quaternion.toArray(object3D.quaternionView);
  }
  if (object3D.scaleView.some(Number.isNaN)) {
    object3D.scale.toArray(object3D.scaleView);
  }

  Object.defineProperty(object3D, 'position', {
    value: new SyncedVector3().setTarget(object3D.positionView),
    writable: false,
    configurable: true,
    enumerable: true,
  });

  const syncedQuat = new SyncedQuaternion().setTarget(object3D.quaternionView);

  Object.defineProperty(object3D, 'quaternion', {
    value: syncedQuat,
    writable: false,
    configurable: true,
    enumerable: true,
  });

  // Replace rotation with SyncedEuler that stays in sync with the quaternion
  Object.defineProperty(object3D, 'rotation', {
    value: new SyncedEuler()
      .copy(object3D.rotation)
      .setSyncedQuaternion(syncedQuat),
    writable: false,
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(object3D, 'scale', {
    value: new SyncedVector3().setTarget(object3D.scaleView),
    writable: false,
    configurable: true,
    enumerable: true,
  });

  object3D._parent = object3D.parent; // save original parent
  Object.defineProperty(object3D, 'parent', {
    get: () => {
      return object3D._parent;
    },
    set: (value) => {
      object3D._parent = value;
      Transform.data.parent[entity.index] = value?.entityIdx ?? NullEntity;
    },
    configurable: true,
    enumerable: true,
  });
}

function detachFromEntity(entity: Entity): void {
  const object3D = entity.object3D;
  if (!object3D) {
    return;
  }
  if (!(object3D as any).__transformAttached) {
    return;
  }

  delete object3D.entityIdx;
  delete object3D.positionView;
  delete object3D.quaternionView;
  delete object3D.scaleView;

  Object.defineProperty(object3D, 'position', {
    value: new Vector3().copy(object3D.position),
    writable: false,
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(object3D, 'quaternion', {
    value: new Quaternion().copy(object3D.quaternion),
    writable: false,
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(object3D, 'rotation', {
    value: new Euler().copy(object3D.rotation),
    writable: false,
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(object3D, 'scale', {
    value: new Vector3().copy(object3D.scale),
    writable: false,
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(object3D, 'parent', {
    value: object3D._parent,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  delete object3D._parent;
  delete (object3D as any).__transformAttached;
}

/**
 * Keeps Object3D and Transform component in sync and manages parenting.
 *
 * @remarks
 * - Replaces Object3D accessors with synced views for fast ECS writes.
 * - Ensures entities without an explicit `parent` attach to the level root
 *   (or the scene for persistent objects).
 * - If an Object3D is manually reparented under another entity, the component
 *   `parent` value is updated to match.
 *
 * @category Scene
 */
export class TransformSystem extends createSystem({
  transform: { required: [Transform] },
}) {
  init(): void {
    this.queries.transform.subscribe('qualify', attachToEntity);
    this.queries.transform.subscribe('disqualify', detachFromEntity);
  }

  update(): void {
    this.queries.transform.entities.forEach((entity) => {
      const object = entity.object3D;
      if (!object || object === this.world.scene) {
        return;
      }
      const parentEntity = entity.getValue(Transform, 'parent');
      const parentObject = parentEntity?.object3D;

      if (!parentObject) {
        // no valid parent specified in Transform
        if (object.parent?.entityIdx !== undefined) {
          // check whether object is already parented under an entity, if so, update parent in Transform
          Transform.data.parent[entity.index] = object.parent.entityIdx;
        } else {
          // Default parent: active level if entity has LevelTag; otherwise scene (persistent)
          const targetEntity = entity.hasComponent(LevelTag)
            ? this.world.activeLevel.value
            : this.world.sceneEntity;
          console.warn(
            `Entity ${entity.index} is being parented under ${entity.hasComponent(LevelTag) ? 'active level root' : 'scene root'} by default because it doesn't have a valid parent entity.`,
          );
          targetEntity.object3D!.add(object);
          entity.setValue(Transform, 'parent', targetEntity);
        }
      } else if (parentObject !== object.parent) {
        // parent changed in Transform
        parentObject.add(object);
      }
    });
  }
}
