/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest';
import { Box3, Vector3 } from 'three';
import {
  calculateTrajectoryBounds,
  sampleParabolicCurve,
} from '../../src/physics/math-utils.js';

// rayGravity used by the teleport ray is negative (default -0.4): the parabola
// opens downward, so the projectile rises then falls back toward the floor.
const RAY_GRAVITY = -0.4;

const isFiniteVec = (v: Vector3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

describe('sampleParabolicCurve', () => {
  it('produces finite points for a normal downward-aimed ray above the floor', () => {
    const start = new Vector3(0, 1.5, 0);
    const direction = new Vector3(0, -0.2, -1).normalize();
    const points = Array.from({ length: 10 }, () => new Vector3());

    sampleParabolicCurve(start, direction, 0, RAY_GRAVITY, points);

    expect(points.every(isFiniteVec)).toBe(true);
    // First sample sits at the ray origin.
    expect(points[0].x).toBeCloseTo(start.x, 5);
    expect(points[0].y).toBeCloseTo(start.y, 5);
    expect(points[0].z).toBeCloseTo(start.z, 5);
  });

  it('does not emit NaN when the trajectory can never reach minY (negative discriminant)', () => {
    // start BELOW the target floor and aimed downward: the parabola never
    // reaches minY, so b*b - 4*a*c is negative. Pre-fix this produced NaN.
    const start = new Vector3(0, 0, 0);
    const direction = new Vector3(0, -0.5, -1).normalize();
    const minY = 5; // floor above the origin -> c = start.y - minY < 0
    const points = Array.from({ length: 8 }, () => new Vector3());

    sampleParabolicCurve(start, direction, minY, RAY_GRAVITY, points);

    expect(points.every(isFiniteVec)).toBe(true);
  });

  it('respects the offset argument when writing into a shared buffer', () => {
    const start = new Vector3(0, 1.5, 0);
    const direction = new Vector3(0, 0, -1);
    const points = [new Vector3(), new Vector3(), new Vector3()];

    sampleParabolicCurve(start, direction, 0, RAY_GRAVITY, points, 1);

    expect(points.every(isFiniteVec)).toBe(true);
  });
});

describe('calculateTrajectoryBounds', () => {
  it('produces a finite bounding box for a normal ray', () => {
    const origin = new Vector3(0, 1.5, 0);
    const direction = new Vector3(0, -0.2, -1).normalize();
    const out = new Box3();

    calculateTrajectoryBounds(origin, direction, 0, RAY_GRAVITY, out);

    expect(isFiniteVec(out.min)).toBe(true);
    expect(isFiniteVec(out.max)).toBe(true);
    expect(out.min.y).toBe(0); // minY is the floor of the box
  });

  it('does not produce NaN bounds when the floor is unreachable (negative discriminant)', () => {
    const origin = new Vector3(0, 0, 0);
    const direction = new Vector3(0, -0.5, -1).normalize();
    const minY = 5;
    const out = new Box3();

    calculateTrajectoryBounds(origin, direction, minY, RAY_GRAVITY, out);

    expect(isFiniteVec(out.min)).toBe(true);
    expect(isFiniteVec(out.max)).toBe(true);
  });
});
