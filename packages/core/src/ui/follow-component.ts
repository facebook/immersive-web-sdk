/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';

/** Behavior modes for {@link Follower}. @category UI */
export const FollowBehavior = {
  FaceTarget: 'face-target',
  PivotY: 'pivot-y',
  NoRotation: 'no-rotation',
};

/** Makes an entity follow a target Object3D. */
export const Follower = createComponent(
  'Follower',
  {
    target: {
      type: Types.Object,
      default: undefined,
      widget: 'entity',
      required: true,
      help: 'Drag an authored or built-in scene entity here',
    },
    offsetPosition: { type: Types.Vec3, default: [0, 0, 0] },
    behavior: {
      type: Types.Enum,
      enum: FollowBehavior,
      default: FollowBehavior.PivotY,
    },
    maxAngle: { type: Types.Float32, default: 30 },
    tolerance: { type: Types.Float32, default: 0.4 },
    speed: { type: Types.Float32, default: 1 },
    needsPositionSync: { type: Types.Boolean, default: true },
    _followTarget: { type: Types.Vec3, default: [0, 0, 0] },
  },
  'Component for following another object',
);
