/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FilteredEyeGaze } from '../src/pointer/filtered-eye-gaze.js';

describe('FilteredEyeGaze', () => {
  it('keeps an equivalent antipodal quaternion on the same hemisphere', () => {
    const filter = new FilteredEyeGaze({
      minCutoff: 0.01,
      beta: 0,
      dCutoff: 1,
    });
    const position = new Vector3(1, 2, 3);
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 3,
    );
    const antipodal = new Quaternion(
      -rotation.x,
      -rotation.y,
      -rotation.z,
      -rotation.w,
    );
    const outPosition = new Vector3();
    const first = new Quaternion();
    const second = new Quaternion();

    filter.filter(position, rotation, 1 / 60, outPosition, first);
    filter.filter(position, antipodal, 1 / 60, outPosition, second);

    expect(Math.abs(first.dot(rotation))).toBeCloseTo(1, 6);
    expect(Math.abs(second.dot(rotation))).toBeCloseTo(1, 6);
    expect(first.angleTo(second)).toBeLessThan(1e-6);
    expect(outPosition).toEqual(position);
  });
});
