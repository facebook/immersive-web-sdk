/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LocomotionEngine } from '../../src/core/engine.js';
import { EnvironmentType } from '../../src/types/environment-types.js';

describe('LocomotionEngine jumping', () => {
  it('stays airborne while ascending and reaches the configured apex', () => {
    const engine = new LocomotionEngine(new Vector3());
    engine.jumpHeight = 1.5;
    engine.addEnvironment(
      1,
      new Float32Array([-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10]),
      new Uint32Array([0, 2, 1, 0, 3, 2]),
      EnvironmentType.STATIC,
      new Matrix4(),
    );
    engine.slide(new Vector3());

    for (let frame = 0; frame < 120 && !engine.isGrounded; frame++) {
      engine.update(1 / 60);
    }
    expect(engine.isGrounded).toBe(true);

    engine.jump();
    engine.update(1 / 60);
    expect(engine.isGrounded).toBe(false);

    let apex = engine.playerPosition.y;
    for (let frame = 0; frame < 240 && !engine.isGrounded; frame++) {
      engine.update(1 / 60);
      apex = Math.max(apex, engine.playerPosition.y);
    }

    expect(apex).toBeCloseTo(1.5, 1);
    expect(engine.isGrounded).toBe(true);
  });
});
