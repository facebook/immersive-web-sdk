/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import { getCapsuleAxisEndpoints } from '../../src/physics/physics-system.js';

describe('capsule physics dimensions', () => {
  it('treats dimensions[1] as total end-to-end height', () => {
    const [pointA, pointB] = getCapsuleAxisEndpoints(0.3, 1.3);
    expect(pointA[1]).toBeCloseTo(-0.35);
    expect(pointB[1]).toBeCloseTo(0.35);
  });

  it('supports a sphere-length capsule when total height equals diameter', () => {
    expect(getCapsuleAxisEndpoints(0.5, 1)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('rejects dimensions whose requested height is shorter than the diameter', () => {
    expect(getCapsuleAxisEndpoints(0.5, 0.8)).toBeNull();
    expect(getCapsuleAxisEndpoints(0, 1)).toBeNull();
  });
});
