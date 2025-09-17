/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Pointer, createGrabPointer } from '@pmndrs/pointer-events';
import type { PerspectiveCamera } from 'three';
import type { XROrigin } from '../rig/xr-origin.js';

export class GrabPointer {
  public pointer: Pointer;

  constructor(
    camera: PerspectiveCamera,
    xrOrigin: XROrigin,
    handedness: 'left' | 'right',
  ) {
    this.pointer = createGrabPointer(
      () => camera,
      { current: xrOrigin.gripSpaces[handedness] },
      {},
    );
  }

  // Align interface with RayPointer (no visuals for now)
  update(
    _connected: boolean,
    _delta: number,
    _time: number,
    _start: boolean,
    _end: boolean,
  ) {}
}
