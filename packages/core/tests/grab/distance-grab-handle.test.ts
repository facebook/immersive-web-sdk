/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { DistanceGrabHandle, MovementMode } from '../../src/grab/handles.js';
import {
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
} from '../../src/runtime/three.js';

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

function createHandle(target: Object3D, returnToOrigin = false) {
  return new DistanceGrabHandle(
    target,
    new Object3D(), // sceneRoot
    () => ({}),
    MovementMode.MoveTowardsTarget,
    returnToOrigin,
    0.1, // moveSpeedFactor
    new Vector3(0, 0, 0),
    new Quaternion(0, 0, 0, 1),
    false, // detachOnGrab
  );
}

function createDetachedHandle(
  target: Object3D,
  sceneRoot: Object3D,
  returnToOrigin = false,
) {
  return new DistanceGrabHandle(
    target,
    sceneRoot,
    () => ({}),
    MovementMode.MoveTowardsTarget,
    returnToOrigin,
    0.1,
    new Vector3(),
    new Quaternion(),
    true,
  );
}

function pointerEvent(pointerId: number) {
  return {
    details: { type: 'ray' },
    intersection: { details: { type: 'ray' } },
    object: {
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    },
    point: new Vector3(),
    pointerId,
    pointerPosition: new Vector3(),
    pointerQuaternion: new Quaternion(),
    stopPropagation: vi.fn(),
    timeStamp: pointerId,
  } as any;
}

