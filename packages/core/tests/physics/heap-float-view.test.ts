/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  PHYSICS_HEADER_BYTES,
  PHYSICS_INPUT_RECORD_FLOATS,
  PHYSICS_OUTPUT_RECORD_FLOATS,
  physicsExchangeByteLength,
} from '../../src/physics/physics-worker-protocol.js';
import { reusableFloat32View } from '../../src/physics/physics-worker-utils.js';

describe('physics transferable exchange buffers', () => {
  it('sizes the payload for the larger of commands and results', () => {
    expect(physicsExchangeByteLength(10, 1)).toBe(
      PHYSICS_HEADER_BYTES + 10 * PHYSICS_INPUT_RECORD_FLOATS * 4,
    );
    expect(physicsExchangeByteLength(1, 10)).toBe(
      PHYSICS_HEADER_BYTES + 10 * PHYSICS_OUTPUT_RECORD_FLOATS * 4,
    );
  });

  it('transfers ownership without copying or SharedArrayBuffer', () => {
    const original = new ArrayBuffer(128);
    new Uint32Array(original)[0] = 0xdecafbad;

    const transferred = structuredClone(original, { transfer: [original] });

    expect(original.byteLength).toBe(0);
    expect(transferred).toBeInstanceOf(ArrayBuffer);
    expect(transferred).not.toBeInstanceOf(SharedArrayBuffer);
    expect(new Uint32Array(transferred)[0]).toBe(0xdecafbad);
  });
});

describe('physics worker heap views', () => {
  it('reuses a view until the WASM heap buffer changes', () => {
    const firstBuffer = new ArrayBuffer(64);
    const firstView = reusableFloat32View(undefined, firstBuffer);

    expect(reusableFloat32View(firstView, firstBuffer)).toBe(firstView);

    const grownBuffer = new ArrayBuffer(128);
    const grownView = reusableFloat32View(firstView, grownBuffer);
    expect(grownView).not.toBe(firstView);
    expect(grownView.buffer).toBe(grownBuffer);
  });
});
