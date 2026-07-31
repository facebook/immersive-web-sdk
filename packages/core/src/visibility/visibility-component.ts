/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';

export const Visibility = createComponent(
  'Visibility',
  {
    isVisible: { type: Types.Boolean, default: true },
  },
  'Component to control if an entity object is visible',
  // @ts-ignore - 4th argument is editor metadata consumed by tooling.
  { hideInEditor: true },
);