function expectMatricesClose(actual: Matrix4, expected: Matrix4) {
  for (let i = 0; i < actual.elements.length; i++) {
    expect(actual.elements[i]).toBeCloseTo(expected.elements[i], 6);
  }
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

  it('does not overshoot when a large frame delta accompanies controller movement', () => {
    const target = new Object3D();
    const handle = createHandle(target);
    const down = pointerEvent(1);

    handle.handlers.onPointerDown(down);

    // A stalled frame can produce a delta large enough that an unclamped
    // Vector3.lerp alpha extrapolates far beyond the controller target. A
    // sequence of such frames used to compound into enormous coordinates.
    for (const x of [3, -3, 3, -3]) {
      const move = pointerEvent(1);
      const expectedQuaternion = new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0),
        x > 0 ? Math.PI / 2 : -Math.PI / 2,
      );
      move.pointerPosition.set(x, 0, 0);
      move.pointerQuaternion.copy(expectedQuaternion);
      handle.handlers.onPointerMove(move);
      handle.update(0.5);

      expect(target.position.toArray().every(Number.isFinite)).toBe(true);
      expect(target.position.x).toBeGreaterThanOrEqual(-3);
      expect(target.position.x).toBeLessThanOrEqual(3);
      expect(target.quaternion.toArray().every(Number.isFinite)).toBe(true);
      expect(target.quaternion.length()).toBeCloseTo(1, 6);
      expect(target.quaternion.angleTo(expectedQuaternion)).toBeLessThan(1e-6);
    }

    expect(target.position.x).toBeCloseTo(-3, 6);
  });

  it.each<[string, number, number, number]>([
    ['negative', -0.5, 0, 0],
    ['NaN', Number.NaN, 0, 0],
    ['positive infinity', Number.POSITIVE_INFINITY, 3, Math.PI / 2],
  ])(
    'handles a %s frame delta without corrupting transforms',
    (_label, delta, expectedX, expectedAngle) => {
      const target = new Object3D();
      const handle = createHandle(target);
      const down = pointerEvent(1);
      handle.handlers.onPointerDown(down);

      const move = pointerEvent(1);
      const targetQuaternion = new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0),
        Math.PI / 2,
      );
      move.pointerPosition.set(3, 0, 0);
      move.pointerQuaternion.copy(targetQuaternion);
      handle.handlers.onPointerMove(move);
      handle.update(delta);

      expect(target.position.toArray().every(Number.isFinite)).toBe(true);
      expect(target.position.x).toBe(expectedX);
      expect(target.quaternion.toArray().every(Number.isFinite)).toBe(true);
      expect(target.quaternion.length()).toBeCloseTo(1, 6);
      const expectedQuaternion = new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0),
        expectedAngle,
      );
      expect(target.quaternion.angleTo(expectedQuaternion)).toBeLessThan(1e-6);
    },
  );

  it('returns to the original transform after a two-pointer handoff', () => {
    const target = new Object3D();
    target.position.set(1, 2, 3);
    target.rotation.set(0.1, 0.2, 0.3, 'ZYX');
    target.scale.set(2, 3, 4);
    const originalQuaternion = target.quaternion.clone();
    const handle = createHandle(target, true);
    const first = pointerEvent(1);
    const second = pointerEvent(2);

    handle.handlers.onPointerDown(first);
    const firstMove = pointerEvent(1);
    firstMove.pointerPosition.set(4, 5, 6);
    handle.handlers.onPointerMove(firstMove);
    handle.update(0.1);
    handle.handlers.onPointerDown(second);
    handle.handlers.onPointerUp(first);
    target.position.set(7, 8, 9);
    target.rotation.set(-0.4, 0.5, -0.6, 'XYZ');
    target.scale.set(0.5, 0.75, 1.25);
    handle.handlers.onPointerUp(second);

    expect(target.position.toArray()).toEqual([1, 2, 3]);
    expect(target.quaternion.angleTo(originalQuaternion)).toBeLessThan(1e-6);
    expect(target.rotation.order).toBe('ZYX');
    expect(target.scale.distanceTo(new Vector3(2, 3, 4))).toBeLessThan(1e-6);
  });

  it('returns to the exact transform and parent after detaching', () => {
    const sceneRoot = new Object3D();
    sceneRoot.position.set(-2, 1, 4);
    sceneRoot.rotation.set(0.1, -0.2, 0.3);
    const originalParent = new Object3D();
    originalParent.position.set(5, -3, 2);
    originalParent.rotation.set(-0.3, 0.4, -0.2);
    originalParent.scale.set(-2, 1, 3);
    sceneRoot.add(originalParent);
    const target = new Object3D();
    target.position.set(1, 2, 3);
    target.rotation.set(0.2, -0.1, 0.4, 'ZYX');
    target.scale.set(0.5, 0.75, 1.25);
    originalParent.add(target);
    sceneRoot.updateMatrixWorld(true);
    const originalPosition = target.position.clone();
    const originalQuaternion = target.quaternion.clone();
    const originalScale = target.scale.clone();
    const originalWorldMatrix = target.matrixWorld.clone();
    const handle = createDetachedHandle(target, sceneRoot, true);
    const event = pointerEvent(1);

    handle.handlers.onPointerDown(event);
    handle.handlers.onPointerMove(event);
    handle.update(0.1);
    target.position.set(20, 30, 40);
    handle.handlers.onPointerUp(event);
    target.updateMatrixWorld(true);

    expect(target.parent).toBe(originalParent);
    expect(target.position.distanceTo(originalPosition)).toBeLessThan(1e-6);
    expect(target.quaternion.angleTo(originalQuaternion)).toBeLessThan(1e-6);
    expect(target.scale.distanceTo(originalScale)).toBeLessThan(1e-6);
    expectMatricesClose(target.matrixWorld, originalWorldMatrix);
    expect(target.rotation.order).toBe('ZYX');
  });

  it('restores local transforms under a singular parent without non-finite values', () => {
    const sceneRoot = new Object3D();
    const parent = new Object3D();
    parent.scale.set(1, 0, 1);
    sceneRoot.add(parent);
    const target = new Object3D();
    target.position.set(1, 2, 3);
    target.rotation.set(0.2, -0.1, 0.4, 'ZYX');
    target.scale.set(0.5, 0.75, 1.25);
    parent.add(target);
    const originalPosition = target.position.clone();
    const originalQuaternion = target.quaternion.clone();
    const originalScale = target.scale.clone();
    const handle = createDetachedHandle(target, sceneRoot, true);
    const event = pointerEvent(1);

    handle.handlers.onPointerDown(event);
    handle.handlers.onPointerMove(event);
    handle.update(0.1);
    target.position.set(20, 30, 40);
    target.rotation.set(1, 1, 1);
    target.scale.set(3, 3, 3);
    handle.handlers.onPointerUp(event);
    target.updateMatrixWorld(true);

    expect(target.parent).toBe(parent);
    expect(target.position.distanceTo(originalPosition)).toBeLessThan(1e-6);
    expect(target.quaternion.angleTo(originalQuaternion)).toBeLessThan(1e-6);
    expect(target.scale.distanceTo(originalScale)).toBeLessThan(1e-6);
    expect(target.matrix.elements.every(Number.isFinite)).toBe(true);
    expect(target.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    expect(target.rotation.order).toBe('ZYX');
  });
});
