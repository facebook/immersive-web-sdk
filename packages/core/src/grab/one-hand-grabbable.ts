/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Component for enabling single‑hand object grabbing and manipulation.
 *
 * @remarks
 * - Allows users to grab and manipulate objects using a single VR controller or hand input.
 * - Supports independent control of rotation and translation (movement) axes.
 * - Rotation and translation can be constrained using min/max limits per axis.
 * - Works with the {@link GrabSystem} to automatically create interaction handles.
 * - Requires the entity to have an `object3D` for the interaction to work.
 *
 * @example Basic single‑hand grabbable object
 * ```ts
 * entity.addComponent(OneHandGrabbable, {})
 * ```
 *
 * @example Constrained manipulation (rotation‑only on Y axis)
 * ```ts
 * entity.addComponent(OneHandGrabbable, {
 *   rotate: true,
 *   rotateMin: [0, -Math.PI, 0],
 *   rotateMax: [0, Math.PI, 0],
 *   translate: false
 * })
 * ```
 *
 * @example Limited movement range
 * ```ts
 * entity.addComponent(OneHandGrabbable, {
 *   rotate: true,
 *   translate: true,
 *   translateMin: [-2, 0, -2],
 *   translateMax: [2, 3, 2]
 * })
 * ```
 *
 * @category Grab
 * @see {@link GrabSystem}
 * @see {@link TwoHandsGrabbable}
 * @see {@link DistanceGrabbable}
 */

export const OneHandGrabbable = createComponent(
  'OneHandGrabbable',
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
  },
  'Component for single-hand object grabbing and manipulation',
);
