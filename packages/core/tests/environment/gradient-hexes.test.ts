/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { computeGradientHexes } from '../../src/environment/environment-system.js';
import { Color } from '../../src/runtime/three.js';

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

describe('computeGradientHexes', () => {
  it('computes the three channel hexes correctly', () => {
    const out = new Color();
    const { skyHex, equatorHex, groundHex } = computeGradientHexes(
      out,
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    );
    expect(skyHex).toBe(new Color(1, 0, 0).getHex());
    expect(equatorHex).toBe(new Color(0, 1, 0).getHex());
    expect(groundHex).toBe(new Color(0, 0, 1).getHex());
  });

  it('reuses the provided Color instance (no per-call allocation) and is not corrupted by reuse', () => {
    const out = new Color();
    const before = out;
    const { skyHex, equatorHex, groundHex } = computeGradientHexes(
      out,
      [0.25, 0.5, 0.75],
      [0.1, 0.2, 0.3],
      [0.9, 0.8, 0.7],
    );

    // Each hex must be captured before the next setRGB overwrites `out`.
    expect(skyHex).toBe(new Color().setRGB(0.25, 0.5, 0.75).getHex());
    expect(equatorHex).toBe(new Color().setRGB(0.1, 0.2, 0.3).getHex());
    expect(groundHex).toBe(new Color().setRGB(0.9, 0.8, 0.7).getHex());

    // Same instance was reused; it now holds the last (ground) color.
    expect(out).toBe(before);
    expect(out.getHex()).toBe(groundHex);
  });

  it('matches the previous mixed `new Color()` / `new Color(r,g,b)` results', () => {
    const sky: [number, number, number] = [0.2, 0.4, 0.6];
    const equator: [number, number, number] = [0.5, 0.5, 0.5];
    const ground: [number, number, number] = [0.05, 0.1, 0.15];

    const legacySky = new Color().setRGB(sky[0], sky[1], sky[2]).getHex();
    const legacyEquator = new Color(
      equator[0],
      equator[1],
      equator[2],
    ).getHex();
    const legacyGround = new Color(ground[0], ground[1], ground[2]).getHex();

    const { skyHex, equatorHex, groundHex } = computeGradientHexes(
      new Color(),
      sky,
      equator,
      ground,
    );
    expect(skyHex).toBe(legacySky);
    expect(equatorHex).toBe(legacyEquator);
    expect(groundHex).toBe(legacyGround);
  });
});
