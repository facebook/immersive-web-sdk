/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, test, vi } from 'vitest';
import { CursorVisual } from '../src/pointer/cursor-visual.js';
import { XROrigin } from '../src/rig/xr-origin.js';

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

const Z_AXIS = new Vector3(0, 0, 1);

describe('CursorVisual', () => {
  test('keeps surface orientation and offset in world space under a rotated XR origin hierarchy', () => {
    const originParent = new Object3D();
    originParent.rotation.set(-0.1, 0.3, 0.2);
    const xrOrigin = new XROrigin();
    xrOrigin.rotation.set(0.35, 0.8, -0.2);
    originParent.add(xrOrigin);
    originParent.updateMatrixWorld(true);

    const surface = new Object3D();
    const pointOnFace = new Vector3(1.5, -0.25, -2);
    const worldNormal = new Vector3(1, 1, 0.5).normalize();
    const cursorVisual = new CursorVisual(xrOrigin, 0);

    cursorVisual.updateFromIntersection(
      {
        distance: 2,
        normal: worldNormal,
        object: surface,
        pointOnFace,
      } as any,
      1 / 60,
      false,
    );

    const cursor = (cursorVisual as any).cursor as Object3D;
    const zOffset = (cursorVisual as any).zOffset as number;
    const actualPosition = cursor.getWorldPosition(new Vector3());
    const expectedPosition = pointOnFace
      .clone()
      .addScaledVector(worldNormal, zOffset);
    const actualQuaternion = cursor.getWorldQuaternion(new Quaternion());
    const expectedQuaternion = new Quaternion().setFromUnitVectors(
      Z_AXIS,
      worldNormal,
    );

    expect(actualPosition.distanceTo(expectedPosition)).toBeLessThan(1e-6);
    expect(actualQuaternion.angleTo(expectedQuaternion)).toBeLessThan(1e-6);
    cursorVisual.dispose();
  });

  test('keeps fallback pointer orientation and offset in world space', () => {
    const originParent = new Object3D();
    originParent.rotation.set(0.15, -0.2, 0.3);
    const xrOrigin = new XROrigin();
    xrOrigin.rotation.set(-0.4, 0.65, 0.25);
    originParent.add(xrOrigin);
    originParent.updateMatrixWorld(true);

    const pointerQuaternion = new Quaternion().setFromEuler(
      new Euler(0.2, -0.45, 0.7),
    );
    const pointOnFace = new Vector3(-0.5, 0.75, -3);
    const cursorVisual = new CursorVisual(xrOrigin, 1);

    cursorVisual.updateFromIntersection(
      {
        distance: 3,
        object: new Object3D(),
        pointOnFace,
        pointerQuaternion,
      } as any,
      1 / 60,
      false,
    );

    const cursor = (cursorVisual as any).cursor as Object3D;
    const zOffset = (cursorVisual as any).zOffset as number;
    const worldDirection = Z_AXIS.clone().applyQuaternion(pointerQuaternion);
    const actualPosition = cursor.getWorldPosition(new Vector3());
    const expectedPosition = pointOnFace
      .clone()
      .addScaledVector(worldDirection, zOffset);
    const actualQuaternion = cursor.getWorldQuaternion(new Quaternion());

    expect(actualPosition.distanceTo(expectedPosition)).toBeLessThan(1e-6);
    expect(actualQuaternion.angleTo(pointerQuaternion)).toBeLessThan(1e-6);
    cursorVisual.dispose();
  });
});
