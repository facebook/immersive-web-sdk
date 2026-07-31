/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';

/** Internal per-entity runtime state for active XR layers. */
export const XRLayerState = createComponent(
  'XRLayerState',
  {
    isQuad: { type: Types.Boolean, default: true },
    mesh: { type: Types.Object, default: null },
    renderTarget: { type: Types.Object, default: null },
    fallbackMaterial: { type: Types.Object, default: null },
    xrLayer: { type: Types.Object, default: null },
    pixelWidth: { type: Types.Int16, default: 0 },
    pixelHeight: { type: Types.Int16, default: 0 },
    stencil: { type: Types.Boolean, default: false },
    cachedTransform: { type: Types.Object, default: null },
  },
  'Internal state for active XR layer entities',
);
