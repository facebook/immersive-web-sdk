/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector3 } from 'three';

/**
 * Static physics utility functions for locomotion
 * Performance-optimized with no object allocations
 */
export class PhysicsUtils {
  static calculateSpringForce(
    displacement: number,
    springConstant: number,
  ): number {
    return springConstant * displacement;
  }

  static calculateDampingForce(
    velocity: number,
    dampingConstant: number,
  ): number {
    return dampingConstant * velocity;
  }

  static clampForce(force: number, maxForce: number): number {
    return Math.max(-maxForce, Math.min(maxForce, force));
  }

  static applyGravity(
    velocity: Vector3,
    gravityDir: Vector3,
    gravity: number,
    gravityMultiplier: number,
    delta: number,
  ): void {
    velocity.addScaledVector(gravityDir, gravity * gravityMultiplier * delta);
  }

  static applyFloatingForce(
    velocity: Vector3,
    upAxis: Vector3,
    springForce: number,
    dampingForce: number,
    maxForce: number,
    mass: number,
    delta: number,
  ): void {
    const floatForce = springForce - dampingForce;
    const cappedFloatForce = PhysicsUtils.clampForce(floatForce, maxForce);
    const acceleration = (cappedFloatForce * delta) / mass;
    velocity.addScaledVector(upAxis, acceleration);
  }

  static calculateTargetDistance(
    floatHeight: number,
    capsuleRadius: number,
  ): number {
    return floatHeight + capsuleRadius;
  }

  static isGrounded(
    groundDistance: number,
    groundingThreshold: number,
  ): boolean {
    return groundDistance < groundingThreshold;
  }

  static calculateGroundingThreshold(
    floatHeight: number,
    capsuleRadius: number,
    buffer: number = 0.15,
  ): number {
    return floatHeight + capsuleRadius + buffer;
  }

  static isWalkableSlope(
    surfaceNormal: Vector3,
    upAxis: Vector3,
    maxSlope: number,
  ): boolean {
    const slopeAngle = surfaceNormal.angleTo(upAxis);
    return slopeAngle < maxSlope;
  }

  static capVelocity(velocity: Vector3, maxVelocity: number): void {
    if (velocity.lengthSq() > maxVelocity * maxVelocity) {
      velocity.normalize().multiplyScalar(maxVelocity);
    }
  }
}
