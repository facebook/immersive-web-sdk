/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Intersection, Line3, Matrix4, Ray, Vector3 } from 'three';
import {
  type Environment,
  EnvironmentManager,
} from '../environment/environment-manager.js';
import {
  type CapsuleInfo,
  CollisionHandler,
} from '../physics/collision-handler.js';
import { GroundDetector } from '../physics/ground-detector.js';
import { sampleParabolicCurve } from '../physics/math-utils.js';
import { PhysicsUtils } from '../physics/physics-utils.js';
import { EnvironmentType } from '../types/environment-types.js';
import { MovementController } from './movement-controller.js';

export class LocomotionEngine {
  public playerPosition = new Vector3();
  private playerVelocity = new Vector3();
  private movementVector = new Vector3();
  private ray = new Ray();
  private capsuleInfo: CapsuleInfo = {
    radius: 0.5,
    segment: new Line3(new Vector3(0, 1.5, 0), new Vector3(0, 0.5, 0)),
  };
  public lastUpdateTime = 0;
  private rayPoints = new Array<Vector3>();
  private rayVector = new Vector3();

  private upAxis = new Vector3(0, 1, 0);
  private gravityDir = new Vector3(0, -1, 0);

  private environmentManager: EnvironmentManager;
  private groundDetector: GroundDetector;
  private collisionHandler: CollisionHandler;
  private movementController: MovementController;

  public groundDecel = 8;
  public positionUpdateTimeout = 0.5;
  public gravity = 9.81;
  public rayGravity = -0.4;
  public updating = false;
  public isGrounded = false;
  public isGroundedOnStatic = false;
  public maxDropDistance = 2.0;

  public jumpHeight = 1.5;
  public jumpCooldown = 0.1;
  private lastJumpTime = 0;

  public acceleration = 100;
  public deceleration = 100;
  public airDragFactor = 0.3;
  public maxWalkSpeed = 3;
  public mass = 1;

  public floatHeight = 0.01;
  public floatSensorRadius = 0.12;
  public floatSpringK = 30;
  public floatDampingC = 8;
  public maxSlope = 1;

  constructor(initPosition: Vector3) {
    this.playerPosition.copy(initPosition);
    for (let i = 0; i < 10; i++) {
      this.rayPoints.push(new Vector3());
    }

    this.environmentManager = new EnvironmentManager();
    this.groundDetector = new GroundDetector(
      this.gravityDir,
      this.upAxis,
      this.environmentManager,
    );
    this.collisionHandler = new CollisionHandler();
    this.movementController = new MovementController({
      acceleration: this.acceleration,
      deceleration: this.deceleration,
      airDragFactor: this.airDragFactor,
      maxWalkSpeed: this.maxWalkSpeed,
    });

    // Set initial maxDropDistance on environment manager
    this.environmentManager.setMaxDropDistance(this.maxDropDistance);
  }

  slide(movementVector: Vector3) {
    this.movementVector.copy(movementVector);
    this.updating = true;
    this.lastUpdateTime = performance.now();
  }

  teleport(position: Vector3) {
    this.playerPosition.copy(position);
    this.playerVelocity.set(0, 0, 0);
    this.updating = true;
    this.lastUpdateTime = performance.now();
  }

  raycast(origin: Vector3, direction: Vector3, far: number) {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction);

