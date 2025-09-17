/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Component representing a detected real‑world plane surface in AR/VR environments. This component
 * should be attached to entities by the SceneUnderstandingSystem and be queried by custom systems.
 *
 * @remarks
 * - Automatically created by {@link SceneUnderstandingSystem} when planes are detected.
 * - Represents flat surfaces like floors, walls, and ceilings in the real world.
 * - Entities are destroyed when the corresponding real‑world plane is no longer detected.
 * - Requires WebXR session with 'plane‑detection' feature enabled.
 * - Users should not manually create entities with this component and let the scene understanding
 *   system manage them.
 *
 * @example React to detected planes
 * ```ts
 * your-system.query({ required: [XRPlane] }).subscribe('qualify', (entity) => {
 *   const plane = entity.getValue(XRPlane, 'plane')
 *   console.log('Detected plane orientation:', plane.orientation)
 *   console.log('Plane position:', entity.object3D?.position)
 * })
 * ```
 *
 * @category Scene Understanding
 * @see {@link SceneUnderstandingSystem}
 * @see {@link XRMesh}
 */

export const XRPlane = createComponent(
  'XRPlane',
  {
    _plane: { type: Types.Object, default: undefined },
  },
  'Component for managing 3D planes in the scene',
);
