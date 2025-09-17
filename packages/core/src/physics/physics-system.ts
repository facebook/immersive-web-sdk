/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  DEFAULT_GRAVITY_FACTOR,
  DEFAULT_LINEAR_DAMPING,
  PhysicsBody,
  PhysicsState,
} from './physicsBody';
import { PhysicsShape, PhysicsShapeType } from './physicsShape';
import { createSystem, Entity, ne, Pressed, Types } from '.././index.js';
import {
  Vector3,
  Mesh,
  TypedArray,
  Quaternion,
  Matrix4,
  Object3D,
} from '../runtime/three.js';
import {
  HavokPhysicsWithBindings,
  HP_ShapeId,
  HP_WorldId,
  MotionType,
} from '@babylonjs/havok';
import { detectShapeFromGeometry, generateMergedGeometry } from './utils';
import { PhysicsManipulation } from './physicsManipulation';

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
          const bodyRepsonse = this.createBody(
            [BigInt(engineShape)],
            entity.object3D.position,
            entity.object3D.quaternion,
            entity.getValue(PhysicsBody, 'state'),
            entity.getValue(PhysicsBody, 'linearDamping') ??
              DEFAULT_LINEAR_DAMPING,
            entity.getValue(PhysicsBody, 'gravityFactor') ??
              DEFAULT_GRAVITY_FACTOR,
          );
          if (bodyRepsonse) {
            entity.setValue(
              PhysicsBody,
              '_engineBody',
              Number(bodyRepsonse.createdBody),
            );
            entity.setValue(PhysicsBody, '_engineOffset', bodyRepsonse.offset);
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

          if (entity.hasComponent(Pressed)) {
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
          const transformBuffer = new Float32Array(
            this.havok.HEAPU8.buffer,
            this.bodyBuffer + bodyOffset,
            16,
          );

          for (let mi = 0; mi < 15; mi++) {
            if ((mi & 3) != 3) {
              this.matrixBuffer.elements[mi] = transformBuffer[mi];
            }
          }
          this.matrixBuffer.elements[15] = 1.0;
          this.matrixBuffer.decompose(position, quaternion, this.scaleBuffer);
        }
      }
    });

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
    gravityFactor: number,
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
    this.havok.HP_Body_SetGravityFactor(body, gravityFactor);
    this.havok.HP_World_AddBody(this.havokWorld, body, false);

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

    return {
      offset: this.havok.HP_Body_GetWorldTransformOffset(body)[1],
      createdBody: body,
    };
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
      [0, 0, 0],
      [0, height, 0],
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

    const geometry =
      object3D instanceof Mesh
        ? object3D.geometry
        : generateMergedGeometry(object3D);
    const vertices = this.getVertices(geometry.attributes.position.array);
    if (!vertices) {
      console.warn(
        'PhysicsSystem: Failed to get vertices for convex hull shape with object3D name ' +
          object3D.name +
          ' &id ' +
          object3D.id,
      );
      return;
    }

    const convexHullShape = this.havok.HP_Shape_CreateConvexHull(
      vertices.offset,
      vertices.numObjects / 3,
    )[1];
    this.havok._free(vertices.offset);

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

    const geometry =
      object3D instanceof Mesh
        ? object3D.geometry
        : generateMergedGeometry(object3D);

    const vertices = this.getVertices(geometry.attributes.position.array);
    const indices = this.getIndices(geometry.index.array);

    if (!vertices || !indices) {
      if (!vertices) {
        console.warn(
          'PhysicsSystem: Failed to get vertices for tri-mesh shape with object3D name ' +
            object3D.name +
            ' &id ' +
            object3D.id,
        );
      }
      if (!indices) {
        console.warn(
          'PhysicsSystem: Failed to get indices for tri-mesh shape with object3D name ' +
            object3D.name +
            ' &id ' +
            object3D.id,
        );
      }
      return;
    }

    const triMeshShape = this.havok.HP_Shape_CreateMesh(
      vertices.offset,
      vertices.numObjects / 3,
      indices.offset,
      indices.numObjects / 3,
    )[1];
    this.havok._free(vertices.offset);
    this.havok._free(indices.offset);

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
