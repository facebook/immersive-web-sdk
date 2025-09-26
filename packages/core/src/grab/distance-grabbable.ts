/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';
import { MovementMode } from './handles.js';

/**
 * Component for enabling distance‑based object grabbing and manipulation.
 *
 * @remarks
 * - Allows users to grab and manipulate objects from a distance through ray casting.
 * - Supports three movement modes: MoveTowardsTarget, MoveAtSource, and RotateAtSource.
 * - **MoveTowardsTarget**: Object smoothly moves toward the input source that's grabbing.
 * - **MoveAtSource**: Object moves relative to hand movement while maintaining distance.
 * - **RotateAtSource**: Object rotates in place without translation or scaling.
 * - Optional `returnToOrigin` makes objects snap back to their original position when released.
 * - Supports rotation, translation, and scaling with per‑axis constraints.
 * - Works with the {@link GrabSystem} to create specialized distance grab handles.
 * - Perfect for telekinetic‑style interactions and remote object manipulation.
 *
 * @example Basic distance grabbable object
 * ```ts
 * entity.addComponent(DistanceGrabbable, {
 *   movementMode: MovementMode.MoveTowardsTarget,
 * })
 * ```
 *
 * @example Telekinetic manipulation that returns to origin
 * ```ts
 * entity.addComponent(DistanceGrabbable, {
 *   rotate: true,
 *   translate: true,
 *   scale: false,
 *   movementMode: MovementMode.MoveAtSource,
 *   returnToOrigin: true
 * })
 * ```
 *
 * @example Rotation‑only distance interaction
 * ```ts
 * entity.addComponent(DistanceGrabbable, {
 *   movementMode: MovementMode.RotateAtSource,
 * })
 * ```
 *
 * @category Grab
 * @see {@link GrabSystem}
 * @see {@link OneHandGrabbable}
 * @see {@link TwoHandsGrabbable}
 * @see {@link MovementMode}
 */
export const DistanceGrabbable = createComponent(
  'DistanceGrabbable',
  {
    /** A boolean value to set whether rotating the object is allowed. */
    rotate: { type: Types.Boolean, default: true },
    /** An optional vector to define the maximum angle of the allowed rotation in [x, y, z] axes. */
    rotateMax: {
      type: Types.Vec3,
      default: [Infinity, Infinity, Infinity],
    },
    /** An optional vector to define the minimum angle of the allowed rotation in [x, y, z] axes. */
    rotateMin: {
      type: Types.Vec3,
      default: [-Infinity, -Infinity, -Infinity],
    },
    /** A boolean value to set whether moving the object's position is allowed. */
    translate: { type: Types.Boolean, default: true },
    /** An optional vector to define the maximum allowed position in [x, y, z] axes. */
    translateMax: {
      type: Types.Vec3,
      default: [Infinity, Infinity, Infinity],
    },
    /** An optional vector to define the minimum allowed position in [x, y, z] axes. */
    translateMin: {
      type: Types.Vec3,
      default: [-Infinity, -Infinity, -Infinity],
    },
    /** A boolean value to set whether scaling the object up and down is allowed. */
    scale: { type: Types.Boolean, default: true },
    /** An optional vector to define the maximum allowed scaling in [x, y, z] axes. */
    scaleMax: {
      type: Types.Vec3,
      default: [Infinity, Infinity, Infinity],
    },
    /** An optional vector to define the minimum allowed scaling in [x, y, z] axes. */
    scaleMin: {
      type: Types.Vec3,
      default: [-Infinity, -Infinity, -Infinity],
    },
    /** The movement mode of the grabbable. More details in {@link MovementMode}. */
    movementMode: {
      type: Types.Enum,
      enum: MovementMode,
      default: MovementMode.MoveTowardsTarget,
    },
    /** A boolean value to set whether the object snap back to its original position and rotation. */
    returnToOrigin: { type: Types.Boolean, default: false },
    /** Object movement speed for the MoveTowardsTarget movement mode. */
    moveSpeed: { type: Types.Float32, default: 0.1 },
  },
  'Component for distance-based object grabbing and manipulation',
);
