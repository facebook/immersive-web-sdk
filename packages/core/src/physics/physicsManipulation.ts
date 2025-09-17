/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '.././index.js';

/**
 * Component for applying one‑time physics manipulations to an entity.
 *
 * @remarks
 * - This component is automatically removed after the manipulations are applied.
 * - Force is applied as an impulse at the entity's center of mass.
 * - Setting linear or angular velocity overrides the current velocity.
 * - All manipulations are applied in a single frame, then the component is removed.
 * - Requires the entity to have {@link PhysicsBody}.
 *
 * @example Apply an upward force to make an object jump
 * ```ts
 * entity.addComponent(PhysicsManipulation, {
 *   force: [0, 10, 0]
 * })
 * ```
 *
 * @example Set specific velocity for controlled movement
 * ```ts
 * entity.addComponent(PhysicsManipulation, {
 *   linearVelocity: [5, 0, 0],
 *   angularVelocity: [0, 2, 0]
 * })
 * ```
 *
 * @category Physics
 * @see {@link PhysicsSystem}
 * @see {@link PhysicsBody}
 */

export const PhysicsManipulation = createComponent(
  'PhysicsManipulation',
  {
    force: { type: Types.Vec3, default: [0.0, 0.0, 0.0] },
    linearVelocity: { type: Types.Vec3, default: [0.0, 0.0, 0.0] },
    angularVelocity: { type: Types.Vec3, default: [0.0, 0.0, 0.0] },
  },
  'Component to apply physics manipulations to an entity.',
);
