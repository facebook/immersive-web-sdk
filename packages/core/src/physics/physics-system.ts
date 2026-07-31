/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// All symbols from `@babylonjs/havok` are type-only here. The runtime engine
// (which ships ~2 MB of WASM) is loaded lazily via `await import(...)` later
// in `init()`, and runtime access to enums like `MotionType` is done via the
// loaded instance (e.g. `this.havok.MotionType.STATIC`). Keeping these as
// `import type` ensures `@babylonjs/havok` stays out of the static module
// graph when consumers don't enable `features.physics`, so the WASM and JS
// engine chunks aren't bundled into non-physics projects.
import type {
  HavokPhysicsWithBindings,
  HP_ShapeId,
  HP_WorldId,
  MassProperties,
  MotionType,
} from '@babylonjs/havok';
import { createSystem, Entity, ne, Types, Grabbed } from '.././index.js';
import {
  Vector3,
  Mesh,
  TypedArray,
  Quaternion,
  Matrix4,
  Object3D,
} from '../runtime/three.js';
import {
  DEFAULT_ANGULAR_DAMPING,
  DEFAULT_GRAVITY_FACTOR,
  DEFAULT_LINEAR_DAMPING,
  PhysicsBody,
  PhysicsState,
} from './physicsBody';
import { PhysicsManipulation } from './physicsManipulation';
import { PhysicsShape, PhysicsShapeType } from './physicsShape';
import {
  detectShapeFromGeometry,
  generateMergedGeometry,
  sequentialIndices,
} from './utils';

type Vector3Input = Vector3 | readonly [number, number, number];
type QuaternionInput = Quaternion | readonly [number, number, number, number];

/** Pose passed to {@link PhysicsSystem.setBodyTransform}. */
export interface PhysicsBodyTransformPose {
  position: Vector3Input;
  quaternion: QuaternionInput;
}

/** Options for {@link PhysicsSystem.setBodyTransform}. */
export interface PhysicsBodyTransformOptions {
  /**
   * Clear linear and angular velocity after teleporting the body.
   *
   * @default true
   */
  resetVelocity?: boolean;
}

const ZERO_VECTOR = [0, 0, 0] as const;

export function getCapsuleAxisEndpoints(
  radius: number,
  totalHeight: number,
): [[number, number, number], [number, number, number]] | null {
  if (
    !Number.isFinite(radius) ||
    !Number.isFinite(totalHeight) ||
    radius <= 0 ||
    totalHeight < radius * 2
  ) {
    return null;
  }
  const halfSegment = totalHeight / 2 - radius;
  if (halfSegment === 0) {
    return [
      [0, 0, 0],
      [0, 0, 0],
    ];
  }
  return [
    [0, -halfSegment, 0],
    [0, halfSegment, 0],
  ];
}

function vector3ToArray(value: Vector3Input): [number, number, number] {
  return 'x' in value
    ? [value.x, value.y, value.z]
    : [value[0], value[1], value[2]];
}

function quaternionToArray(
  value: QuaternionInput,
): [number, number, number, number] {
  return 'w' in value
    ? [value.x, value.y, value.z, value.w]
    : [value[0], value[1], value[2], value[3]];
}

/**
 * Manages physics simulation using the Havok physics engine.
 *
 * @remarks
 * - Initializes Havok physics engine and creates a physics world with gravity.
 * - Supports automatic physics shapes creation based on entity geometry when {@link PhysicsShapeType.Auto} is used.
 * - Supports multiple collision shapes: Sphere, Box, Cylinder, ConvexHull, and TriMesh.
 * - Synchronizes physics body transforms with Three.js Object3D positions and rotations using {@link PhysicsBody}.
 * - Handles physics manipulations like applying forces and setting velocities in {@link PhysicsManipulation}.
 * - Automatically cleans up physics resources when entities are removed.
 *
 * @example Basic physics setup
 * ```ts
 * // Add to your world to enable physics
 * world.addSystem(PhysicsSystem)
 *
 * // Create a dynamic box that falls due to gravity
 * const box = world.createTransformEntity(boxMesh)
 * box.addComponent(PhysicsShape, {
 *   shape: PhysicsShapeType.Box,
 *   dimensions: [1, 1, 1]
 * })
 * box.addComponent(PhysicsBody, { state: PhysicsState.Dynamic })
 * ```
 *
 * @category Physics
 * @see {@link PhysicsBody}
 * @see {@link PhysicsShape}
 * @see {@link PhysicsManipulation}
 */
