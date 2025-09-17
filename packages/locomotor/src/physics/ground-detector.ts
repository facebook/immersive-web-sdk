/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Ray, Vector3 } from 'three';
import type {
  Environment,
  EnvironmentManager,
} from '../environment/environment-manager.js';
import { EnvironmentType } from '../types/environment-types.js';
import { PhysicsUtils } from './physics-utils.js';

export interface GroundInfo {
  isGrounded: boolean;
  distance: number;
  contactPoint: Vector3;
  normal: Vector3;
  environment?: Environment;
}

/**
 * Handles ground detection for locomotion
 * Reuses temporary objects for performance
 */
export class GroundDetector {
  private ray = new Ray();
  private tempPosition = new Vector3();
  private tempGroundInfo: GroundInfo = {
    isGrounded: false,
    distance: Infinity,
    contactPoint: new Vector3(),
    normal: new Vector3(0, 1, 0),
    environment: undefined,
  };

  constructor(
    private gravityDir: Vector3,
    private upAxis: Vector3,
    private environmentManager: EnvironmentManager,
  ) {}

  /**
   * Detect ground below player position across multiple environments
   * Returns reused GroundInfo object for performance
   */
  detectGround(
    environments: Environment[],
    playerPosition: Vector3,
    capsuleRadius: number,
    floatHeight: number,
    maxSlope: number,
  ): GroundInfo {
    this.tempGroundInfo.isGrounded = false;
    this.tempGroundInfo.distance = Infinity;
    this.tempGroundInfo.environment = undefined;

    this.tempPosition.copy(playerPosition);
    this.tempPosition.y += capsuleRadius;

    const baseRayDistance = floatHeight + capsuleRadius + 0.1;
    const extendedRayDistance = Math.max(
      baseRayDistance,
      Math.abs(playerPosition.y) + 5,
    );

    this.ray.origin.copy(this.tempPosition);
    this.ray.direction.copy(this.gravityDir);

    let closestIntersect = null;
    let closestEnvironment = null;

    for (const env of environments) {
      const intersect = this.environmentManager.raycastEnvironment(
        env,
        this.ray,
        0,
        extendedRayDistance,
      );

      if (intersect && intersect.face) {
        if (
          !closestIntersect ||
          intersect.distance < closestIntersect.distance
        ) {
          closestIntersect = intersect;
          closestEnvironment = env;
        }
      }
    }

    if (closestIntersect && closestIntersect.face && closestEnvironment) {
      this.tempGroundInfo.contactPoint.copy(closestIntersect.point);
      this.tempGroundInfo.normal.copy(closestIntersect.face.normal);
      this.tempGroundInfo.distance = closestIntersect.distance;
      this.tempGroundInfo.environment = closestEnvironment;

      if (
        PhysicsUtils.isWalkableSlope(
          this.tempGroundInfo.normal,
          this.upAxis,
          maxSlope,
        )
      ) {
        const groundingThreshold = PhysicsUtils.calculateGroundingThreshold(
          floatHeight,
          capsuleRadius,
        );
        this.tempGroundInfo.isGrounded = PhysicsUtils.isGrounded(
          this.tempGroundInfo.distance,
          groundingThreshold,
        );
      }
    }

    return this.tempGroundInfo;
  }

  /**
   * Add support for platform velocity inheritance when on kinematic platforms
   */
  applyPlatformVelocity(playerVelocity: Vector3, groundInfo: GroundInfo): void {
    if (
      groundInfo.environment?.type === EnvironmentType.KINEMATIC &&
      groundInfo.environment.metadata?.velocity
    ) {
      playerVelocity.add(groundInfo.environment.metadata.velocity);
    }
  }
}
