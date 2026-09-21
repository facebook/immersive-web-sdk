/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Matrix4, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { LocomotionEngine } from '../../src/core/engine.js';
import { EnvironmentType } from '../../src/types/environment-types.js';

function addStaticFloor(engine: LocomotionEngine, handle = 1): void {
  engine.addEnvironment(
    handle,
    new Float32Array([-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10]),
    new Uint32Array([0, 2, 1, 0, 3, 2]),
    EnvironmentType.STATIC,
    new Matrix4(),
  );
}

describe('LocomotionEngine grounding and jumping', () => {
  it('allows the first jump at time zero with the default cooldown', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    try {
      const engine = new LocomotionEngine(new Vector3());
      addStaticFloor(engine);
      engine.update(1 / 60);
      expect(engine.isGrounded).toBe(true);

      const yBeforeJump = engine.playerPosition.y;
      engine.jump();
      engine.update(1 / 60);

      expect(engine.playerPosition.y).toBeGreaterThan(yBeforeJump);
      expect(engine.isGrounded).toBe(false);
      expect(engine.updating).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it('jumps from rest without slide input after the environment is added', () => {
    const engine = new LocomotionEngine(new Vector3());
    engine.jumpHeight = 1.5;
    engine.jumpCooldown = 0;
    addStaticFloor(engine);

    expect(engine.updating).toBe(true);
    engine.update(1 / 60);
    expect(engine.isGrounded).toBe(true);

    const yBeforeJump = engine.playerPosition.y;
    engine.jump();
    engine.update(1 / 60);

    expect(engine.playerPosition.y).toBeGreaterThan(yBeforeJump);
    expect(engine.isGrounded).toBe(false);
  });

  it('rechecks grounding after a delayed environment removal', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    try {
      const engine = new LocomotionEngine(new Vector3());
      addStaticFloor(engine);
      engine.update(1 / 60);
      expect(engine.isGroundedOnStatic).toBe(true);
      engine.updating = false;

      now.mockReturnValue(1_601);
      engine.removeEnvironment(1);
      expect(engine.isGroundedOnStatic).toBe(false);

      now.mockReturnValue(2_202);
      engine.update(1 / 60);
      expect(engine.isGrounded).toBe(false);
      expect(engine.updating).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it('rechecks grounding after a delayed environment addition', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    try {
      const engine = new LocomotionEngine(new Vector3());
      addStaticFloor(engine);
      engine.update(1 / 60);
      expect(engine.isGroundedOnStatic).toBe(true);
      engine.updating = false;

      now.mockReturnValue(1_601);
      addStaticFloor(engine, 2);
      expect(engine.isGroundedOnStatic).toBe(false);

      now.mockReturnValue(2_202);
      engine.update(1 / 60);
      expect(engine.isGrounded).toBe(true);
      expect(engine.updating).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it('applies a jump on the first update after sleeping on static ground', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    try {
      const engine = new LocomotionEngine(new Vector3());
      addStaticFloor(engine);
      engine.update(1 / 60);
      expect(engine.isGroundedOnStatic).toBe(true);

      now.mockReturnValue(1_601);
      engine.update(1 / 60);
      expect(engine.updating).toBe(false);
      const yBeforeJump = engine.playerPosition.y;

      engine.jump();
      expect(engine.updating).toBe(true);
      expect(engine.isGroundedOnStatic).toBe(false);
      expect(engine.lastUpdateTime).toBe(1_601);

      engine.update(1 / 60);
      expect(engine.playerPosition.y).toBeGreaterThan(yBeforeJump);
      expect(engine.updating).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it('settles before sleeping after a jump and a teleported drop', () => {
    let nowMs = 1_000;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    try {
      const frameSeconds = 1 / 60;
      const engine = new LocomotionEngine(new Vector3());
      engine.jumpCooldown = 0;
      addStaticFloor(engine);
      engine.update(frameSeconds);

      const advanceFrame = () => {
        nowMs += frameSeconds * 1_000;
        engine.update(frameSeconds);
      };
      const settleAfterFlight = (): number => {
        let landedAtMs: number | undefined;
        let maxY = engine.playerPosition.y;
        for (let frame = 0; frame < 360; frame++) {
          const wasGroundedOnStatic = engine.isGroundedOnStatic;
          advanceFrame();
          maxY = Math.max(maxY, engine.playerPosition.y);
          if (!wasGroundedOnStatic && engine.isGroundedOnStatic) {
            landedAtMs ??= nowMs;
          }
          if (!engine.updating) {
            expect(landedAtMs).toBeDefined();
            expect(nowMs - landedAtMs!).toBeGreaterThan(
              engine.positionUpdateTimeout * 1_000,
            );
            expect(engine.playerPosition.y).toBeCloseTo(engine.floatHeight, 2);
            expect(Math.abs((engine as any).playerVelocity.y)).toBeLessThan(
              0.02,
            );
            return maxY;
          }
        }
        throw new Error('Locomotion engine did not settle within 360 frames');
      };

      for (let frame = 0; frame < 120 && engine.updating; frame++) {
        advanceFrame();
      }
      expect(engine.updating).toBe(false);

      const takeoffY = engine.playerPosition.y;
      engine.jump();
      const jumpApex = settleAfterFlight();
      expect(jumpApex - takeoffY).toBeGreaterThan(1.4);

      engine.teleport(new Vector3(0, 2, 0));
      settleAfterFlight();
    } finally {
      now.mockRestore();
    }
  });

  it('rechecks grounding after a delayed teleport from static ground', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    try {
      const engine = new LocomotionEngine(new Vector3());
      addStaticFloor(engine);
      engine.update(1 / 60);
      expect(engine.isGrounded).toBe(true);
      expect(engine.isGroundedOnStatic).toBe(true);
      engine.updating = false;

      now.mockReturnValue(1_601);
      engine.teleport(new Vector3(0, 2, 0));
      expect(engine.isGrounded).toBe(false);
      expect(engine.isGroundedOnStatic).toBe(false);
      expect(engine.lastUpdateTime).toBe(1_601);

      now.mockReturnValue(2_202);
      engine.update(1 / 60);
      expect(engine.playerPosition.y).toBeLessThan(2);
      expect(engine.updating).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it('stays airborne while ascending and reaches the configured apex', () => {
    const engine = new LocomotionEngine(new Vector3());
    engine.jumpHeight = 1.5;
    addStaticFloor(engine);
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
