/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  FrontSide,
  Intersection,
  Matrix4,
  Quaternion,
  Ray,
  Vector3,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { calculateTrajectoryBounds } from '../physics/math-utils.js';
import { EnvironmentType } from '../types/environment-types.js';

export interface Environment {
  handle: number;
  bvh: MeshBVH;
  type: string;
  worldMatrix: Matrix4;
  worldBounds: Box3; // Cached world-space bounding box
  metadata?: {
    deltaPos?: Vector3;
    deltaQuat?: Quaternion;
    velocity?: Vector3;
    angularVelocity?: Vector3;
    lastPosition?: Vector3;
    lastQuaternion?: Quaternion;
    position?: Vector3;
    quaternion?: Quaternion;
  };
}

/**
 * Manages multiple discrete environments and dynamic platforms
 * Manages collision environments with proper typing and lifecycle management
 */
export class EnvironmentManager {
  private environments = new Map<number, Environment>();
  private staticEnvironments: Environment[] = [];
  private kinematicEnvironments: Environment[] = [];

  // Player-relative bounds
  private maxDropDistance = 2.0; // Default maximum drop distance in meters

  private tempRay = new Ray();
  private tempVector3_1 = new Vector3();
  private tempVector3_2 = new Vector3();
  private tempQuaternion_1 = new Quaternion();
  private tempQuaternion_2 = new Quaternion();
  private tempMatrix4_1 = new Matrix4();
  private tempMatrix4_2 = new Matrix4();
  private tempBox = new Box3();

  /**
   * Add a new environment to the manager
   */
  addEnvironment(
    handle: number,
    positions: Float32Array | number[],
    indices: Uint32Array | Uint16Array | number[],
    type: string = EnvironmentType.STATIC,
    worldMatrix: Matrix4 = new Matrix4(),
  ): void {
    if (this.environments.has(handle)) {
      console.warn(
        `Environment with handle ${handle} already exists, skipping`,
      );
      return;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        positions instanceof Array ? new Float32Array(positions) : positions,
        3,
      ),
    );
    geometry.setIndex(
      new BufferAttribute(
        indices instanceof Array ? new Uint32Array(indices) : indices,
        1,
      ),
    );

    const bvh = new MeshBVH(geometry);

    // Calculate world-space bounding box
    const worldBounds = new Box3();
    worldBounds.copy(bvh.geometry.boundingBox!);
    worldBounds.applyMatrix4(worldMatrix);

    const environment: Environment = {
      handle,
      bvh,
      type,
      worldMatrix: worldMatrix.clone(),
      worldBounds,
      metadata:
        type === EnvironmentType.KINEMATIC
          ? {
              deltaPos: new Vector3(),
              deltaQuat: new Quaternion(),
              velocity: new Vector3(),
              angularVelocity: new Vector3(),
              lastPosition: new Vector3(),
              lastQuaternion: new Quaternion(),
              position: new Vector3(),
              quaternion: new Quaternion(),
            }
          : undefined,
    };

