/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';
/**
 * XRQuadLayer - Component for WebXR quad composition layers.
 *
 * A quad layer renders content onto a flat rectangular surface positioned in
 * 3D space. The entity's transform controls the layer's world position and
 * orientation. In XR, the content is composited by the device's native
 * compositor for sharper rendering and lower latency.
 *
 * Outside XR, the layer content is displayed on a textured plane mesh as a
 * fallback.
 *
 * @category Layers
 */
export const XRQuadLayer = createComponent(
  'XRQuadLayer',
  {
    /** Width of the quad in meters. */
    width: { type: Types.Float32, default: 1.0 },
    /** Height of the quad in meters. */
    height: { type: Types.Float32, default: 1.0 },
    /** Width of the layer's render target in pixels. */
    pixelWidth: { type: Types.Int16, default: 1024 },
    /** Height of the layer's render target in pixels. */
    pixelHeight: { type: Types.Int16, default: 1024 },
    /**
     * Callback invoked each frame while the layer is visible and its render
     * surface is active.
     * The renderer's render target is already set; call
     * `renderer.render(scene, camera)` to draw into the layer.
     */
    renderCallback: { type: Types.Object, default: null },
    /** Enable stencil buffer on the layer's render target. */
    stencil: { type: Types.Boolean, default: false },
  },
  'Quad composition layer for WebXR',
);
