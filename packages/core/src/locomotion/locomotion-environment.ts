/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { EnvironmentType } from '@iwsdk/locomotor';
import { Types, createComponent } from '../ecs/component.js';

/** Marks an entity's Object3D hierarchy as walkable locomotion geometry. */
export const LocomotionEnvironment = createComponent(
  'LocomotionEnvironment',
  {
    type: {
      type: Types.Enum,
      enum: EnvironmentType,
      default: EnvironmentType.STATIC,
    },
    _envHandle: { type: Types.Float32, default: 0 },
    _initialized: { type: Types.Boolean, default: false },
  },
  'Locomotion environment component that holds the environment mesh group',
);
