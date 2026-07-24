/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { HandleStore } from '@pmndrs/handle';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelGrabHandle,
  findHolderHand,
} from '../../src/grab/grab-helpers.js';
import {
  hasRaycastableMesh,
  resetGrabWarningStateForTests,
  warnIfNoRaycastableMesh,
} from '../../src/grab/grab-warnings.js';
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from '../../src/runtime/three.js';

interface FakeHandle {
  inputState: Map<number, unknown>;
  cancelled: boolean;
  cancel(): void;
}

function makeFakeHandle(activePointerIds: number[] = []): FakeHandle {
  const inputState = new Map<number, unknown>();
  for (const id of activePointerIds) {
    inputState.set(id, {});
  }
  return {
    inputState,
    cancelled: false,
    cancel() {
      this.cancelled = true;
    },
  };
}

function makeFakeEntity(index: number, object3D: Object3D) {
  return { index, object3D };
}

describe('cancelGrabHandle (backs GrabSystem.forceRelease)', () => {
  it('cancels the handle when present', () => {
    const handle = makeFakeHandle([10]);
    cancelGrabHandle(handle as unknown as HandleStore<unknown>);
    expect(handle.cancelled).toBe(true);
  });

  it('is a no-op when handle is undefined', () => {
    expect(() => cancelGrabHandle(undefined)).not.toThrow();
  });

  it('swallows errors thrown by the underlying cancel()', () => {
    const handle = {
      inputState: new Map<number, unknown>([[10, {}]]),
      cancel() {
        throw new Error('boom');
      },
    };
    expect(() =>
      cancelGrabHandle(handle as unknown as HandleStore<unknown>),
    ).not.toThrow();
  });
});

describe('findHolderHand (backs GrabSystem.getHolderHand)', () => {
  // Hand ↔ pointer-ID map mirrors the wiring in GrabSystem.getHolderHand:
  // each hand contributes both its `grab` and `ray` sub-pointer IDs so that
  // near grabs (grab pointer) and distance grabs (ray pointer) both report.
  const LEFT_GRAB = 10;
  const LEFT_RAY = 11;
  const RIGHT_GRAB = 20;
  const RIGHT_RAY = 21;
  const left = [LEFT_GRAB, LEFT_RAY];
  const right = [RIGHT_GRAB, RIGHT_RAY];

  it('returns null when handle is undefined', () => {
    expect(findHolderHand(undefined, left, right)).toBeNull();
  });

  it('returns null when the handle has no active grabs', () => {
    const handle = makeFakeHandle([]);
    expect(
      findHolderHand(handle as unknown as HandleStore<unknown>, left, right),
    ).toBeNull();
  });

  it("returns 'left' when a left grab pointer ID is in inputState", () => {
    const handle = makeFakeHandle([LEFT_GRAB]);
    expect(
      findHolderHand(handle as unknown as HandleStore<unknown>, left, right),
    ).toBe('left');
  });

  it("returns 'right' when a right grab pointer ID is in inputState", () => {
    const handle = makeFakeHandle([RIGHT_GRAB]);
    expect(
      findHolderHand(handle as unknown as HandleStore<unknown>, left, right),
    ).toBe('right');
  });

  it("returns 'left' for a left-hand distance grab (ray pointer)", () => {
    const handle = makeFakeHandle([LEFT_RAY]);
    expect(
      findHolderHand(handle as unknown as HandleStore<unknown>, left, right),
    ).toBe('left');
  });

  it("returns 'right' for a right-hand distance grab (ray pointer)", () => {
    const handle = makeFakeHandle([RIGHT_RAY]);
    expect(
      findHolderHand(handle as unknown as HandleStore<unknown>, left, right),
    ).toBe('right');
  });

  it("prefers 'left' when both hands are active (two-hand grab)", () => {
    const handle = makeFakeHandle([LEFT_GRAB, RIGHT_GRAB]);
    expect(
      findHolderHand(handle as unknown as HandleStore<unknown>, left, right),
    ).toBe('left');
  });

  it('returns null when only an unrelated pointer ID is in inputState', () => {
    const handle = makeFakeHandle([99]);
    expect(
      findHolderHand(handle as unknown as HandleStore<unknown>, left, right),
    ).toBeNull();
  });
});

describe('grab warnings', () => {
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetGrabWarningStateForTests();
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    resetGrabWarningStateForTests();
  });

  it('detects a raycastable mesh in an Object3D subtree', () => {
    const root = new Object3D();
    root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));

    expect(hasRaycastableMesh(root)).toBe(true);
  });

  it('detects when an Object3D subtree has no raycastable mesh', () => {
    const root = new Object3D();
    root.add(new Object3D());

    expect(hasRaycastableMesh(root)).toBe(false);
  });

  it('warns once when a grabbable entity has no raycastable mesh', () => {
    const root = new Object3D();

    warnIfNoRaycastableMesh(makeFakeEntity(7, root), 'OneHandGrabbable');
    warnIfNoRaycastableMesh(makeFakeEntity(7, root), 'OneHandGrabbable');

    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(
      "[IWSDK] Entity #7 has OneHandGrabbable but no raycastable mesh in its Object3D subtree. Grab will not work. Attach a Mesh as a child or to the entity's root Object3D.",
    );
  });

  it('includes the Object3D name when available', () => {
    const root = new Object3D();
    root.name = 'Grab Anchor';

    warnIfNoRaycastableMesh(makeFakeEntity(12, root), 'DistanceGrabbable');

    expect(consoleWarn).toHaveBeenCalledWith(
      '[IWSDK] Entity "Grab Anchor" (index 12) has DistanceGrabbable but no raycastable mesh in its Object3D subtree. Grab will not work. Attach a Mesh as a child or to the entity\'s root Object3D.',
    );
  });

  it('does not warn when a grabbable entity has a raycastable mesh', () => {
    const root = new Object3D();
    root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));

    warnIfNoRaycastableMesh(makeFakeEntity(7, root), 'TwoHandsGrabbable');

    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
