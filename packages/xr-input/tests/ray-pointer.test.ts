/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Group,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  type Intersection,
} from 'three';
import { describe, expect, test } from 'vitest';
import { RayPointer } from '../src/pointer/ray-pointer.js';
import type { XROrigin } from '../src/rig/xr-origin.js';

describe('RayPointer', () => {
  test('allows normal XR trigger presses to synthesize click events', () => {
    const left = new Group();
    const pointer = new RayPointer(
      new PerspectiveCamera(),
      {
        raySpaces: { left, right: new Group() },
      } as unknown as XROrigin,
      'left',
    );

    expect(pointer.pointer.options.clickThresholdMs).toBe(800);
    pointer.dispose();
    expect(left.children).toHaveLength(0);
  });

  test('delivers a controller click to a child after a deliberate press', () => {
    const panel = new Group();
    const button = new Group();
    panel.add(button);
    panel.addEventListener('pointerdown', (event: any) =>
      event.stopPropagation(),
    );
    let clicks = 0;
    button.addEventListener('click', () => {
      clicks += 1;
    });

    const pointer = new RayPointer(
      new PerspectiveCamera(),
      {
        raySpaces: { left: new Group(), right: new Group() },
      } as unknown as XROrigin,
      'left',
    );
    pointer.pointer.setIntersection({
      details: { type: 'ray' },
      distance: 1,
      localPoint: new Vector3(),
      object: button,
      point: new Vector3(),
      pointerPosition: new Vector3(),
      pointerQuaternion: new Quaternion(),
    } as unknown as Intersection);
    pointer.pointer.commit({ timeStamp: 1_000 }, false);
    pointer.pointer.down({ button: 0, timeStamp: 1_000 });
    pointer.pointer.up({ button: 0, timeStamp: 1_500 });

    expect(clicks).toBe(1);
    pointer.dispose();
  });
});
