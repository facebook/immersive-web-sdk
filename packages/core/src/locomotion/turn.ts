/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AxesState, InputComponent } from '@iwsdk/xr-input';
import { Types } from '../ecs/component.js';
import { createSystem } from '../ecs/system.js';
import { Group, Mesh, Vector3 } from '../runtime/index.js';
import { BeveledCylinderGeometry } from './geometries/beveled-cylinder.js';

const unitVector = new Vector3(1, 1, 1);

export enum TurningMethod {
  SnapTurn = 1,
  SmoothTurn = 2,
}

/**
 * Player yaw rotation via snap or smooth turning.
 *
 * @remarks
 * - When snap turning is active, visual turn signals render on the right ray
 *   and respond to thumbstick left/right or hand micro‑gestures (if enabled).
 * - Smooth turning applies a continuous yaw at `turningSpeed` degrees/second.
 *
 * @category Locomotion
 */
export class TurnSystem extends createSystem(
  {},
  {
    /** Choose snap or smooth turning. */
    turningMethod: { type: Types.Int8, default: TurningMethod.SnapTurn },
    /** Degrees to rotate per snap. */
    turningAngle: { type: Types.Float32, default: 45 },
    /** Degrees per second when smooth turning. */
    turningSpeed: { type: Types.Float32, default: 180 },
    /** Enable swipe‑gesture turning in hand‑tracking mode. */
    microGestureControlsEnabled: { type: Types.Boolean, default: false },
  },
) {
  private turnSignals = new Group();
  private leftSignal = new Mesh(
    new BeveledCylinderGeometry(0.004, 0.012, 0.022, 4, 0.004).rotateZ(
      Math.PI / 2,
    ),
  );
  private rightSignal = new Mesh(
    new BeveledCylinderGeometry(0.004, 0.012, 0.022, 4, 0.004).rotateZ(
      -Math.PI / 2,
    ),
  );
  private playerHeadPosition = new Vector3();

  init() {
    this.turnSignals.add(this.leftSignal, this.rightSignal);
    this.leftSignal.position.set(-0.015, 0.02, 0);
    this.rightSignal.position.set(0.055, 0.02, 0);
    this.cleanupFuncs.push(
      this.config.turningMethod.subscribe((value) => {
        if (value === TurningMethod.SmoothTurn) {
          this.turnSignals.removeFromParent();
        } else {
          this.player.raySpaces.right.add(this.turnSignals);
        }
      }),
    );
  }

  destroy(): void {
    super.destroy();
    this.turnSignals.removeFromParent();
  }

  update(delta: number): void {
    if (this.config.turningMethod.value === TurningMethod.SmoothTurn) {
      this.updateSmooth(delta);
    } else {
      this.updateSnap(delta);
    }
  }

  private updateSmooth(delta: number): void {
    const state = this.input.gamepads.right?.getAxesState(
      InputComponent.Thumbstick,
    );
    const turningSpeedRadian = (this.config.turningSpeed.value / 180) * Math.PI;
    if (state === AxesState.Left) {
      this.player.rotateY(turningSpeedRadian * delta);
    } else if (state === AxesState.Right) {
      this.player.rotateY(-turningSpeedRadian * delta);
    }
  }

  private updateSnap(delta: number): void {
    let turningLeft = false;
    let turningRight = false;
    const gamepad = this.input.gamepads.right;
    const turningAngleRadian = (this.config.turningAngle.value / 180) * Math.PI;
    if (this.input.isPrimary('hand', 'right')) {
      // Show and listen only if micro-gesture controls are enabled
      const enabled = this.config.microGestureControlsEnabled.value;
      this.turnSignals.visible = !!enabled;
      if (enabled) {
        this.player.head.getWorldPosition(this.playerHeadPosition);
        this.turnSignals.lookAt(this.playerHeadPosition);
        turningLeft = gamepad?.getButtonDownByIdx(5) || false;
        turningRight = gamepad?.getButtonDownByIdx(6) || false;
      }
    } else {
      this.turnSignals.visible = false;
      turningLeft =
        gamepad?.getAxesEnteringLeft(InputComponent.Thumbstick) || false;
      turningRight =
        gamepad?.getAxesEnteringRight(InputComponent.Thumbstick) || false;
    }
    if (turningLeft) {
      this.player.rotateY(turningAngleRadian);
      if (this.turnSignals.visible) {
        this.leftSignal.scale.setScalar(1.5);
      }
    } else if (turningRight) {
      this.player.rotateY(-turningAngleRadian);
      if (this.turnSignals.visible) {
        this.rightSignal.scale.setScalar(1.5);
      }
    }
    if (this.turnSignals.visible) {
      this.leftSignal.scale.lerp(unitVector, 5 * delta);
      this.rightSignal.scale.lerp(unitVector, 5 * delta);
    }
  }
}
