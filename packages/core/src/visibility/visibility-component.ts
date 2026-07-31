/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { setComponentEditorMetadata } from '../ecs/component-editor-metadata.js';
import { Types, createComponent } from '../ecs/component.js';

export const Visibility = setComponentEditorMetadata(
  createComponent(
    'Visibility',
    {
      isVisible: { type: Types.Boolean, default: true },
    },
    'Component to control if an entity object is visible',
  ),
  { hidden: true, intrinsic: true },
);
