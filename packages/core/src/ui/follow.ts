/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent, createSystem } from '../ecs/index.js';
import {
  Euler,
  MathUtils,
  Object3D,
  Quaternion,
  Vector3,
} from '../runtime/index.js';

/** Behavior modes for {@link Follower}. @category UI */
export const FollowBehavior = {
  FaceTarget: 'face-target',
  PivotY: 'pivot-y',
  NoRotation: 'no-rotation',
};

/**
 * Makes an entity follow a target `Object3D` with optional rotation behavior.
 *
 * @remarks
 * - `PivotY` keeps the follower level while rotating around the Y axis to face the target.
 * - `FaceTarget` fully rotates to look at the target.
 * - `NoRotation` only moves position.
 *
 * @example Attach to an entity to follow the HMD at shoulder‑height
 * ```ts
 * entity.addComponent(Follower, {
 *   target: xrRig.head,
 *   offsetPosition: [0.25, -0.2, -0.35],
 *   behavior: FollowBehavior.PivotY,
 *   speed: 5,
 *   tolerance: 0.3,
 * })
 * ```
 * @category UI
 */
export const Follower = createComponent(
  'Follower',
  {
    /** Object to follow (e.g., `world.player.head`). */
    target: { type: Types.Object, default: undefined },
    /** Offset from the target in the target's local space. */
    offsetPosition: { type: Types.Vec3, default: [0, 0, 0] },
    behavior: {
      type: Types.Enum,
      enum: FollowBehavior,
      default: FollowBehavior.PivotY,
    },
    /** Degrees of allowable angular deviation before target snaps forward. */
    maxAngle: { type: Types.Float32, default: 30 },
    /** Meters of allowable positional slack before catching up. */
    tolerance: { type: Types.Float32, default: 0.4 },
    /** Lerp speed towards the target position. */
    speed: { type: Types.Float32, default: 1 },
    /** Internal: one‑time sync to jump to the target position. */
    needsPositionSync: { type: Types.Boolean, default: true },
    /** Internal: smoothed follow target in world space. */
    _followTarget: { type: Types.Vec3, default: [0, 0, 0] },
  },
  'Component for following another object',
);

/**
 * Updates entities with {@link Follower} to chase a target using smoothed motion,
 * with constraints on angle and distance.
 *
 * @category UI
 */
export class FollowSystem extends createSystem({
  follower: { required: [Follower] },
}) {
  private followTarget = new Vector3();
  private strictFollowTarget = new Vector3();
  private deltaVec3 = new Vector3();
  private targetPosition = new Vector3();
  private followerPosition = new Vector3();
  private targetForward = new Vector3();
  private quat = new Quaternion();
  private euler = new Euler();

  update(delta: number): void {
    this.queries.follower.entities.forEach((entity) => {
      const object = entity.object3D;
      const target = entity.getValue(Follower, 'target') as Object3D;
      if (!object || !target || !object.parent) {
        return;
      }
      const followTargetVecView = entity.getVectorView(
        Follower,
        '_followTarget',
      );
      this.followTarget.fromArray(followTargetVecView);
      const behavior = entity.getValue(Follower, 'behavior');
      const offsetPosition = entity.getVectorView(Follower, 'offsetPosition');
      target.getWorldQuaternion(this.quat);
      target.getWorldPosition(this.targetPosition);
      if (behavior === FollowBehavior.PivotY) {
        this.euler.setFromQuaternion(this.quat, 'YXZ');
        this.euler.x = 0;
        this.euler.z = 0;
        this.quat.setFromEuler(this.euler);
      }
      this.strictFollowTarget
        .fromArray(offsetPosition)
        .applyQuaternion(this.quat)
        .add(this.targetPosition);
      this.targetForward.set(0, 0, -1).applyQuaternion(this.quat);
      object.getWorldPosition(this.deltaVec3).sub(this.targetPosition);
      if (behavior === FollowBehavior.PivotY) {
        this.targetForward.y = 0;
        this.deltaVec3.y = 0;
        this.strictFollowTarget.y = this.targetPosition.y;
      }
      if (entity.getValue(Follower, 'needsPositionSync')) {
        object.position
          .copy(this.strictFollowTarget)
          .toArray(followTargetVecView);
        entity.setValue(Follower, 'needsPositionSync', false);
      } else {
        const distance = object.parent
          .worldToLocal(this.strictFollowTarget)
          .distanceTo(this.followTarget);
        const deltaAngle = MathUtils.radToDeg(
          Math.acos(
            this.targetForward.normalize().dot(this.deltaVec3.normalize()),
          ),
        );
        if (
          distance > entity.getValue(Follower, 'tolerance')! ||
          deltaAngle > entity.getValue(Follower, 'maxAngle')!
        ) {
          this.followTarget
            .copy(this.strictFollowTarget)
            .toArray(followTargetVecView);
        }
        const speed = entity.getValue(Follower, 'speed');
        object.position.lerp(this.followTarget, delta * speed!);
      }
      if (
        behavior === FollowBehavior.FaceTarget ||
        behavior === FollowBehavior.PivotY
      ) {
        if (behavior === FollowBehavior.PivotY) {
          this.targetPosition.y = object.getWorldPosition(
            this.followerPosition,
          ).y;
        }
        object.lookAt(this.targetPosition);
      }
    });
  }
}
