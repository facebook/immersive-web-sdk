/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '.././index.js';

/** Available physics shape types for {@link PhysicsShape}. @category Physics */
export const PhysicsShapeType = {
  /** The sphere is described by just the radius in dimensions[0]. Efficient for round objects. */
  Sphere: 'Sphere',
  /** A box shape is described by the `dimensions` as [width, height, depth]. Good for rectangular objects. */
  Box: 'Box',
  /** A cylinder shape is defined by the radius in dimensions[0] and height in dimensions[1]. */
  Cylinder: 'Cylinder',
  /** Capsules are similar to cylinders, but have two half-spheres on each end.
   * A Capsules shape is defined by the radius in dimensions[0] and height in dimensions[1]. */
  Capsules: 'Capsules',
  /** A convex is a shape that, if two points are part of the shape, then the segment between these two points is
   * also part of the shape. The physics engine would creates a convex wrapper around the mesh. This is a great
   * approximation for most objects since it's more accurate than primitives and much more efficient than TriMesh. */
  ConvexHull: 'ConvexHull',
  /** Uses exact mesh geometry in the physics engine. This will give the closest match to your render geometry but
   * may cause expensive compute load when two complex mesh shapes collide with each other. Typically used for static objects. */
  TriMesh: 'TriMesh',
  /** Automatically detects the best shape from the entity's Three.js geometry. The shape type mapping is
   * SphereGeometry -> PhysicsShapeType.Sphere,
   * BoxGeometry | PlaneGeometry -> PhysicsShapeType.Box,
   * CylinderGeometry -> PhysicsShapeType.Cylinder,
   * default -> PhysicsShapeType.ConvexHull,
   * When this type is selected, the dimensions field in PhysicsShape will be overridden by the size of the Three.js geometry.
   */
  Auto: 'Auto',
} as const;

export const DEFAULT_DENSITY = 1.0;
export const DEFAULT_RESTITUTION = 0.0;
export const DEFAULT_FRICTION = 0.5;

/**
 * Component for defining the collision shape and material properties of a physics entity.
 *
 * @remarks
 * - Material properties (density, restitution, friction) affect physics behavior.
 * - Higher density increases mass, affecting how the object responds to forces.
 *
 * @example Auto‑detect shape from geometry
 * ```ts
 * entity.addComponent(PhysicsShape, {
 *   shape: PhysicsShapeType.Auto
 * })
 * ```
 *
 * @example Create a bouncy sphere
 * ```ts
 * entity.addComponent(PhysicsShape, {
 *   shape: PhysicsShapeType.Sphere,
 *   dimensions: [0.5, 0, 0], // radius = 0.5
 *   restitution: 0.8, // bouncy
 *   friction: 0.1 // low friction
 * })
 * ```
 *
 * @example Create a heavy box
 * ```ts
 * entity.addComponent(PhysicsShape, {
 *   shape: PhysicsShapeType.Box,
 *   dimensions: [2, 1, 1], // 2x1x1 meters
 *   density: 5.0, // high density
 *   friction: 0.9 // high friction
 * })
 * ```
 *
 * @category Physics
 * @see {@link PhysicsSystem}
 * @see {@link PhysicsBody}
 */
export const PhysicsShape = createComponent(
  'PhysicsShape',
  {
    /** The type of the shape defined in the Physics engine. {@link PhysicsShapeType} */
    shape: {
      type: Types.Enum,
      enum: PhysicsShapeType,
      default: PhysicsShapeType.Auto,
    },
    /** The dimension of the physics shape. The definition of it is based on the selection of {@link PhysicsShapeType}. */
    dimensions: { type: Types.Vec3, default: [0.0, 0.0, 0.0] },
    /** The density of the physics shape. It is used to calculate the mass. */
    density: { type: Types.Float32, default: 1.0 },
    /** Restitution controls bounciness (0 = no bounce, 1 = perfect bounce). */
    restitution: { type: Types.Float32, default: 0.0 },
    /** Friction to define the sliding behavior on surfaces. */
    friction: { type: Types.Float32, default: 0.5 },
    _engineShape: { type: Types.Float64, default: 0 },
  },
  'Component to define physics shape of an entity.',
);
