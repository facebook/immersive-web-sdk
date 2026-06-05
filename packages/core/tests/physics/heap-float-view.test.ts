/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';

// physics-system.ts -> runtime barrel -> xr-input cursor-visual.ts touches
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

import { PhysicsSystem } from '../../src/physics/physics-system.js';
import { Object3D, PerspectiveCamera, Scene } from '../../src/runtime/three.js';

function createPhysicsSystem() {
  const world = {
    camera: new PerspectiveCamera(),
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer: {},
    scene: new Scene(),
    session: undefined,
    visibilityState: { value: 'visible' },
  };
  return new PhysicsSystem(world as any, {} as any, 0);
}

describe('PhysicsSystem.getHeapFloatView', () => {
  it('caches the heap view across calls (no per-call allocation)', () => {
    const system = createPhysicsSystem();
    const buffer = new ArrayBuffer(64);
    (system as any).havok = { HEAPU8: { buffer } };

    const view1 = (system as any).getHeapFloatView();
    const view2 = (system as any).getHeapFloatView();

    expect(view1).toBeInstanceOf(Float32Array);
    expect(view1).toBe(view2);
    expect(view1.buffer).toBe(buffer);
  });

  it('recreates the view when the underlying heap buffer changes (WASM growth)', () => {
    const system = createPhysicsSystem();
    const bufferA = new ArrayBuffer(64);
    (system as any).havok = { HEAPU8: { buffer: bufferA } };
    const viewA = (system as any).getHeapFloatView();

    // Simulate the Havok heap growing: HEAPU8.buffer becomes a new ArrayBuffer.
    const bufferB = new ArrayBuffer(128);
    (system as any).havok.HEAPU8.buffer = bufferB;
    const viewB = (system as any).getHeapFloatView();

    expect(viewB).not.toBe(viewA);
    expect(viewB.buffer).toBe(bufferB);
  });

  it('reads the same floats a fresh view would (parity with the old per-frame view)', () => {
    const system = createPhysicsSystem();
    const buffer = new ArrayBuffer(16 * 4);
    const seed = new Float32Array(buffer);
    for (let i = 0; i < 16; i++) {
      seed[i] = i * 1.5;
    }
    (system as any).havok = { HEAPU8: { buffer } };

    const cached = (system as any).getHeapFloatView();
    const fresh = new Float32Array(buffer, 0, 16); // the pre-fix per-frame view
    for (let i = 0; i < 16; i++) {
      expect(cached[i]).toBe(fresh[i]);
    }
  });
});
