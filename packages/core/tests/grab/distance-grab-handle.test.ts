/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { DistanceGrabHandle, MovementMode } from '../../src/grab/handles.js';
import { Object3D, Quaternion, Vector3 } from '../../src/runtime/three.js';

// handles.ts -> runtime barrel -> xr-input cursor-visual.ts touches `document`
// at module load; provide a minimal canvas stub before importing.
vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        arc: () => {},
        beginPath: () => {},
        clearRect: () => {},
        fill: () => {},
        fillStyle: '',
        lineWidth: 0,
        stroke: () => {},
        strokeStyle: '',
      }),
      height: 0,
      width: 0,
    }),
  };
});

function createHandle(target: Object3D) {
  return new DistanceGrabHandle(
    target,
    new Object3D(), // sceneRoot
    () => ({}),
    MovementMode.MoveTowardsTarget,
    false, // returnToOrigin
    0.1, // moveSpeedFactor
    new Vector3(0, 0, 0),
    new Quaternion(0, 0, 0, 1),
    false, // detachOnGrab
  );
}

describe('DistanceGrabHandle', () => {
  it('does not attach a pointerup listener to the target (no listener leak)', () => {
    const target = new Object3D();
    const addSpy = vi.spyOn(target, 'addEventListener');

    createHandle(target);

    const pointerUpAdds = addSpy.mock.calls.filter(
      (call) => call[0] === 'pointerup',
    );
    expect(pointerUpAdds).toHaveLength(0);
  });

  it('resets isSnapped on update() once there are no active pointers', () => {
    const handle = createHandle(new Object3D());
    (handle as any).isSnapped = true;

    // No active pointers (released / cancelled / force-released).
    handle.update(0.016);

    expect((handle as any).isSnapped).toBe(false);
  });

  it('keeps isSnapped while a grab is active (pointers present)', () => {
    const handle = createHandle(new Object3D());
    (handle as any).isSnapped = true;
    // Simulate one active pointer; no move event this frame -> early return,
    // and the reset branch (size === 0) is skipped.
    handle.inputState.set(1 as any, {} as any);

    handle.update(0.016);

    expect((handle as any).isSnapped).toBe(true);
  });
});
