/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Image‑based lighting from a texture or the built‑in Room environment.
 *
 * @remarks
 * - `src`: "room" | HDR/EXR equirect | LDR equirect. PMREM processed to `scene.environment`.
 * - `rotation` controls `scene.environmentRotation` in radians.
 * - Does not set `scene.background`.
 *
 * @category Environment & Lighting
 */
export const IBLTexture = createComponent(
  'IBLTexture',
  {
    src: { type: Types.String, default: 'room' },
    intensity: { type: Types.Float32, default: 1.0 },
    rotation: { type: Types.Vec3, default: [0, 0, 0] },
    _needsUpdate: { type: Types.Boolean, default: true },
  },
  'Image‑based lighting from texture or Room environment',
);
