/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Component representing detected real‑world 3D mesh geometry in AR/VR environments. This component
 * should be attached to entities by the SceneUnderstandingSystem and be queried by custom systems.
 *
 * @remarks
 * - Automatically created by {@link SceneUnderstandingSystem} when meshes are detected.
 * - Represents complex 3D geometry like furniture, objects, and room structure.
 * - Supports both bounded 3D objects (furniture, objects) and global mesh (room structure).
 * - Bounded meshes include semantic labels, bounding boxes, and calculated dimensions.
 * - Global meshes represent overall room structure without semantic classification.
 * - Entities are destroyed when the corresponding real‑world mesh is no longer detected.
 * - Requires WebXR session with 'mesh‑detection' feature enabled.
 * - Users should not manually create entities with this component and let the scene understanding
 *   system manage them.
 *
 * @example React to detected meshes
 * ```ts
 * your-system.query({ required: [XRMesh] }).subscribe('qualify', (entity) => {
 *   const isBounded = entity.getValue(XRMesh, 'isBounded3D')
 *   const semanticLabel = entity.getValue(XRMesh, 'semanticLabel')
 *
 *   if (isBounded && semanticLabel === 'table') {
 *     console.log('Table detected!')
 *     const dimensions = entity.getValue(XRMesh, 'dimensions')
 *     console.log('Table size:', dimensions)
 *   }
 * })
 * ```
 *
 * @category Scene Understanding
 * @see {@link SceneUnderstandingSystem}
 * @see {@link XRPlane}
 */

export const XRMesh = createComponent(
  'XRMesh',
  {
    _mesh: { type: Types.Object, default: undefined },
    isBounded3D: { type: Types.Boolean, default: false },
    semanticLabel: { type: Types.String, default: '' },
    min: { type: Types.Vec3, default: [0, 0, 0] },
    max: { type: Types.Vec3, default: [0, 0, 0] },
    dimensions: { type: Types.Vec3, default: [0, 0, 0] },
  },
  'Component for managing 3D meshes in the scene',
);
