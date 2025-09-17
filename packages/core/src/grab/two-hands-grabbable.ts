/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Component for enabling two‑handed object grabbing and manipulation.
 *
 * @remarks
 * - Enables advanced manipulation using both VR controllers or hand inputs simultaneously.
 * - Supports rotation, translation, and **scaling** operations (scaling requires two hands).
 * - Distance between hands controls scaling: spreading hands apart scales up, bringing them together scales down.
 * - The position of first controller that grabbed the objects determines the object's position during translation.
 * - Rotation is calculated from the relative orientation between the two hands.
 * - All transformations can be independently enabled/disabled and constrained per axis.
 * - Works with the {@link GrabSystem} to automatically create multitouch interaction handles.
 *
 * @example Basic two‑handed grabbable object
 * ```ts
 * entity.addComponent(TwoHandsGrabbable, {})
 * ```
 *
 * @example Scaling‑only with constraints
 * ```ts
 * entity.addComponent(TwoHandsGrabbable, {
 *   rotate: false,
 *   translate: false,
 *   scale: true,
 *   scaleMin: [0.1, 0.1, 0.1],
 *   scaleMax: [5, 5, 5]
 * })
 * ```
 *
 * @example Precise manipulation with limits
 * ```ts
 * entity.addComponent(TwoHandsGrabbable, {
 *   rotate: true,
 *   translate: true,
 *   scale: true,
 *   rotateMin: [-Math.PI/4, -Math.PI/2, -Math.PI/4],
 *   rotateMax: [Math.PI/4, Math.PI/2, Math.PI/4],
 *   translateMin: [-1, 0, -1],
 *   translateMax: [1, 2, 1],
 *   scaleMin: [0.5, 0.5, 0.5],
 *   scaleMax: [2, 2, 2]
 * })
 * ```
 *
 * @category Grab
 * @see {@link GrabSystem}
 * @see {@link OneHandGrabbable}
 * @see {@link DistanceGrabbable}
 */

export const TwoHandsGrabbable = createComponent(
  'TwoHandsGrabbable',
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
  },
  'Component for two-handed object grabbing and manipulation',
);
