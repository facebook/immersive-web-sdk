/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  findAxisAlignedBounds,
  findExtremeVertices,
} from '../../src/scene-understanding/scene-understanding-system.js';

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

describe('findAxisAlignedBounds', () => {
  it('preserves the legacy coordinate-sum behavior under its public name', () => {
    const arr = new Float32Array([
      2, -5, 1, 3, 3, 3, -2, -2, 0, 0.5, 0.5, 0.5, 9, -1, -1,
    ]);

    expect(findExtremeVertices(arr)).toEqual({
      minEntry: { x: -2, y: -2, z: 0 },
      maxEntry: { x: 3, y: 3, z: 3 },
    });
    expect(findExtremeVertices).not.toBe(findAxisAlignedBounds);
  });

  it('returns independent minima and maxima for every axis', () => {
    const arr = new Float32Array([0, 0, 0, 1, 1, 1, -1, -1, -1, 4, 4, 4]);
    const { minEntry, maxEntry } = findAxisAlignedBounds(arr);
    expect(minEntry).toEqual({ x: -1, y: -1, z: -1 });
    expect(maxEntry).toEqual({ x: 4, y: 4, z: 4 });
  });

  it('does not confuse coordinate-sum extrema with an axis-aligned box', () => {
    const arr = new Float32Array([
      2, -5, 1, 3, 3, 3, -2, -2, 0, 0.5, 0.5, 0.5, 9, -1, -1,
    ]);
    expect(findAxisAlignedBounds(arr)).toEqual({
      minEntry: { x: -2, y: -5, z: -1 },
      maxEntry: { x: 9, y: 3, z: 3 },
    });
  });

  it('handles a single vertex', () => {
    const { minEntry, maxEntry } = findAxisAlignedBounds(
      new Float32Array([7, 8, 9]),
    );
    expect(minEntry).toEqual({ x: 7, y: 8, z: 9 });
    expect(maxEntry).toEqual({ x: 7, y: 8, z: 9 });
  });

  it('throws when the buffer length is not a positive multiple of 3', () => {
    expect(() => findAxisAlignedBounds(new Float32Array([1, 2]))).toThrow();
    expect(() => findAxisAlignedBounds(new Float32Array([]))).toThrow();
    expect(() => findExtremeVertices(new Float32Array([1, 2]))).toThrow();
    expect(() => findExtremeVertices(new Float32Array([]))).toThrow();
  });
});
