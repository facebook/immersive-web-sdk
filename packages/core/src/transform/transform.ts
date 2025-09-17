/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Types,
  createComponent,
  Entity,
  NullEntity,
  createSystem,
} from '../ecs/index.js';
import { LevelTag } from '../level/index.js';
import { Quaternion, Vector3 } from '../runtime/three.js';
import { SyncedQuaternion } from './synced-quaternion.js';
import { SyncedVector3 } from './synced-vector3.js';

/**
 * 3D transform component that binds an entity to a Three.js Object3D.
 *
 * @remarks
 * - The {@link TransformSystem} wires Object3D.position/quaternion/scale to
 *   component views for zero‑copy updates and parenting.
 * - Default values are `NaN` so an existing Object3D keeps its initial transform
 *   unless a value is explicitly written by code or GLXF.
 * - Set `parent` to reparent under another entity. When unset, entities are
 *   automatically parented under the active level root (or scene if persistent).
 *
 * @category Scene
 * @hideineditor
 */
export const Transform = createComponent(
  'Transform',
  {
    position: { type: Types.Vec3, default: [NaN, NaN, NaN] }, // Local position [x,y,z]; NaN preserves Object3D value
    orientation: { type: Types.Vec4, default: [NaN, NaN, NaN, NaN] }, // Local rotation quaternion [x,y,z,w]; NaN preserves
    scale: { type: Types.Vec3, default: [NaN, NaN, NaN] }, // Local scale [x,y,z]; NaN preserves
    parent: { type: Types.Entity, default: undefined as any }, // Parent entity for hierarchy (defaults to level root)
  },
  'Component for 3D transformation (position, rotation, scale)',
);

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

  Object.defineProperty(object3D, 'quaternion', {
    value: new SyncedQuaternion().setTarget(object3D.quaternionView),
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