    let closestIntersect: Intersection | undefined;
    for (const env of this.environmentManager.getEnvironments()) {
      const intersect = this.environmentManager.raycastEnvironment(
        env,
        this.ray,
        0,
        far,
      );

      if (
        intersect &&
        (!closestIntersect || intersect.distance < closestIntersect.distance)
      ) {
        closestIntersect = intersect;
      }
    }
    return closestIntersect;
  }

  private raycastRelevantEnvironments(
    origin: Vector3,
    direction: Vector3,
    far: number,
    environments: Environment[],
  ) {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction);

    let closestIntersect: Intersection | undefined;
    for (const env of environments) {
      const intersect = this.environmentManager.raycastEnvironment(
        env,
        this.ray,
        0,
        far,
      );

      if (
        intersect &&
        (!closestIntersect || intersect.distance < closestIntersect.distance)
      ) {
        closestIntersect = intersect;
      }
    }
    return closestIntersect;
  }

  parabolicRaycast(origin: Vector3, direction: Vector3) {
    let intersect: Intersection | undefined;
    const minY = this.environmentManager.getMinY(this.playerPosition.y);

    // Get environments that potentially intersect with trajectory (broad-phase)
    const relevantEnvs = this.environmentManager.getEnvironmentsForTrajectory(
      origin,
      direction,
      minY,
      this.rayGravity,
    );

    sampleParabolicCurve(
      origin,
      direction,
      minY,
      this.rayGravity,
      this.rayPoints,
    );

    for (let i = 0; i < this.rayPoints.length - 1; i++) {
      this.rayVector.copy(this.rayPoints[i + 1]).sub(this.rayPoints[i]);
      const far = this.rayVector.length();
      intersect = this.raycastRelevantEnvironments(
        this.rayPoints[i],
        this.rayVector.normalize(),
        far,
        relevantEnvs,
      );
      if (intersect) {
        break;
      }
    }
    return intersect;
  }

  update(delta: number) {
    this.environmentManager.updateKinematicPlatforms(delta);

    if (!this.updating) {
      return;
    }
    // Kinematic platforms require continuous updates since they can move at any time
    // Only allow sleep when grounded on static environments
    if (
      this.isGroundedOnStatic &&
      performance.now() - this.lastUpdateTime >
        this.positionUpdateTimeout * 1000
    ) {
      this.updating = false;
    } else {
      this.updatePlayerPosition(delta);
    }
  }

  updatePlayerPosition(delta: number) {
    this.handleMovementPhysics(delta);

    this.applyGravity(delta);

    this.handleGroundContact(delta);

    this.handleCollisions();

    if (this.playerPosition.y > 100) {
      this.playerPosition.set(0, 2, 0);
      this.playerVelocity.set(0, 0, 0);
      return;
    }

    PhysicsUtils.capVelocity(this.playerVelocity, 20);

    this.playerPosition.addScaledVector(this.playerVelocity, delta);
  }

  private handleMovementPhysics(delta: number) {
    this.movementController.handleMovementInput(
      this.movementVector,
      this.playerVelocity,
      this.isGrounded,
      delta,
    );
  }

  private applyGravity(delta: number) {
    if (!this.isGrounded) {
      const gravityMultiplier = this.playerPosition.y > 10 ? 3 : 1;
      PhysicsUtils.applyGravity(
        this.playerVelocity,
        this.gravityDir,
        this.gravity,
        gravityMultiplier,
        delta,
      );
    }
  }

  private handleGroundContact(delta: number) {
    const groundInfo = this.groundDetector.detectGround(
      this.environmentManager.getEnvironments(),
      this.playerPosition,
      this.capsuleInfo.radius,
      this.floatHeight,
      this.maxSlope,
    );

    this.isGrounded = groundInfo.isGrounded;

    this.isGroundedOnStatic =
      this.isGrounded &&
      groundInfo.environment?.type === EnvironmentType.STATIC;

    if (
      this.isGrounded &&
      groundInfo.environment?.type === EnvironmentType.KINEMATIC
    ) {
      this.groundDetector.applyPlatformVelocity(
        this.playerVelocity,
        groundInfo,
      );
    }

    if (groundInfo.distance < Infinity && this.isGrounded) {
      const targetDistance = PhysicsUtils.calculateTargetDistance(
        this.floatHeight,
        this.capsuleInfo.radius,
      );
      const springDisplacement = targetDistance - groundInfo.distance;
      const springForce = PhysicsUtils.calculateSpringForce(
        springDisplacement,
        this.floatSpringK,
      );

      const verticalVelocity = this.playerVelocity.dot(this.upAxis);
      const dampingForce = PhysicsUtils.calculateDampingForce(
        verticalVelocity,
        this.floatDampingC,
      );

      PhysicsUtils.applyFloatingForce(
        this.playerVelocity,
        this.upAxis,
        springForce,
        dampingForce,
        50,
        this.mass,
        delta,
      );
    }
  }

  private handleCollisions() {
    const correctedPosition = this.collisionHandler.handleCapsuleCollision(
      this.environmentManager.getEnvironments(),
      this.capsuleInfo,
      this.playerPosition,
      this.playerVelocity,
    );

    if (!correctedPosition.equals(this.playerPosition)) {
      this.playerPosition.copy(correctedPosition);
    }
  }

  addEnvironment(
    handle: number,
    positions: Float32Array | number[],
    indices: Uint32Array | Uint16Array | number[],
    type: string = EnvironmentType.STATIC,
    worldMatrix: Matrix4 = new Matrix4(),
  ): void {
    this.environmentManager.addEnvironment(
      handle,
      positions,
      indices,
      type,
      worldMatrix,
    );
  }

  removeEnvironment(handle: number): void {
    this.environmentManager.removeEnvironment(handle);
  }

  updateKinematicPlatform(handle: number, newWorldMatrix: Matrix4): void {
    this.environmentManager.updateKinematicPlatform(handle, newWorldMatrix);
  }

  setMaxDropDistance(distance: number): void {
    this.maxDropDistance = distance;
    this.environmentManager.setMaxDropDistance(distance);
  }

  jump(): void {
    const currentTime = performance.now() / 1000;

    // Validate jump conditions
    if (
      !(this.isGrounded && currentTime - this.lastJumpTime > this.jumpCooldown)
    ) {
      return;
    }

    // Calculate jump velocity using physics: v = √(2gh)
    const jumpVelocity = Math.sqrt(2 * this.gravity * this.jumpHeight);

    // Set upward velocity (preserve horizontal movement)
    this.playerVelocity.y = jumpVelocity;

    // Update state
    this.isGrounded = false; // Prevent ground snapping during jump
    this.lastJumpTime = currentTime;
    this.updating = true;
  }

  getEnvironmentManager(): EnvironmentManager {
    return this.environmentManager;
  }
}
