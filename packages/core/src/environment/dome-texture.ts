/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Background dome driven by a single equirectangular texture.
 *
 * @remarks
 * - `src` may be HDR/EXR or LDR (png/jpg/ktx2). Mapping is set to equirect when needed.
 * - Affects only `scene.background` and optional `scene.backgroundRotation`/`backgroundIntensity`.
 *
 * @category Environment & Lighting
 */
export const DomeTexture = createComponent(
  'DomeTexture',
  {
    src: { type: Types.String, default: '' },
    blurriness: { type: Types.Float32, default: 0.0 },
    intensity: { type: Types.Float32, default: 1.0 },
    rotation: { type: Types.Vec3, default: [0, 0, 0] }, // radians [x,y,z]
    _needsUpdate: { type: Types.Boolean, default: true },
  },
  'Background dome using a single equirectangular texture',
);
