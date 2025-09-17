/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { HandleOptions, HandleStore } from '@pmndrs/handle';
import { Types, createComponent } from '../ecs/index.js';
import { Object3D, Vector3 } from '../runtime/index.js';

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
  private static _tmp = new Vector3();

  constructor(
    readonly target_: Object3D | { current?: Object3D | null },
    public readonly getOptions: () => HandleOptions<T> = () => ({}),
    public readonly movementMode: string,
    public readonly returnToOrigin: Boolean,
    public readonly moveSpeed: number = 0.1,
  ) {
    super(target_, getOptions);
  }

  update(time: number) {
    if (
      this.movementMode === MovementMode.RotateAtSource ||
      this.movementMode === MovementMode.MoveFromTarget
    ) {
      super.update(time);
      return;
    }

    const target = this.getTarget();

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

    if (target.parent) {
      target.removeFromParent();
      target.matrixWorld.decompose(
        target.position,
        target.quaternion,
        target.scale,
      );
    }

    const pointerAmount = this.inputState.size;
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
          position.add(delta);
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
        const distance = pointerOrigin.distanceTo(position);

        if (distance > this.moveSpeed) {
          const step = DistanceGrabHandle._tmp
            .copy(pointerOrigin)
            .sub(position)
            .normalize()
            .multiplyScalar(this.moveSpeed);
          position.add(step);
        } else {
          position.set(pointerOrigin.x, pointerOrigin.y, pointerOrigin.z);
          quaternion.set(
            p1.pointerWorldQuaternion.x,
            p1.pointerWorldQuaternion.y,
            p1.pointerWorldQuaternion.z,
            p1.pointerWorldQuaternion.w,
          );
        }
        break;
      }
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
