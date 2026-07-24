/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { signal } from '@preact/signals-core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { World } from '../../src/ecs/world.js';
import { LevelTag } from '../../src/level/level-tag.js';
import {
  Object3D,
  Quaternion,
  Scene,
  Vector3,
} from '../../src/runtime/three.js';
import { SyncedEuler } from '../../src/transform/synced-euler.js';
import { SyncedQuaternion } from '../../src/transform/synced-quaternion.js';
import { SyncedVector3 } from '../../src/transform/synced-vector3.js';
import { Transform } from '../../src/transform/transform.js';

// world.ts -> @iwsdk/xr-input -> cursor-visual.ts touches `document` at module
// load; provide a minimal canvas stub before importing.
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

describe('Transform Integration Tests', () => {
  describe('World.createTransformEntity', () => {
    it('links the Object3D parent before the next TransformSystem update', () => {
      const world = createTransformWorld();
      const parentObject = new Object3D();
      parentObject.position.set(1, 2, 3);
      const parent = world.createTransformEntity(
        parentObject,
        world.activeLevel.value,
      );

      const childObject = new Object3D();
      childObject.position.set(4, 0, 0);
      const child = world.createTransformEntity(childObject, parent);

      expect(childObject.parent).toBe(parentObject);
      expect(parentObject.children).toContain(childObject);
      expect(child.getValue(Transform, 'parent')).toBe(parent);

      parentObject.updateMatrixWorld(true);
      childObject.updateMatrixWorld(true);

      const worldPosition = childObject.getWorldPosition(new Vector3());
      expect(worldPosition.x).toBeCloseTo(5);
      expect(worldPosition.y).toBeCloseTo(2);
      expect(worldPosition.z).toBeCloseTo(3);
    });
  });

  describe('Continuous Rotation (Bug Fix)', () => {
    let euler: SyncedEuler;
    let quat: SyncedQuaternion;
    let buffer: Float32Array;

    beforeEach(() => {
      buffer = new Float32Array([0, 0, 0, 1]);
      quat = new SyncedQuaternion().setTarget(buffer);
      euler = new SyncedEuler().setSyncedQuaternion(quat);
    });

    it('should allow continuous rotation without stopping (original bug)', () => {
      // Simulate continuous rotation like in spin.js
      const delta = 0.016; // ~60fps

      // Rotate for many frames (simulate spinning object)
      for (let i = 0; i < 200; i++) {
        euler.y += delta;
      }

      // Should have rotated multiple full rotations
      const totalRotation = 200 * delta;
      expect(euler.y).toBeCloseTo(totalRotation, 2);

      // Verify it didn't stop at 90 degrees (PI/2)
      expect(euler.y).toBeGreaterThan(Math.PI / 2);
    });

    it('should not reset rotation after passing 90 degrees', () => {
      euler.y = 0;

      // Rotate past 90 degrees
      for (let angle = 0; angle < Math.PI; angle += 0.1) {
        euler.y = angle;

        // Verify rotation value is what we just set
        expect(euler.y).toBeCloseTo(angle, 5);
      }
    });

    it('should handle rotation through all quadrants', () => {
      const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

      for (const angle of angles) {
        euler.y = angle;
        expect(euler.y).toBeCloseTo(angle, 5);
      }
    });

    it('should not get dirty after self-update (key optimization)', () => {
      // Start clean
      euler.y = 0;

      // Update rotation
      euler.y += 0.1;

      // Read immediately - should NOT trigger recomputation from quaternion
      const y1 = euler.y;
      const y2 = euler.y;

      // Both reads should return the same value (cached, not recomputed)
      expect(y1).toBe(y2);
      expect(y1).toBeCloseTo(0.1);
    });
  });

  describe('lookAt Integration', () => {
    let euler: SyncedEuler;
    let quat: SyncedQuaternion;
    let buffer: Float32Array;

    beforeEach(() => {
      buffer = new Float32Array([0, 0, 0, 1]);
      quat = new SyncedQuaternion().setTarget(buffer);
      euler = new SyncedEuler().setSyncedQuaternion(quat);
    });

    it('should sync rotation after lookAt-style quaternion updates', () => {
      // Simulate lookAt by setting quaternion to specific rotation
      quat.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

      // Rotation should reflect the quaternion change
      expect(euler.y).toBeCloseTo(Math.PI / 2);
    });

    it('should handle multiple lookAt operations', () => {
      const angles = [
        Math.PI / 4,
        Math.PI / 2,
        Math.PI / 3, // Avoid PI (180°) due to Euler angle ambiguity
        -Math.PI / 2,
        -Math.PI / 4,
      ];

      for (const angle of angles) {
        quat.setFromAxisAngle(new Vector3(0, 1, 0), angle);
        expect(euler.y).toBeCloseTo(angle);
      }
    });
  });

  describe('Performance: Lazy Evaluation', () => {
    let euler: SyncedEuler;
    let quat: SyncedQuaternion;
    let buffer: Float32Array;

    beforeEach(() => {
      buffer = new Float32Array([0, 0, 0, 1]);
      quat = new SyncedQuaternion().setTarget(buffer);
      euler = new SyncedEuler().setSyncedQuaternion(quat);
    });

    it('should NOT compute rotation if never read after quaternion change', () => {
      // Change quaternion multiple times
      quat.setFromAxisAngle(new Vector3(0, 1, 0), 0.1);
      quat.setFromAxisAngle(new Vector3(0, 1, 0), 0.2);
      quat.setFromAxisAngle(new Vector3(0, 1, 0), 0.3);

      // Never read rotation.x/y/z
      // In old implementation, this would have computed 3 times
      // In new implementation, rotation is just marked dirty (cheap)

      // Only when we read does it compute (once)
      expect(euler.y).toBeCloseTo(0.3);
    });

    it('should cache rotation values for multiple reads (dirty flag pattern)', () => {
      quat.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

      // Multiple reads should use cached value
      const y1 = euler.y;
      const y2 = euler.y;
      const y3 = euler.y;

      // All reads should be consistent (using cached values)
      expect(y1).toBe(y2);
      expect(y2).toBe(y3);
    });
  });

  describe('Mixed Operations', () => {
    let euler: SyncedEuler;
    let quat: SyncedQuaternion;
    let buffer: Float32Array;

    beforeEach(() => {
      buffer = new Float32Array([0, 0, 0, 1]);
      quat = new SyncedQuaternion().setTarget(buffer);
      euler = new SyncedEuler().setSyncedQuaternion(quat);
    });

    it('should handle alternating rotation and quaternion updates', () => {
      // Update rotation
      euler.y = 0.1;
      expect(quat.y).toBeCloseTo(Math.sin(0.05));

      // Update quaternion
      quat.multiply(
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.1),
      );
      expect(euler.y).toBeCloseTo(0.2);

      // Update rotation again
      euler.y = 0.5;
      expect(quat.y).toBeCloseTo(Math.sin(0.25));
    });

    it('should maintain consistency through complex operations', () => {
      // Set initial rotation
      euler.set(0.1, 0.2, 0.3);

      // Get quaternion values
      const qx1 = quat.x;
      const qy1 = quat.y;
      const qz1 = quat.z;
      const qw1 = quat.w;

      // Set same rotation via setFromEuler
      quat.setFromEuler(euler);

      // Quaternion should be the same (or very close)
      expect(quat.x).toBeCloseTo(qx1);
      expect(quat.y).toBeCloseTo(qy1);
      expect(quat.z).toBeCloseTo(qz1);
      expect(quat.w).toBeCloseTo(qw1);
    });
  });

  describe('ECS Buffer Integration', () => {
    it('should handle direct buffer modifications (ECS system writes)', () => {
      const buffer = new Float32Array([0, 0, 0, 1]);
      const quat = new SyncedQuaternion().setTarget(buffer);
      const euler = new SyncedEuler().setSyncedQuaternion(quat);

      // Initial rotation is 0
      expect(euler.y).toBeCloseTo(0);

      // ECS system writes quaternion buffer directly (bypassing SyncedQuaternion methods)
      // This simulates what would happen in a real ECS system
      buffer[0] = 0;
      buffer[1] = Math.sin(Math.PI / 4); // 90 degrees around Y
      buffer[2] = 0;
      buffer[3] = Math.cos(Math.PI / 4);

      // Reading quaternion should work (it reads from buffer)
      expect(quat.y).toBeCloseTo(Math.sin(Math.PI / 4));

      // But does rotation update? This might be stale!
      expect(euler.y).toBeCloseTo(Math.PI / 2);
    });

    it('should work with actual ECS-style buffers', () => {
      // Simulate ECS component buffer (position + orientation + scale)
      const componentBuffer = new Float32Array(10);

      // Position at indices 0-2
      const position = new SyncedVector3().setTarget(componentBuffer, 0);

      // Quaternion at indices 3-6
      const quaternion = new SyncedQuaternion().setTarget(componentBuffer, 3);

      // Scale at indices 7-9
      const scale = new SyncedVector3().setTarget(componentBuffer, 7);

      // Rotation (synced to quaternion)
      const rotation = new SyncedEuler().setSyncedQuaternion(quaternion);

      // Update all transforms
      position.set(1, 2, 3);
      rotation.y = Math.PI / 2;
      scale.set(2, 2, 2);

      // Verify position buffer
      expect(componentBuffer[0]).toBe(1);
      expect(componentBuffer[1]).toBe(2);
      expect(componentBuffer[2]).toBe(3);

      // Verify quaternion buffer (90 degrees around Y)
      expect(componentBuffer[4]).toBeCloseTo(Math.sin(Math.PI / 4));
      expect(componentBuffer[6]).toBeCloseTo(Math.cos(Math.PI / 4));

      // Verify scale buffer
      expect(componentBuffer[7]).toBe(2);
      expect(componentBuffer[8]).toBe(2);
      expect(componentBuffer[9]).toBe(2);

      // Verify rotation reads correctly
      expect(rotation.y).toBeCloseTo(Math.PI / 2);
    });
  });
});

function createTransformWorld(): World {
  const world = new World();
  world.registerComponent(Transform).registerComponent(LevelTag);

  world.scene = new Scene();
  world.sceneEntity = world.createTransformEntity(world.scene);
  const activeLevel = world.createTransformEntity(undefined, {
    parent: world.sceneEntity,
  });
  world.activeLevel = signal(activeLevel);

  return world;
}