export class PhysicsSystem extends createSystem(
  {
    physicsEntities: {
      required: [PhysicsBody, PhysicsShape],
    },
    manipluatedEntities: {
      required: [PhysicsBody, PhysicsManipulation],
      where: [ne(PhysicsBody, '_engineBody', 0)],
    },
    // Bodies whose gravityFactor / linearDamping / angularDamping differ from
    // the defaults. The value predicate keeps each set limited to overridden
    // bodies, so the common case (default values) is never visited by the
    // per-frame reactive sync below, and the queries re-fire whenever the field
    // is `setValue`-d.
    gravityOverrides: {
      required: [PhysicsBody, PhysicsShape],
      where: [ne(PhysicsBody, 'gravityFactor', DEFAULT_GRAVITY_FACTOR)],
    },
    linearDampingOverrides: {
      required: [PhysicsBody, PhysicsShape],
      where: [ne(PhysicsBody, 'linearDamping', DEFAULT_LINEAR_DAMPING)],
    },
    angularDampingOverrides: {
      required: [PhysicsBody, PhysicsShape],
      where: [ne(PhysicsBody, 'angularDamping', DEFAULT_ANGULAR_DAMPING)],
    },
  },
  {
    gravity: { type: Types.Vec3, default: [0, -9.81, 0] },
  },
) {
  private havok?: HavokPhysicsWithBindings;
  private havokWorld?: HP_WorldId;
  private bodyBuffer?: number;

  private scaleBuffer = new Vector3();
  private matrixBuffer = new Matrix4();
  /**
   * Cached Float32Array view over the entire Havok heap, reused across frames
   * and bodies. Recreated only when the underlying ArrayBuffer changes (the
   * WASM heap can grow and detach the old buffer), so per-body transform reads
   * don't allocate a fresh typed-array view every frame.
   */
  private heapFloatView?: Float32Array;

  /** Float32 view over the current Havok heap buffer (see {@link heapFloatView}). */
  private getHeapFloatView(): Float32Array {
    const buffer = this.havok!.HEAPU8.buffer;
    if (!this.heapFloatView || this.heapFloatView.buffer !== buffer) {
      this.heapFloatView = new Float32Array(buffer);
    }
    return this.heapFloatView;
  }

  async init(): Promise<void> {
    const { default: HavokPhysics } = await import('@babylonjs/havok');
    this.havok = await HavokPhysics();
    this.havokWorld = this.havok.HP_World_Create()[1];
    this.havok.HP_World_SetGravity(this.havokWorld, this.config.gravity.value);

    // Unified cleanup
    this.queries.physicsEntities.subscribe('disqualify', (entity) => {
      if (!this.havok || !this.havokWorld) {
        return;
      }

      const engineShape = entity.getValue(PhysicsShape, '_engineShape');
      if (engineShape) {
        this.havok.HP_Shape_Release([BigInt(engineShape)]);
      }

      const engineBody = entity.getValue(PhysicsBody, '_engineBody');
      if (engineBody) {
        this.havok.HP_World_RemoveBody(this.havokWorld, [BigInt(engineBody)]);
      }
    });

    this.subscribeReactiveOverrides();
  }

  /**
   * Teleport an existing Havok body to `pose`.
   *
   * @remarks
   * No-ops until the entity has a live {@link PhysicsBody}. The pose is pushed
   * directly to Havok and mirrored onto `entity.object3D` immediately so callers
   * do not need to wait for the next physics tick before reading the reset
   * transform. Linear and angular velocity are cleared by default, which is the
   * expected behavior for reset/home-position flows.
   *
   * @example Reset a fallen prop to its home pose
   * ```ts
   * const physics = world.getSystem(PhysicsSystem);
   * physics.setBodyTransform(prop, {
   *   position: homePosition,
   *   quaternion: homeQuaternion,
   * });
   * ```
   */
  setBodyTransform(
    entity: Entity,
    pose: PhysicsBodyTransformPose,
    options: PhysicsBodyTransformOptions = {},
  ): void {
    if (!this.havok || !entity.hasComponent(PhysicsBody)) {
      return;
    }

    const engineBody = entity.getValue(PhysicsBody, '_engineBody');
    if (!engineBody) {
      return;
    }

    const body = [BigInt(engineBody)] as [bigint];
    const position = vector3ToArray(pose.position);
    const quaternion = quaternionToArray(pose.quaternion);

    this.havok.HP_Body_SetQTransform(body, [position, quaternion]);

    if (entity.object3D) {
      entity.object3D.position.set(position[0], position[1], position[2]);
      entity.object3D.quaternion.set(
        quaternion[0],
        quaternion[1],
        quaternion[2],
        quaternion[3],
      );
      entity.object3D.updateMatrixWorld(true);
    }

    if (options.resetVelocity === false) {
      return;
    }

    this.havok.HP_Body_SetLinearVelocity(body, [...ZERO_VECTOR]);
    this.havok.HP_Body_SetAngularVelocity(body, [...ZERO_VECTOR]);
    entity.getVectorView(PhysicsBody, '_linearVelocity').set(ZERO_VECTOR);
    entity.getVectorView(PhysicsBody, '_angularVelocity').set(ZERO_VECTOR);
  }

  /**
   * Reset a body's gravityFactor / linearDamping / angularDamping to the engine
   * default when its field returns to the default value. The entity then drops
   * out of the override set, so {@link syncReactiveOverrides} no longer visits
   * it — this is the one place that restores the default. The `hasComponent`
   * guard distinguishes the value-returned-to-default case from the other
   * disqualify cause (PhysicsBody/PhysicsShape removal), where the body is being
   * released and must not be written to.
   */
  private subscribeReactiveOverrides(): void {
    this.queries.gravityOverrides.subscribe('disqualify', (entity) => {
      if (
        entity.hasComponent(PhysicsBody) &&
        entity.hasComponent(PhysicsShape)
      ) {
        this.syncGravityFactor(entity);
      }
    });
    this.queries.linearDampingOverrides.subscribe('disqualify', (entity) => {
      if (
        entity.hasComponent(PhysicsBody) &&
        entity.hasComponent(PhysicsShape)
      ) {
        this.syncLinearDamping(entity);
      }
    });
    this.queries.angularDampingOverrides.subscribe('disqualify', (entity) => {
      if (
        entity.hasComponent(PhysicsBody) &&
        entity.hasComponent(PhysicsShape)
      ) {
        this.syncAngularDamping(entity);
      }
    });
  }

  update(delta: number): void {
    if (this.havok && this.havokWorld) {
      this.havok.HP_World_SetIdealStepTime(this.havokWorld, delta);
      this.havok.HP_World_Step(this.havokWorld, delta);
      this.bodyBuffer = this.havok.HP_World_GetBodyBuffer(this.havokWorld)[1];
    }

    this.queries.physicsEntities.entities.forEach((entity) => {
      if (!entity.object3D || !this.havok || !this.havokWorld) {
        return;
      }

      const engineShape = entity.getValue(PhysicsShape, '_engineShape');
      const engineBody = entity.getValue(PhysicsBody, '_engineBody');

      if (!engineShape) {
        const dimensionsView = entity.getVectorView(
          PhysicsShape,
          'dimensions',
        ) as Float32Array;
        this.createHavokShapes(entity, dimensionsView);
        return;
      } else {
        if (!engineBody && engineShape) {
          const linearDamping =
            entity.getValue(PhysicsBody, 'linearDamping') ??
            DEFAULT_LINEAR_DAMPING;
          const angularDamping =
            entity.getValue(PhysicsBody, 'angularDamping') ??
            DEFAULT_ANGULAR_DAMPING;
          const gravityFactor =
            entity.getValue(PhysicsBody, 'gravityFactor') ??
            DEFAULT_GRAVITY_FACTOR;
          const bodyRepsonse = this.createBody(
            [BigInt(engineShape)],
            entity.object3D.position,
            entity.object3D.quaternion,
            entity.getValue(PhysicsBody, 'state'),
            linearDamping,
            angularDamping,
            gravityFactor,
            entity.getVectorView(PhysicsBody, 'centerOfMass') as Float32Array,
          );
          if (bodyRepsonse) {
            entity.setValue(
              PhysicsBody,
              '_engineBody',
              Number(bodyRepsonse.createdBody),
            );
            entity.setValue(PhysicsBody, '_engineOffset', bodyRepsonse.offset);
            // Seed the reactive shadows with what createBody just pushed, so the
            // first per-frame sync sees no drift and skips a redundant write.
            PhysicsBody.data._engineGravityFactor[entity.index] = gravityFactor;
            PhysicsBody.data._engineLinearDamping[entity.index] = linearDamping;
            PhysicsBody.data._engineAngularDamping[entity.index] =
              angularDamping;
          }
        } else if (engineBody && this.bodyBuffer) {
          const linearVelocity = this.havok.HP_Body_GetLinearVelocity([
            BigInt(engineBody),
          ]);
          const angularVelocity = this.havok.HP_Body_GetAngularVelocity([
            BigInt(engineBody),
          ]);

          const linearVelocityView = entity.getVectorView(
            PhysicsBody,
            '_linearVelocity',
          );
          const angularVelocityView = entity.getVectorView(
            PhysicsBody,
            '_angularVelocity',
          );
          linearVelocityView.set(linearVelocity[1]);
          angularVelocityView.set(angularVelocity[1]);
          // Processing physics body motion here
          const position = entity.object3D.position;
          const quaternion = entity.object3D.quaternion;

          if (Grabbed.bitmask && entity.hasComponent(Grabbed)) {
            this.havok.HP_Body_SetTargetQTransform(
              [BigInt(engineBody)],
              [
                [position.x, position.y, position.z],
                [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
              ],
            );
            return;
          }

          const bodyOffset = entity.getValue(PhysicsBody, '_engineOffset') ?? 0;
          // Read the 16-float transform straight out of the cached heap view.
          // `bodyBuffer + bodyOffset` is 4-byte aligned (it was a valid
          // Float32Array byteOffset previously), so `>> 2` is exact.
          const heap = this.getHeapFloatView();
          const base = (this.bodyBuffer + bodyOffset) >> 2;

          for (let mi = 0; mi < 15; mi++) {
            if ((mi & 3) != 3) {
              this.matrixBuffer.elements[mi] = heap[base + mi];
            }
          }
          this.matrixBuffer.elements[15] = 1.0;
          this.matrixBuffer.decompose(position, quaternion, this.scaleBuffer);
        }
      }
    });

    this.syncReactiveOverrides();

    this.queries.manipluatedEntities.entities.forEach((entity) => {
      const engineBody = entity.getValue(PhysicsBody, '_engineBody');

      if (!entity.object3D || !this.havok || !this.havokWorld || !engineBody) {
        return;
      }

      // Applying one time force to the body
      if (
        !entity
          .getVectorView(PhysicsManipulation, 'force')
          .every((element) => element === 0)
      ) {
        const force = entity.getVectorView(PhysicsManipulation, 'force');
        this.havok.HP_Body_ApplyImpulse(
          [BigInt(engineBody)],
          [
            entity.object3D.position.x,
            entity.object3D.position.y,
            entity.object3D.position.z,
          ],
          [force[0] * delta, force[1] * delta, force[2] * delta],
        );
      }

      // Applying one time linear velocity to the body
      if (
        !entity
          .getVectorView(PhysicsManipulation, 'linearVelocity')
          .every((element) => element === 0)
      ) {
        const linearVelocity = entity.getVectorView(
          PhysicsManipulation,
          'linearVelocity',
        );
        this.havok.HP_Body_SetLinearVelocity(
          [BigInt(engineBody)],
          [linearVelocity[0], linearVelocity[1], linearVelocity[2]],
        );
      }

      // Applying one time angular velocity to the body
      if (
        !entity
          .getVectorView(PhysicsManipulation, 'angularVelocity')
          .every((element) => element === 0)
      ) {
        const angularVelocity = entity.getVectorView(
          PhysicsManipulation,
          'angularVelocity',
        );
        this.havok.HP_Body_SetAngularVelocity(
          [BigInt(engineBody)],
          [angularVelocity[0], angularVelocity[1], angularVelocity[2]],
        );
      }

      entity.removeComponent(PhysicsManipulation);
    });
  }

  private createBody(
    shape: HP_ShapeId,
    position: Vector3,
    quaternion: Quaternion,
    state: any,
    linearDamping: number,
    angularDamping: number,
    gravityFactor: number,
    centerOfMass: Float32Array,
  ) {
    if (!this.havok || !this.havokWorld) {
      return;
    }

    const body = this.havok.HP_Body_Create()[1];
    this.havok.HP_Body_SetShape(body, shape);
    this.havok.HP_Body_SetQTransform(body, [
      [position.x, position.y, position.z],
      [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    ]);
    this.havok.HP_Body_SetLinearDamping(body, linearDamping);
    this.havok.HP_Body_SetAngularDamping(body, angularDamping);
    this.havok.HP_Body_SetGravityFactor(body, gravityFactor);

    const shapeMass = this.havok.HP_Shape_BuildMassProperties(shape);
    const massProps =
      shapeMass[0] == this.havok.Result.RESULT_OK
        ? shapeMass[1]
        : ([[0, 0, 0], 1, [1, 1, 1], [0, 0, 0, 1]] as MassProperties);
    if (!centerOfMass.every((e) => e == Infinity)) {
      massProps[0] = [centerOfMass[0], centerOfMass[1], centerOfMass[2]];
    } else {
      // Update the centerOfMass with the computed value from mass properties
      centerOfMass[0] = massProps[0][0];
      centerOfMass[1] = massProps[0][1];
      centerOfMass[2] = massProps[0][2];
    }

    this.havok.HP_Body_SetMassProperties(body, massProps);

    let motionType: MotionType;
    switch (state) {
      case PhysicsState.Static:
        motionType = this.havok.MotionType.STATIC;
        break;
      case PhysicsState.Kinematic:
        motionType = this.havok.MotionType.KINEMATIC;
        break;
      case PhysicsState.Dynamic:
      default:
        motionType = this.havok.MotionType.DYNAMIC;
    }
    this.havok.HP_Body_SetMotionType(body, motionType);

    this.havok.HP_World_AddBody(this.havokWorld, body, false);

    return {
      offset: this.havok.HP_Body_GetWorldTransformOffset(body)[1],
      createdBody: body,
    };
  }

  /**
   * Push post-creation gravityFactor / linearDamping / angularDamping edits to
   * Havok. Only overridden bodies are visited (see the value-predicate queries
   * in the system definition); each sync diffs the component value against the
   * last-pushed shadow, so a body whose field is unchanged this frame costs only
   * a typed-array compare.
   */
  private syncReactiveOverrides(): void {
    this.queries.gravityOverrides.entities.forEach((entity) => {
      this.syncGravityFactor(entity);
    });
    this.queries.linearDampingOverrides.entities.forEach((entity) => {
      this.syncLinearDamping(entity);
    });
    this.queries.angularDampingOverrides.entities.forEach((entity) => {
      this.syncAngularDamping(entity);
    });
  }

  /**
   * Sync the entity's current {@link PhysicsBody.gravityFactor} onto its Havok
   * body. Diffs the component value against `_engineGravityFactor` (the last
   * value pushed) rather than reading back from Havok, so an unchanged body
   * costs only a typed-array compare — no WASM call and no allocation. The Havok
   * write and shadow update happen only on an actual change. No-op until the body
   * exists. See {@link gravityOverrides}.
   */
  private syncGravityFactor(entity: Entity): void {
    if (!this.havok) {
      return;
    }
    const index = entity.index;
    const engineBody = PhysicsBody.data._engineBody[index];
    if (!engineBody) {
      return;
    }
    const target = PhysicsBody.data.gravityFactor[index];
    if (PhysicsBody.data._engineGravityFactor[index] === target) {
      return;
    }
    this.havok.HP_Body_SetGravityFactor([BigInt(engineBody)], target);
    PhysicsBody.data._engineGravityFactor[index] = target;
  }

  /**
   * Sync the entity's current {@link PhysicsBody.linearDamping} onto its Havok
   * body. Diffs against `_engineLinearDamping` (the last value pushed) rather
   * than reading back from Havok, so an unchanged body costs only a typed-array
   * compare — no WASM call and no allocation. The Havok write and shadow update
   * happen only on an actual change. No-op until the body exists.
   * See {@link linearDampingOverrides}.
   */
  private syncLinearDamping(entity: Entity): void {
    if (!this.havok) {
      return;
    }
    const index = entity.index;
    const engineBody = PhysicsBody.data._engineBody[index];
    if (!engineBody) {
      return;
    }
    const target = PhysicsBody.data.linearDamping[index];
    if (PhysicsBody.data._engineLinearDamping[index] === target) {
      return;
    }
    this.havok.HP_Body_SetLinearDamping([BigInt(engineBody)], target);
    PhysicsBody.data._engineLinearDamping[index] = target;
  }

  /**
   * Sync the entity's current {@link PhysicsBody.angularDamping} onto its Havok
   * body. Diffs against `_engineAngularDamping` (the last value pushed) rather
   * than reading back from Havok, so an unchanged body costs only a typed-array
   * compare — no WASM call and no allocation. The Havok write and shadow update
   * happen only on an actual change. No-op until the body exists.
   * See {@link angularDampingOverrides}.
   */
  private syncAngularDamping(entity: Entity): void {
    if (!this.havok) {
      return;
    }
    const index = entity.index;
    const engineBody = PhysicsBody.data._engineBody[index];
    if (!engineBody) {
      return;
    }
    const target = PhysicsBody.data.angularDamping[index];
    if (PhysicsBody.data._engineAngularDamping[index] === target) {
      return;
    }
    this.havok.HP_Body_SetAngularDamping([BigInt(engineBody)], target);
    PhysicsBody.data._engineAngularDamping[index] = target;
  }

  private createHavokShapes(entity: Entity, dimensionsView: Float32Array) {
    if (!entity.object3D) {
      console.warn(
        'PhysicsSystem: No object3D attached to entity',
        entity.index,
      );
      return;
    }

    // Determine the actual shape type (resolve Auto if needed)
    let shapeType = entity.getValue(PhysicsShape, 'shape');

    if (shapeType === PhysicsShapeType.Auto) {
      const detection = detectShapeFromGeometry(entity.object3D);
      // Update the entity's shape type and dimensions if they were auto-detected
      entity.setValue(PhysicsShape, 'shape', detection.shapeType);
      shapeType = detection.shapeType;

      if (detection.dimensions) {
        // Re-read the updated dimensions view
        dimensionsView.set(detection.dimensions);
      }
    }

    switch (shapeType) {
      case PhysicsShapeType.Sphere: {
        const ballShape = this.createBallShape(
          dimensionsView[0],
          entity.getValue(PhysicsShape, 'density') ?? 1.0,
          entity.getValue(PhysicsShape, 'restitution') ?? 0,
          entity.getValue(PhysicsShape, 'friction') ?? 0.5,
        );
        if (ballShape) {
          PhysicsShape.data._engineShape[entity.index] = Number(ballShape);
        } else {
          console.warn(
            'PhysicsSystem: Failed to create ball shape for entity',
            entity.index,
          );
        }
        break;
      }
      case PhysicsShapeType.Box: {
        const boxShape = this.createBoxShape(
          dimensionsView,
          entity.getValue(PhysicsShape, 'density') ?? 1.0,
          entity.getValue(PhysicsShape, 'restitution') ?? 0,
          entity.getValue(PhysicsShape, 'friction') ?? 0.5,
        );
        if (boxShape) {
          PhysicsShape.data._engineShape[entity.index] = Number(boxShape);
        } else {
          console.warn(
            'PhysicsSystem: Failed to create box shape for entity',
            entity.index,
          );
        }
        break;
      }
      case PhysicsShapeType.Cylinder: {
        const cylinderShape = this.createCylinderShape(
          dimensionsView[0], // radius
          dimensionsView[1], // height
          entity.getValue(PhysicsShape, 'density') ?? 1.0,
          entity.getValue(PhysicsShape, 'restitution') ?? 0,
          entity.getValue(PhysicsShape, 'friction') ?? 0.5,
        );
        if (cylinderShape) {
          PhysicsShape.data._engineShape[entity.index] = Number(cylinderShape);
        } else {
          console.warn(
            'PhysicsSystem: Failed to create cylinder shape for entity',
            entity.index,
          );
        }
        break;
      }
      case PhysicsShapeType.Capsules: {
        const capsuleShape = this.createCapsuleShape(
          dimensionsView[0], // radius
          dimensionsView[1], // total end-to-end height
          entity.getValue(PhysicsShape, 'density') ?? 1.0,
          entity.getValue(PhysicsShape, 'restitution') ?? 0,
          entity.getValue(PhysicsShape, 'friction') ?? 0.5,
        );
        if (capsuleShape) {
          PhysicsShape.data._engineShape[entity.index] = Number(capsuleShape);
        } else {
          console.warn(
            'PhysicsSystem: Failed to create capsule shape for entity',
            entity.index,
          );
        }
        break;
      }
      case PhysicsShapeType.ConvexHull: {
        const convexHullShape = this.createConvexHullShape(
          entity.object3D,
          entity.getValue(PhysicsShape, 'density') ?? 1.0,
          entity.getValue(PhysicsShape, 'restitution') ?? 0,
          entity.getValue(PhysicsShape, 'friction') ?? 0.5,
        );
        if (convexHullShape) {
          PhysicsShape.data._engineShape[entity.index] =
            Number(convexHullShape);
        } else {
          console.warn(
            'PhysicsSystem: Failed to create convex hull shape for entity',
            entity.index,
          );
        }
        break;
      }
      case PhysicsShapeType.TriMesh: {
        const triMeshShape = this.createTriMeshShape(
          entity.object3D,
          entity.getValue(PhysicsShape, 'density') ?? 1.0,
          entity.getValue(PhysicsShape, 'restitution') ?? 0,
          entity.getValue(PhysicsShape, 'friction') ?? 0.5,
        );
        if (triMeshShape) {
          PhysicsShape.data._engineShape[entity.index] = Number(triMeshShape);
        } else {
          console.warn(
            'PhysicsSystem: Failed to create tri-mesh shape for entity',
            entity.index,
          );
        }
        break;
      }
    }
  }

  private createBallShape(
    radius: number,
    density: number,
    restitution: number,
    friction: number,
  ) {
    if (!this.havok) {
      console.warn(
        'PhysicsSystem: Cannot create ball shape - Havok physics engine not initialized',
      );
      return;
    }

    const ballShape = this.havok.HP_Shape_CreateSphere([0, 0, 0], radius)[1];
    this.havok.HP_Shape_SetDensity(ballShape, density);
    this.havok.HP_Shape_SetMaterial(ballShape, [
      friction,
      friction,
      restitution,
      this.havok.MaterialCombine.MINIMUM,
      this.havok.MaterialCombine.MAXIMUM,
    ]);
    return ballShape;
  }

  private createBoxShape(
    scale: Float32Array,
    density: number,
    restitution: number,
    friction: number,
  ) {
    if (!this.havok) {
      console.warn(
        'PhysicsSystem: Cannot create box shape - Havok physics engine not initialized',
      );
      return;
    }

    const boxShape = this.havok.HP_Shape_CreateBox(
      [0, 0, 0],
      [0, 0, 0, 1],
      [scale[0], scale[1], scale[2]],
    )[1];
    this.havok.HP_Shape_SetDensity(boxShape, density);
    this.havok.HP_Shape_SetMaterial(boxShape, [
      friction,
      friction,
      restitution,
      this.havok.MaterialCombine.MINIMUM,
      this.havok.MaterialCombine.MAXIMUM,
    ]);
    return boxShape;
  }

  private createCylinderShape(
    radius: number,
    height: number,
    density: number,
    restitution: number,
    friction: number,
  ) {
    if (!this.havok) {
      console.warn(
        'PhysicsSystem: Cannot create cylinder shape - Havok physics engine not initialized',
      );
      return;
    }

    const cylinderShape = this.havok.HP_Shape_CreateCylinder(
      [0, -height / 2, 0],
      [0, height / 2, 0],
      radius,
    )[1];
    this.havok.HP_Shape_SetDensity(cylinderShape, density);
    this.havok.HP_Shape_SetMaterial(cylinderShape, [
      friction,
      friction,
      restitution,
      this.havok.MaterialCombine.MINIMUM,
      this.havok.MaterialCombine.MAXIMUM,
    ]);
    return cylinderShape;
  }

  private createCapsuleShape(
    radius: number,
    totalHeight: number,
    density: number,
    restitution: number,
    friction: number,
  ) {
    if (!this.havok) {
      console.warn(
        'PhysicsSystem: Cannot create capsule shape - Havok physics engine not initialized',
      );
      return;
    }

    const endpoints = getCapsuleAxisEndpoints(radius, totalHeight);
    if (!endpoints) {
      console.warn(
        'PhysicsSystem: Capsule dimensions require a positive radius and a total height greater than or equal to twice the radius',
      );
      return;
    }
    const [pointA, pointB] = endpoints;
    const capsuleShape = this.havok.HP_Shape_CreateCapsule(
      pointA,
      pointB,
      radius,
    )[1];
    this.havok.HP_Shape_SetDensity(capsuleShape, density);
    this.havok.HP_Shape_SetMaterial(capsuleShape, [
      friction,
      friction,
      restitution,
      this.havok.MaterialCombine.MINIMUM,
      this.havok.MaterialCombine.MAXIMUM,
    ]);
    return capsuleShape;
  }

  private createConvexHullShape(
    object3D: Object3D,
    density: number,
    restitution: number,
    friction: number,
  ) {
    if (!this.havok) {
      console.warn(
        'PhysicsSystem: Cannot create convex hull shape - Havok physics engine not initialized',
      );
      return;
    }

    // When object3D is not a Mesh we build a merged geometry here and must
    // dispose it once the shape is created; a Mesh's own geometry stays in use.
    const ownsGeometry = !(object3D instanceof Mesh);
    const geometry =
      object3D instanceof Mesh
        ? object3D.geometry
        : generateMergedGeometry(object3D);
    const positionAttribute = geometry.attributes.position;
    if (!positionAttribute) {
      console.warn(
        'PhysicsSystem: Failed to get vertices for convex hull shape with object3D name ' +
          object3D.name +
          ' &id ' +
          object3D.id,
      );
      if (ownsGeometry) {
        geometry.dispose();
      }
      return;
    }
    const vertices = this.getVertices(positionAttribute.array);

    const convexHullShape = this.havok.HP_Shape_CreateConvexHull(
      vertices.offset,
      vertices.numObjects / 3,
    )[1];
    this.havok._free(vertices.offset);

    if (ownsGeometry) {
      geometry.dispose();
    }

    this.havok.HP_Shape_SetDensity(convexHullShape, density);
    this.havok.HP_Shape_SetMaterial(convexHullShape, [
      friction,
      friction,
      restitution,
      this.havok.MaterialCombine.MINIMUM,
      this.havok.MaterialCombine.MAXIMUM,
    ]);

    return convexHullShape;
  }

  private createTriMeshShape(
    object3D: Object3D,
    density: number,
    restitution: number,
    friction: number,
  ) {
    if (!this.havok) {
      console.warn(
        'PhysicsSystem: Cannot create tri-mesh shape - Havok physics engine not initialized',
      );
      return;
    }

    // When object3D is not a Mesh we build a merged geometry here and must
    // dispose it once the shape is created; a Mesh's own geometry stays in use.
    const ownsGeometry = !(object3D instanceof Mesh);
    const geometry =
      object3D instanceof Mesh
        ? object3D.geometry
        : generateMergedGeometry(object3D);

    const positionAttribute = geometry.attributes.position;
    if (!positionAttribute) {
      console.warn(
        'PhysicsSystem: Failed to get vertices for tri-mesh shape with object3D name ' +
          object3D.name +
          ' &id ' +
          object3D.id,
      );
      if (ownsGeometry) {
        geometry.dispose();
      }
      return;
    }

    const vertices = this.getVertices(positionAttribute.array);
    // geometry.index is null for non-indexed geometry; synthesize the implicit
    // sequential index list so non-indexed meshes don't dereference null here.
    const indices = this.getIndices(
      geometry.index?.array ?? sequentialIndices(positionAttribute.count),
    );

    const triMeshShape = this.havok.HP_Shape_CreateMesh(
      vertices.offset,
      vertices.numObjects / 3,
      indices.offset,
      indices.numObjects / 3,
    )[1];
    this.havok._free(vertices.offset);
    this.havok._free(indices.offset);

    if (ownsGeometry) {
      geometry.dispose();
    }

    this.havok.HP_Shape_SetDensity(triMeshShape, density);
    this.havok.HP_Shape_SetMaterial(triMeshShape, [
      friction,
      friction,
      restitution,
      this.havok.MaterialCombine.MINIMUM,
      this.havok.MaterialCombine.MAXIMUM,
    ]);

    return triMeshShape;
  }

  private getVertices(vertices: TypedArray) {
    const bytesPerFloat = 4;
    const nBytes = vertices.length * bytesPerFloat;
    const bufferBegin = this.havok!._malloc(nBytes);

    const ret = new Float32Array(
      this.havok!.HEAPU8.buffer,
      bufferBegin,
      vertices.length,
    );
    for (let i = 0; i < vertices.length; i++) {
      ret[i] = vertices[i];
    }

    return { offset: bufferBegin, numObjects: vertices.length };
  }

  private getIndices(indices: TypedArray) {
    const bytesPerInt = 4;
    const nBytes = indices.length * bytesPerInt;
    const bufferBegin = this.havok!._malloc(nBytes);
    const ret = new Int32Array(
      this.havok!.HEAPU8.buffer,
      bufferBegin,
      indices.length,
    );
    for (let i = 0; i < indices.length; i++) {
      ret[i] = indices[i];
    }

    return { offset: bufferBegin, numObjects: indices.length };
  }
}
