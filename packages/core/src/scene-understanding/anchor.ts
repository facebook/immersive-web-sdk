/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Component for anchoring entities to stable real‑world positions in AR/VR.
 *
 * @remarks
 * - Anchors provide persistent, stable positioning relative to the real world.
 * - Entities with this component are automatically managed by {@link SceneUnderstandingSystem}.
 * - The entity's `object3D` will be attached to a world‑anchored group for stable tracking.
 * - Requires WebXR session with 'anchor' feature enabled.
 * - Anchors persist across tracking loss and help maintain consistent positioning.
 * - Once attached, the entity's transform is managed relative to the anchor's reference frame.
 * - Internal `attached` property tracks whether the entity has been processed by the system.
 *
 * @example Create an anchored object
 * ```ts
 * const marker = world.createEntity()
 * marker.addComponent(XRAnchor) // Will be anchored to current world position
 * ```
 *
 * @example Place content at a specific anchor point
 * ```ts
 * const hologram = world.createTransformEntity(hologramMesh)
 * hologram.addComponent(XRAnchor)
 * // The SceneUnderstandingSystem will anchor this at the current reference position
 * ```
 *
 * @category Scene Understanding
 * @see {@link SceneUnderstandingSystem}
 */

export const XRAnchor = createComponent(
  'XRAnchor',
  {
    attached: { type: Types.Boolean, default: false },
  },
  'Component for anchoring objects in the scene',
);