    this.environments.set(handle, environment);
    this.updateEnvironmentArrays();
  }

  /**
   * Remove an environment from the manager
   */
  removeEnvironment(handle: number): void {
    if (this.environments.delete(handle)) {
      this.updateEnvironmentArrays();
    }
  }

  /**
   * Get all environments
   */
  getEnvironments(): Environment[] {
    return Array.from(this.environments.values());
  }

  /**
   * Get only static environments
   */
  getStaticEnvironments(): Environment[] {
    return this.staticEnvironments;
  }

  /**
   * Get only kinematic (dynamic) environments
   */
  getKinematicEnvironments(): Environment[] {
    return this.kinematicEnvironments;
  }

  /**
   * Update kinematic platform position and calculate deltas
   */
  updateKinematicPlatform(handle: number, newWorldMatrix: Matrix4): void {
    const env = this.environments.get(handle);
    if (!env || env.type !== EnvironmentType.KINEMATIC || !env.metadata) {
      return;
    }

    newWorldMatrix.decompose(
      this.tempVector3_1,
      this.tempQuaternion_1,
      this.tempVector3_2,
    );

    env.metadata.deltaPos!.subVectors(
      this.tempVector3_1,
      env.metadata.lastPosition!,
    );
    this.tempQuaternion_2.copy(env.metadata.lastQuaternion!).invert();
    env.metadata.deltaQuat!.multiplyQuaternions(
      this.tempQuaternion_1,
      this.tempQuaternion_2,
    );

    env.metadata.position!.copy(this.tempVector3_1);
    env.metadata.quaternion!.copy(this.tempQuaternion_1);

    env.worldMatrix.copy(newWorldMatrix);

    env.metadata.lastPosition!.copy(this.tempVector3_1);
    env.metadata.lastQuaternion!.copy(this.tempQuaternion_1);

    // Update world bounds for kinematic environments
    env.worldBounds.copy(env.bvh.geometry.boundingBox!);
    env.worldBounds.applyMatrix4(env.worldMatrix);
  }

  /**
   * Update kinematic platforms based on stored transforms
   * Call this each frame to track platform movement
   */
  updateKinematicPlatforms(delta: number): void {
    for (const env of this.kinematicEnvironments) {
      if (!env.metadata || !env.metadata.position || !env.metadata.quaternion) {
        continue;
      }

      env.metadata.deltaPos!.subVectors(
        env.metadata.position,
        env.metadata.lastPosition!,
      );
      this.tempQuaternion_1.copy(env.metadata.lastQuaternion!).invert();
      env.metadata.deltaQuat!.multiplyQuaternions(
        env.metadata.quaternion,
        this.tempQuaternion_1,
      );

      if (delta > 0) {
        env.metadata
          .velocity!.copy(env.metadata.deltaPos!)
          .multiplyScalar(1 / delta);
      }

      env.metadata.lastPosition!.copy(env.metadata.position);
      env.metadata.lastQuaternion!.copy(env.metadata.quaternion);

      if (env.metadata.deltaPos!.lengthSq() > 1e-6) {
        env.bvh.refit();
      }
    }
  }

  /**
   * Get environment by ID
   */
  getEnvironment(handle: number): Environment | undefined {
    return this.environments.get(handle);
  }

  /**
   * Check if environment exists
   */
  hasEnvironment(handle: number): boolean {
    return this.environments.has(handle);
  }

  /**
   * Utility method to perform raycast against environment with matrix transforms
   * Handles transform to local space, BVH raycast, and transform results back to world space
   */
  raycastEnvironment(
    env: Environment,
    ray: Ray,
    near: number = 0,
    far: number = Infinity,
  ): Intersection | null {
    this.tempMatrix4_1.copy(env.worldMatrix).invert();
    this.tempRay.copy(ray);
    this.tempRay.applyMatrix4(this.tempMatrix4_1);

    const intersect = env.bvh.raycastFirst(this.tempRay, FrontSide, near, far);

    if (intersect && intersect.face) {
      intersect.point.applyMatrix4(env.worldMatrix);

      // Transform normal using transpose of inverse for proper normal transformation
      this.tempMatrix4_2.copy(env.worldMatrix).invert().transpose();
      intersect.face.normal.transformDirection(this.tempMatrix4_2);
      intersect.face.normal.normalize();

      intersect.distance = intersect.point.distanceTo(ray.origin);
    }

    return intersect;
  }

  /**
   * Clear all environments
   */
  clear(): void {
    this.environments.clear();
    this.staticEnvironments.length = 0;
    this.kinematicEnvironments.length = 0;
  }

  private updateEnvironmentArrays(): void {
    this.staticEnvironments.length = 0;
    this.kinematicEnvironments.length = 0;

    for (const env of this.environments.values()) {
      if (env.type === EnvironmentType.STATIC) {
        this.staticEnvironments.push(env);
      } else {
        this.kinematicEnvironments.push(env);
      }
    }
  }

  /**
   * Set the maximum drop distance for player-relative bounds
   */
  setMaxDropDistance(distance: number): void {
    this.maxDropDistance = distance;
  }

  /**
   * Get the minimum Y for parabolic raycasts based on player position
   * Uses player-relative bounds instead of absolute scene bounds
   */
  getMinY(playerY: number): number {
    return playerY - this.maxDropDistance;
  }

  /**
   * Get environments that potentially intersect with a parabolic trajectory
   * Uses broad-phase bounding box culling for performance
   */
  getEnvironmentsForTrajectory(
    origin: Vector3,
    direction: Vector3,
    minY: number,
    gravity: number,
  ): Environment[] {
    // Calculate trajectory bounding box using utility function
    calculateTrajectoryBounds(origin, direction, minY, gravity, this.tempBox);

    // Return environments whose world bounds intersect trajectory bounds
    return Array.from(this.environments.values()).filter((env) =>
      env.worldBounds.intersectsBox(this.tempBox),
    );
  }
}
