/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { findExtremeVertices } from '../../src/scene-understanding/scene-understanding-system.js';

// The runtime barrel pulls in xr-input's cursor-visual.ts, which touches
// `document` at module load; provide a minimal canvas stub before importing.
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

describe('findExtremeVertices', () => {
  it('returns the vertices with the smallest and largest coordinate sum', () => {
    // sums: v0=0, v1=3, v2=-3, v3=12
    const arr = new Float32Array([0, 0, 0, 1, 1, 1, -1, -1, -1, 4, 4, 4]);
    const { minEntry, maxEntry } = findExtremeVertices(arr);
    expect(minEntry).toEqual({ x: -1, y: -1, z: -1 });
    expect(maxEntry).toEqual({ x: 4, y: 4, z: 4 });
  });

  it('matches the legacy flatToVec3Array + findMinMaxEntries semantics', () => {
    // Reference implementation (the code this replaced).
    const legacy = (a: Float32Array) => {
      const pts: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < a.length; i += 3) {
        pts.push({ x: a[i], y: a[i + 1], z: a[i + 2] });
      }
      let minEntry = pts[0];
      let maxEntry = pts[0];
      let minSum = pts[0].x + pts[0].y + pts[0].z;
      let maxSum = minSum;
      for (let i = 1; i < pts.length; i++) {
        const s = pts[i].x + pts[i].y + pts[i].z;
        if (s < minSum) {
          minSum = s;
          minEntry = pts[i];
        }
        if (s > maxSum) {
          maxSum = s;
          maxEntry = pts[i];
        }
      }
      return { minEntry, maxEntry };
    };

    const arr = new Float32Array([
      2, -5, 1, 3, 3, 3, -2, -2, 0, 0.5, 0.5, 0.5, 9, -1, -1,
    ]);
    expect(findExtremeVertices(arr)).toEqual(legacy(arr));
  });

  it('handles a single vertex', () => {
    const { minEntry, maxEntry } = findExtremeVertices(
      new Float32Array([7, 8, 9]),
    );
    expect(minEntry).toEqual({ x: 7, y: 8, z: 9 });
    expect(maxEntry).toEqual({ x: 7, y: 8, z: 9 });
  });

  it('throws when the buffer length is not a positive multiple of 3', () => {
    expect(() => findExtremeVertices(new Float32Array([1, 2]))).toThrow();
    expect(() => findExtremeVertices(new Float32Array([]))).toThrow();
  });
});
