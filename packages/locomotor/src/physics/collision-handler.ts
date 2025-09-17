/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Box3, Line3, Matrix4, Vector3 } from 'three';
import type { Environment } from '../environment/environment-manager.js';

export interface CapsuleInfo {
  radius: number;
  segment: Line3;
}

/**
 * Handles collision detection and response for capsule shapes
 * Reuses temporary objects for performance
 */
export class CollisionHandler {
  private tempSegment = new Line3();
  private tempPosition = new Vector3();
  private positionDelta = new Vector3();
  private aabbox = new Box3();
  private rayVector = new Vector3();
  private localSegment = new Line3();
  private localTriPoint = new Vector3();
  private localCapsulePoint = new Vector3();
  private tempMatrix4 = new Matrix4();

  constructor() {}

  /**
   * Handle capsule collision across multiple environments and return corrected position
   * Modifies velocity to remove collision penetration
   */
  handleCapsuleCollision(
    environments: Environment[],
    capsuleInfo: CapsuleInfo,
    playerPosition: Vector3,
    playerVelocity: Vector3,
  ): Vector3 {
    this.tempSegment.copy(capsuleInfo.segment);
    this.tempSegment.start.add(playerPosition);
    this.tempSegment.end.add(playerPosition);

    for (const env of environments) {
      this.shapecastCapsule(this.tempSegment, capsuleInfo.radius, env);
    }

    this.tempPosition
      .copy(this.tempSegment.start)
      .sub(capsuleInfo.segment.start);

    this.positionDelta.copy(this.tempPosition).sub(playerPosition);

    if (this.positionDelta.length() > 1e-5) {
      // Reuse rayVector as collision normal to avoid allocation
      this.rayVector.copy(this.positionDelta).normalize();
      const velocityIntoSurface = playerVelocity.dot(this.rayVector);
      if (velocityIntoSurface < 0) {
        playerVelocity.addScaledVector(this.rayVector, -velocityIntoSurface);
      }
    }

    return this.tempPosition;
  }

  /**
   * Perform shapecast collision detection for capsule against environment with matrix transform
   */
  private shapecastCapsule(
    capsuleSegment: Line3,
    radius: number,
    env: Environment,
  ): void {
    this.tempMatrix4.copy(env.worldMatrix).invert();
    this.localSegment.copy(capsuleSegment);
    this.localSegment.start.applyMatrix4(this.tempMatrix4);
    this.localSegment.end.applyMatrix4(this.tempMatrix4);

    this.aabbox.makeEmpty();
    this.aabbox.expandByPoint(this.localSegment.start);
    this.aabbox.expandByPoint(this.localSegment.end);
    this.aabbox.min.addScalar(-radius);
    this.aabbox.max.addScalar(radius);

    env.bvh.shapecast({
      intersectsBounds: (bounds) => bounds.intersectsBox(this.aabbox),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(
          this.localSegment,
          this.localTriPoint,
          this.localCapsulePoint,
        );
        if (distance < radius) {
          const depth = radius - distance;
          this.rayVector
            .copy(this.localCapsulePoint)
            .sub(this.localTriPoint)
            .normalize();

          this.localSegment.start.addScaledVector(this.rayVector, depth);
          this.localSegment.end.addScaledVector(this.rayVector, depth);

          capsuleSegment.start
            .copy(this.localSegment.start)
            .applyMatrix4(env.worldMatrix);
          capsuleSegment.end
            .copy(this.localSegment.end)
            .applyMatrix4(env.worldMatrix);
        }
      },
    });
  }
}
