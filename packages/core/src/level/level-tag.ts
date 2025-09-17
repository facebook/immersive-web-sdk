/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Tags entities as belonging to the active level.
 *
 * @remarks
 * - The {@link LevelSystem} destroys all entities with this tag when switching levels.
 * - Entities created via {@link World.createTransformEntity} are automatically tagged,
 *   unless created as persistent.
 *
 * @category Scene
 * @hideineditor
 */
export const LevelTag = createComponent(
  'LevelTag',
  {
    id: { type: Types.String, default: '' }, // Optional identifier for the current level instance
  },
  'Marker component for level membership',
);
