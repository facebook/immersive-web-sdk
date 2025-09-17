/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Procedural gradient background dome.
 *
 * @remarks
 * - Renders an inward‑facing sphere and writes to `scene.background`.
 * - Colors are Unity‑style sky/equator/ground; intensity multiplies shader output.
 *
 * @category Environment & Lighting
 */
export const DomeGradient = createComponent(
  'DomeGradient',
  {
    sky: { type: Types.Color, default: [0.2423, 0.6172, 0.8308, 1.0] },
    equator: { type: Types.Color, default: [0.6584, 0.7084, 0.7913, 1.0] },
    ground: { type: Types.Color, default: [0.807, 0.7758, 0.7454, 1.0] },
    intensity: { type: Types.Float32, default: 1.0 },
    _needsUpdate: { type: Types.Boolean, default: true },
  },
  'Background dome using a gradient',
);
