/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector3 } from 'three';

export interface MovementConfig {
  acceleration: number;
  deceleration: number;
  airDragFactor: number;
  maxWalkSpeed: number;
}

/**
 * Handles movement input processing and velocity management
 * Reuses temporary vectors for performance
 */
export class MovementController {
  private targetVelocity = new Vector3();
  private velocityOnPlane = new Vector3();
  private deltaVelocity = new Vector3();
  private upAxis = new Vector3(0, 1, 0);

  constructor(private config: MovementConfig) {}

  /**
   * Handle movement input and apply acceleration/deceleration
   * Modifies playerVelocity in-place for performance
   */
  handleMovementInput(
    movementVector: Vector3,
    playerVelocity: Vector3,
    isGrounded: boolean,
    delta: number,
  ): void {
    if (movementVector.lengthSq() > 0) {
      this.targetVelocity.copy(movementVector);

      this.velocityOnPlane.copy(playerVelocity).projectOnPlane(this.upAxis);

      this.deltaVelocity.subVectors(this.targetVelocity, this.velocityOnPlane);

      // Apply acceleration with reduced control in air
      const accelFactor = isGrounded ? 1 : this.config.airDragFactor;
      const maxDeltaVel = this.config.acceleration * accelFactor * delta;

      this.deltaVelocity.clampLength(0, maxDeltaVel);

      playerVelocity.add(this.deltaVelocity);
    } else {
      this.velocityOnPlane.copy(playerVelocity).projectOnPlane(this.upAxis);

      const decelFactor = isGrounded ? 1 : 0.7;
      const maxDecel = this.config.deceleration * decelFactor * delta;

      this.deltaVelocity.copy(this.velocityOnPlane).clampLength(0, maxDecel);
      playerVelocity.sub(this.deltaVelocity);
    }
  }

  updateConfig(config: Partial<MovementConfig>): void {
    Object.assign(this.config, config);
  }
}
