/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Image-based lighting from a procedural gradient (PMREM of a gradient scene).
 *
 * @remarks
 * - Only affects `scene.environment`.
 *
 * @category Environment & Lighting
 */
export const IBLGradient = createComponent(
  'IBLGradient',
  {
    sky: { type: Types.Color, default: [0.6902, 0.749, 0.7843, 1.0] },
    equator: { type: Types.Color, default: [0.6584, 0.7084, 0.7913, 1.0] },
    ground: { type: Types.Color, default: [0.807, 0.7758, 0.7454, 1.0] },
    intensity: { type: Types.Float32, default: 1.0 },
    _needsUpdate: { type: Types.Boolean, default: true },
  },
  'IBL from a gradient scene',
);
