/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';

/**
 * 3D transform component that binds an entity to a Three.js Object3D.
 *
 * @category Scene
 * @hideineditor
 */
export const Transform = createComponent(
  'Transform',
  {
    position: { type: Types.Vec3, default: [NaN, NaN, NaN] },
    orientation: { type: Types.Vec4, default: [NaN, NaN, NaN, NaN] },
    scale: { type: Types.Vec3, default: [NaN, NaN, NaN] },
    parent: { type: Types.Entity, default: undefined as any },
  },
  'Component for 3D transformation (position, rotation, scale)',
);
