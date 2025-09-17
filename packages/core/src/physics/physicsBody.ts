/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '.././index.js';

/** Motion type for {@link PhysicsBody}. @category Physics */
export const PhysicsState = {
  /** Static bodies are bodies which never move. Use this motion type for your immovable objects like walls and floors.
   *  It would still affect other bodies in the engine. */
  Static: 'STATIC',
  /** Bodies which can move and respond to forces, collisions, and gravity.  */
  Dynamic: 'DYNAMIC',
  /** Kinematic bodies that can move just like dynamic bodies. The difference is that kinematic bodies won't be affected by any other bodies.
   *  Kinematic bodies will still push dynamic bodies out of the way but the kinematic body won't be affected by those collisions.  */
  Kinematic: 'KINEMATIC',
} as const;

export const DEFAULT_LINEAR_DAMPING = 0.0;
export const DEFAULT_GRAVITY_FACTOR = 1.0;

/**
 * Component for physics bodies. A physics body is a virtual object that represents a physical
 * object in a simulation.
 *
 * @remarks
 * - Static bodies are used for immovable objects like walls and floors.
 * - Dynamic bodies respond to forces, collisions, and gravity.
 * - Kinematic bodies can be moved programmatically but don't respond to physics forces.
 * - Internal properties like `_engineBody` are managed automatically by {@link PhysicsSystem}.
 *
 * @example Add a dynamic physics body to an entity
 * ```ts
 * entity.addComponent(PhysicsBody, {
 *   state: PhysicsState.Dynamic
 * })
 * ```
 *
 * @category Physics
 * @see {@link PhysicsSystem}
 * @see {@link PhysicsShape}
 */
export const PhysicsBody = createComponent(
  'PhysicsBody',
  {
    /** The body's motion type in Physics Engine. {@link PhysicsState}  */
    state: {
      type: Types.Enum,
      enum: PhysicsState,
      default: PhysicsState.Dynamic,
    },
    linearDamping: { type: Types.Float32, default: 0.0 },
    gravityFactor: { type: Types.Float32, default: 1.0 },
    _linearVelocity: { type: Types.Vec3, default: [0.0, 0.0, 0.0] },
    _angularVelocity: { type: Types.Vec3, default: [0.0, 0.0, 0.0] },
    _engineBody: { type: Types.Float64, default: 0 },
    _engineOffset: { type: Types.Float64, default: 0 },
  },
  'Component to define physics behavior of an entity.',
);
