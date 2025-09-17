/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { RayIntersector, SphereIntersector } from '@pmndrs/pointer-events';
import {
  patchedExecuteIntersection,
  patchedIntersectRayPointerCapture,
  patchedIntersectSpherePointerCapture,
} from './pointer-events-patch.js';

// Interaction state flags and Interactable marker now live in InputSystem
export { Interactable, Hovered, Pressed } from '../input/index.js';
export * from './grab-system.js';
export * from './one-hand-grabbable.js';
export * from './two-hands-grabbable.js';
export * from './distance-grabbable.js';
export { MovementMode } from './handles.js';

// Apply monkeypatch once
RayIntersector.prototype.intersectPointerCapture =
  patchedIntersectRayPointerCapture;
SphereIntersector.prototype.intersectPointerCapture =
  patchedIntersectSpherePointerCapture;
SphereIntersector.prototype.executeIntersection = patchedExecuteIntersection;
