/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { HandleOptions, HandleStore } from '@pmndrs/handle';
import { Types, createComponent } from '../ecs/component.js';
import { Object3D, Quaternion, Vector3 } from '../runtime/index.js';

export const Handle = createComponent(
  'Handle',
  {
    instance: { type: Types.Object, default: undefined },
  },
  'Internal component storing an active interaction handle instance',
);

/** MovementMode for {@link DistanceGrabbable}. @category Grab */
export const MovementMode = {
  /** Object smoothly moves with the ray cast end point of the grabbing controller. */
  MoveFromTarget: 'MoveFromTarget',
  /** Object smoothly moves toward the input source that's grabbing. */
  MoveTowardsTarget: 'MoveTowardsTarget',
  /** Object moves relative to controller delta movement while maintaining distance. */
  MoveAtSource: 'MoveAtSource',
  /** Object rotates in place without translation or scaling. */
  RotateAtSource: 'RotateAtSource',
};

export class DistanceGrabHandle<T> extends HandleStore<T> {
  private previousPointerOrigin: Vector3 | undefined;
  private isSnapped: boolean = false;
  private static SNAP_THRESHOLD = 0.005;
  private static MOVE_SPEED_SCALE = 100;
  private static _tmp = new Vector3();
  private static _tmpQuat = new Quaternion();
  private static _posHelper = new Vector3();
  private static _quatHelper = new Quaternion();
  private static _offsetPosHelper = new Vector3();
  private static _offsetQuatHelper = new Quaternion();

  constructor(
    readonly target_: Object3D | { current?: Object3D | null },
    readonly sceneRoot_: Object3D,
    public readonly getOptions: () => HandleOptions<T> = () => ({}),
    public readonly movementMode: string,
    public readonly returnToOrigin: boolean,
    public readonly moveSpeedFactor: number = 0.1,
    public readonly targetPosOffset: Vector3 = new Vector3(0, 0, 0),
    public readonly targetQuatOffset: Quaternion = new Quaternion(0, 0, 0, 1),
    public readonly detachOnGrab: boolean,
  ) {
    super(target_, getOptions);

    this.targetQuatOffset.normalize();
  }

  update(time: number) {
    const target = this.getTarget();

    if (this.inputState.size === 0) {
      // No active pointers: the grab was released, cancelled, or
      // force-released. Clear transient snap state so the next grab starts
      // unsnapped. This replaces the constructor's 'pointerup' DOM listener,
      // which was never removed (a listener leak) and also missed
      // forceRelease()/cancel() (which don't fire a DOM pointerup).
      this.isSnapped = false;
    }

    if (
      target == null ||
      this.inputState.size === 0 ||
      (this.latestMoveEvent == null &&
        (this.getOptions().alwaysUpdate ?? false) === false)
    ) {
      if (this.previousPointerOrigin != undefined) {
        this.previousPointerOrigin = undefined;
      }
      return;
    }

    if (this.detachOnGrab && target.parent != this.sceneRoot_) {
      this.sceneRoot_.attach(target);
    }

    if (
      this.movementMode === MovementMode.RotateAtSource ||
      this.movementMode === MovementMode.MoveFromTarget
    ) {
      super.update(time);
      return;
    }

    const pointerAmount = this.inputState.size;
    target.getWorldPosition(DistanceGrabHandle._posHelper);
    target.getWorldQuaternion(DistanceGrabHandle._quatHelper);
    const position = target.position;
    const quaternion = target.quaternion;
    const rotation = target.rotation;
    const scale = target.scale;

    switch (this.movementMode) {
      case MovementMode.MoveAtSource: {
        const [p1] = this.inputState.values();
        const current = p1.pointerWorldOrigin;
        if (this.previousPointerOrigin != undefined) {
          const delta = DistanceGrabHandle._tmp
            .copy(current)
            .sub(this.previousPointerOrigin);
          DistanceGrabHandle._posHelper.add(delta);
        } else {
          this.previousPointerOrigin = new Vector3().copy(current);
        }
        // Update stored previous for next frame
        this.previousPointerOrigin!.copy(current);
        break;
      }
      case MovementMode.MoveTowardsTarget: {
        const [p1] = this.inputState.values();
        const pointerOrigin = p1.pointerWorldOrigin;
        const pointerQuaternion = p1.pointerWorldQuaternion;

        // Calculate target position by applying position offset in pointer's local space
        const targetPosition = DistanceGrabHandle._offsetPosHelper
          .copy(this.targetPosOffset)
          .applyQuaternion(pointerQuaternion)
          .add(pointerOrigin);

        // Calculate target rotation by multiplying pointer rotation with rotation offset
        const targetQuaternion = DistanceGrabHandle._offsetQuatHelper
          .copy(pointerQuaternion)
          .multiply(this.targetQuatOffset);

        const distance = targetPosition.distanceTo(
          DistanceGrabHandle._posHelper,
        );

        if (!this.isSnapped && distance > DistanceGrabHandle.SNAP_THRESHOLD) {
          DistanceGrabHandle._posHelper.lerp(
            targetPosition,
            this.moveSpeedFactor * time * DistanceGrabHandle.MOVE_SPEED_SCALE,
          );
          DistanceGrabHandle._quatHelper.slerp(
            targetQuaternion,
            this.moveSpeedFactor * time * DistanceGrabHandle.MOVE_SPEED_SCALE,
          );
        } else {
          if (!this.isSnapped) {
            this.isSnapped = true;
          }
          DistanceGrabHandle._posHelper.copy(targetPosition);
          DistanceGrabHandle._quatHelper.copy(targetQuaternion);
        }

        break;
      }
    }

    // Convert world space transforms to local space
    if (target.parent) {
      // Get parent's inverse world matrix
      const parentWorldMatrixInverse = target.parent.matrixWorld
        .clone()
        .invert();

      // Transform desired world position to local space
      position
        .copy(DistanceGrabHandle._posHelper)
        .applyMatrix4(parentWorldMatrixInverse);

      // Transform desired world quaternion to local space
      const parentWorldQuaternionInverse = target.parent
        .getWorldQuaternion(DistanceGrabHandle._tmpQuat)
        .invert();
      quaternion
        .copy(DistanceGrabHandle._quatHelper)
        .premultiply(parentWorldQuaternionInverse);
    } else {
      // No parent, world space = local space
      position.copy(DistanceGrabHandle._posHelper);
      quaternion.copy(DistanceGrabHandle._quatHelper);
    }

    // Always apply during drag; if returnToOrigin is true,
    // the override in apply() will snap back on release.
    this.outputState.update(this.latestMoveEvent, {
      pointerAmount,
      position,
      quaternion,
      rotation,
      scale,
      time,
    });
    this.outputState.memo = this.apply(target);
    this.latestMoveEvent = undefined;
  }

  protected apply(target: Object3D): T {
    // On release (last frame), if configured to return to origin,
    // restore the initially saved transform instead of leaving the final drag state.
    if (this.returnToOrigin && (this as any).outputState?.last) {
      target.position.copy(this.initialTargetPosition);
      // Keep rotation order consistent when restoring
      target.rotation.order = (this as any).initialTargetRotation.order;
      target.quaternion.copy(this.initialTargetQuaternion);
      target.scale.copy(this.initialTargetScale);
      // Do not call super.apply to avoid re-applying the drag transform.
      return undefined as unknown as T;
    }
    return super.apply(target);
  }
}
