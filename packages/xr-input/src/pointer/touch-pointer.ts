/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Pointer, createTouchPointer } from '@pmndrs/pointer-events';
import type { PerspectiveCamera } from 'three';
import type { XROrigin } from '../rig/xr-origin.js';
import { isObjectTreeVisible } from './visibility.js';

/**
 * Default distance thresholds for poke/touch interactions (in meters)
 */
export const TOUCH_DEFAULTS = {
  /** Distance at which touch pointer detects hover (max detection range) */
  hoverRadius: 0.2, // 20cm - exitHoverDistance
  /** Distance at which touch pointer auto-selects (triggers down) */
  downRadius: 0.02, // 2cm - select when very close to surface
  /** Maximum time between pointerdown and pointerup to register as a click */
  clickThresholdMs: 800, // 800ms - more forgiving for XR poke interactions
};

/**
 * TouchPointer wraps an underlying Pointer instance configured for poke/touch
 * interactions using SphereIntersector centered at the finger tip position.
 *
 * @remarks
 * - Uses `indexTipSpaces` for hands (finger tip position from hand tracking)
 * - Falls back to `raySpaces` for controllers (no finger tracking available)
 * - Auto-selects when finger crosses the surface (distance <= 0)
 * - Works with PokeInteractable components for filtering
 *
 * @category Pointer
 */
export class TouchPointer {
  public pointer: Pointer;

  constructor(
    camera: PerspectiveCamera,
    xrOrigin: XROrigin,
    handedness: 'left' | 'right',
  ) {
    this.pointer = createTouchPointer(
      () => camera,
      { current: xrOrigin.indexTipSpaces[handedness] },
      {},
      {
        filter: isObjectTreeVisible,
        hoverRadius: TOUCH_DEFAULTS.hoverRadius,
        downRadius: TOUCH_DEFAULTS.downRadius,
        clickThresholdMs: TOUCH_DEFAULTS.clickThresholdMs,
        button: 0, // Use button 0 for touch selection (same as trigger)
      },
    );
  }

  /**
   * Update method for consistency with RayPointer/GrabPointer interface.
   * Touch pointer doesn't have visual feedback (the finger itself is the cursor).
   */
  update(
    _connected: boolean,
    _delta: number,
    _time: number,
    _start: boolean,
    _end: boolean,
  ) {
    // No visual updates needed - finger is the cursor
  }
}
