/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';
/**
 * XRCylinderLayer - Component for WebXR cylinder composition layers.
 *
 * A cylinder layer renders content onto a curved rectangular surface. The
 * viewer sees the inside of the cylinder. The entity's transform controls
 * the layer's world position and orientation. In XR, the content is
 * composited by the device's native compositor.
 *
 * Outside XR, the layer content is displayed on a textured cylinder mesh
 * as a fallback.
 *
 * @category Layers
 */
export const XRCylinderLayer = createComponent(
  'XRCylinderLayer',
  {
    /** Radius of the cylinder in meters. */
    radius: { type: Types.Float32, default: 2.0 },
    /** Central angle of the visible arc in radians. */
    centralAngle: { type: Types.Float32, default: Math.PI / 4 },
    /** Width-to-height aspect ratio of the visible section. */
    aspectRatio: { type: Types.Float32, default: 2.0 },
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
  'Cylinder composition layer for WebXR',
);
