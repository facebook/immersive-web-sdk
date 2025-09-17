/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Box3, Vector3 } from 'three';

export function calculateTrajectoryBounds(
  origin: Vector3,
  direction: Vector3,
  minY: number,
  gravity: number,
  outBox: Box3,
): Box3 {
  // Calculate trajectory parameters (same math as sampleParabolicCurve)
  const a = 0.5 * gravity;
  const b = direction.y;
  const c = origin.y - minY;

  const discriminant = b * b - 4 * a * c;
  const tEnd = (-b + Math.sqrt(discriminant)) / (2 * a);

  // Calculate peak height (maximum Y)
  const tPeak = -direction.y / gravity;
  const peakY =
    tPeak > 0
      ? origin.y + (direction.y * direction.y) / (2 * Math.abs(gravity))
      : origin.y;

  // Calculate horizontal extents at end time
  const endX = origin.x + direction.x * tEnd;
  const endZ = origin.z + direction.z * tEnd;

  // Update output box without allocations
  outBox.min.set(Math.min(origin.x, endX), minY, Math.min(origin.z, endZ));
  outBox.max.set(
    Math.max(origin.x, endX),
    Math.max(origin.y, peakY),
    Math.max(origin.z, endZ),
  );

  return outBox;
}

export function sampleParabolicCurve(
  start: Vector3,
  direction: Vector3,
  minY: number,
  gravity: number,
  points: Vector3[],
  offset = 0,
): void {
  const a = 0.5 * gravity;
  const b = direction.y;
  const c = start.y - minY;

  const discriminant = b * b - 4 * a * c;

  const tEnd = (-b + Math.sqrt(discriminant)) / (2 * a);

  const numPoints = points.length;
  for (let i = offset; i < numPoints + offset; i++) {
    const t = i / (offset + numPoints - 1);

    const tReal = t * tEnd;

    const posX = start.x + direction.x * tReal;
    const posY = start.y + direction.y * tReal + 0.5 * gravity * tReal * tReal;
    const posZ = start.z + direction.z * tReal;

    points[i - offset].set(posX, posY, posZ);
  }
}
