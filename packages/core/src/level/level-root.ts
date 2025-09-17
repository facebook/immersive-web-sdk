/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent } from '../ecs/index.js';

/**
 * Marker component placed on the active level's root entity.
 *
 * @remarks
 * Systems can scope level‑wide behavior by requiring {@link LevelRoot} in their queries
 * to avoid scanning all level entities.
 *
 * @category Scene
 * @hideineditor
 */
export const LevelRoot = createComponent(
  'LevelRoot',
  {},
  'Marker component attached to level root entities',
);
