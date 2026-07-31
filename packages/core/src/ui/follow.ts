/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem } from '../ecs/system.js';
import {
  Euler,
  MathUtils,
  Object3D,
  Quaternion,
  Vector3,
} from '../runtime/index.js';
import { FollowBehavior, Follower } from './follow-component.js';

export { FollowBehavior, Follower } from './follow-component.js';

/**
 * Angle in degrees from the dot product of two unit vectors, robust to
 * floating-point error. A normalized dot product can land slightly outside
 * [-1, 1] (e.g. 1.0000001), which makes `Math.acos` return `NaN`; that `NaN`
 * would then poison the follow re-target comparison. Clamp before `acos`.
 */
export function clampedAcosDeg(dot: number): number {
  return MathUtils.radToDeg(Math.acos(MathUtils.clamp(dot, -1, 1)));
}

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
        const deltaAngle = clampedAcosDeg(
          this.targetForward.normalize().dot(this.deltaVec3.normalize()),
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
