/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';

/** CSS-like screen-space layout for a PanelUI. */
export const ScreenSpace = createComponent(
  'ScreenSpace',
  {
    height: { type: Types.String, default: '25vh' },
    width: { type: Types.String, default: '25vw' },
    top: { type: Types.String, default: 'auto' },
    bottom: { type: Types.String, default: 'auto' },
    left: { type: Types.String, default: 'auto' },
    right: { type: Types.String, default: 'auto' },
    zOffset: { type: Types.Float32, default: 0.2 },
  },
  'Component for screen-space UI positioning',
);
