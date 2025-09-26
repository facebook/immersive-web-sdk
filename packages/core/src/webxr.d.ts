/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// XR global augmentations centralized in @iwsdk/xr-input/src/webxr.d.ts

import type { Entity } from 'elics';
import { Object3D } from './runtime/index.js';
// Extend the Object3D interface
declare module 'three' {
  interface Object3D {
    // flexInstancedMesh is removed from core runtime; keep slot for compatibility if needed
    // flexInstancedMesh?: any;
    entityIdx?: number;
    positionView?: Float32Array;
    rotationView?: Float32Array;
    quaternionView?: Float32Array;
    scaleView?: Float32Array;
    attachToEntity: (entity: Entity) => void;
    detachFromEntity: () => void;
    _parent?: Object3D | null;
  }
}
