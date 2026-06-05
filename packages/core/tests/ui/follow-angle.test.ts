/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import { clampedAcosDeg } from '../../src/ui/follow.js';

describe('clampedAcosDeg', () => {
  it('returns 0 degrees for perfectly aligned vectors (dot = 1)', () => {
    expect(clampedAcosDeg(1)).toBe(0);
  });

  it('returns 180 degrees for opposite vectors (dot = -1)', () => {
    expect(clampedAcosDeg(-1)).toBeCloseTo(180, 6);
  });

  it('returns 90 degrees for orthogonal vectors (dot = 0)', () => {
    expect(clampedAcosDeg(0)).toBeCloseTo(90, 6);
  });

  it('does not return NaN when the dot product overshoots 1 due to FP error', () => {
    // Regression: Math.acos(1.0000001) is NaN. The clamp must keep it finite.
    const result = clampedAcosDeg(1.0000001);
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBe(0);
  });

  it('does not return NaN when the dot product undershoots -1 due to FP error', () => {
    const result = clampedAcosDeg(-1.0000001);
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBeCloseTo(180, 6);
  });
});
