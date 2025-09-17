/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent } from '../ecs/index.js';

/**
 * Marks an entity as eligible for XR/UI pointer interaction.
 *
 * @remarks
 * - The {@link InputSystem} discovers all entities with `Interactable` and, when
 *   XR visibility is Visible, registers their Object3D roots as raycast targets
 *   (computing BVHs for meshes to accelerate intersection tests).
 * - When a pointer enters/leaves or presses/releases on the entity, the system
 *   adds/removes the transient tags {@link Hovered} and {@link Pressed} so other
 *   systems can react declaratively without manual event wiring.
 * - Add this tag to the root Object3D of your UI/interactive object. Children
 *   are implicitly covered because the InputSystem registers the whole subtree.
 *
 * @category Input
 * @example Highlight on hover
 * ```ts
 * export class HighlightSystem extends createSystem({ items: { required: [Interactable] } }) {
 *   update() {
 *     this.queries.items.entities.forEach(e => {
 *       e.object3D.visible = !e.hasComponent(Pressed);
 *       e.object3D.material.emissiveIntensity = e.hasComponent(Hovered) ? 1.0 : 0.0;
 *     });
 *   }
 * }
 * ```
 */
export const Interactable = createComponent(
  'Interactable',
  {},
  'Marks an entity as eligible for XR pointer interaction (ray/proximity).',
);

/**
 * A transient tag set while a pointer ray is intersecting an `Interactable`.
 *
 * @remarks
 * - Managed by {@link InputSystem}; do not add/remove this component manually in normal usage.
 * - Use as a declarative condition for hover effects, tooltips, or affordances.
 *
 * @category Input
 * @hideineditor
 */
export const Hovered = createComponent(
  'Hovered',
  {},
  'A tag added by InputSystem while a pointer is hovering over the entity.',
);

/**
 * A transient tag set while a pointer is actively pressing an `Interactable`.
 *
 * @remarks
 * - Managed by {@link InputSystem}; do not add/remove this component manually in normal usage.
 * - Often used to gate activation logic or pressed-state visuals.
 *
 * @category Input
 * @hideineditor
 */
export const Pressed = createComponent(
  'Pressed',
  {},
  'A tag added by InputSystem while the entity is actively pressed.',
);
