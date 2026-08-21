/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhysicsTransport } from '../../src/physics/physics-transport.js';
import {
  PHYSICS_HEADER_WORDS,
  PHYSICS_PROTOCOL_VERSION,
  PhysicsHeaderIndex,
  PhysicsOutputOffset,
  physicsExchangeByteLength,
  type PhysicsWorkerOutputMessage,
} from '../../src/physics/physics-worker-protocol.js';

vi.mock('../../src/physics/physics-runtime.js', () => ({
  PhysicsRuntime: class {
    initialize(): Promise<void> {
      return Promise.resolve();
    }

    addBody(): [number, number, number] {
      return [0, 0, 0];
    }

    removeBody(): void {}

    step(buffer: ArrayBuffer): { buffer: ArrayBuffer } {
      const ints = new Int32Array(buffer);
      const floats = new Float32Array(buffer);
      ints[PhysicsHeaderIndex.ResultCount] = 1;
      floats[PHYSICS_HEADER_WORDS + PhysicsOutputOffset.Handle] = 1;
      floats[PHYSICS_HEADER_WORDS + PhysicsOutputOffset.PositionY] = 0.9;
      return { buffer };
    }

    destroy(): void {}
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('main-thread physics transport', () => {
  it('does not require Worker support', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Worker should not be constructed');
        }
      },
    );

    const transport = createPhysicsTransport(false);
    expect(transport).toBeDefined();
    transport.terminate();
  });

  it('routes the shared runtime through the worker message protocol', async () => {
    const transport = createPhysicsTransport(false);
    const queued: PhysicsWorkerOutputMessage[] = [];
    const waiters = new Map<
      PhysicsWorkerOutputMessage['type'],
      (message: PhysicsWorkerOutputMessage) => void
    >();
    transport.onmessage = ({ data }) => {
      const resolve = waiters.get(data.type);
      if (resolve) {
        waiters.delete(data.type);
        resolve(data);
      } else {
        queued.push(data);
      }
    };
    transport.onerror = ({ message }) => {
      throw new Error(message);
    };

    const nextMessage = (
      type: PhysicsWorkerOutputMessage['type'],
    ): Promise<PhysicsWorkerOutputMessage> => {
      const queuedIndex = queued.findIndex((message) => message.type === type);
      if (queuedIndex !== -1) {
        return Promise.resolve(queued.splice(queuedIndex, 1)[0]);
      }
      return new Promise((resolve) => {
        waiters.set(type, resolve);
      });
    };

    transport.postMessage({ type: 'init', gravity: [0, -9.81, 0] });
    await nextMessage('ready');

    transport.postMessage({
      type: 'add-body',
      handle: 1,
      shape: {
        type: 'Sphere',
        dimensions: [0.5, 0.5, 0.5],
        density: 1,
        restitution: 0,
        friction: 0.5,
      },
      state: 'DYNAMIC',
      position: [0, 1, 0],
      quaternion: [0, 0, 0, 1],
      linearDamping: 0,
      angularDamping: 0,
      gravityFactor: 1,
      centerOfMass: [Infinity, Infinity, Infinity],
    });
    await nextMessage('body-created');

    const buffer = new ArrayBuffer(physicsExchangeByteLength(0, 1));
    const ints = new Int32Array(buffer);
    const floats = new Float32Array(buffer);
    ints[PhysicsHeaderIndex.Version] = PHYSICS_PROTOCOL_VERSION;
    ints[PhysicsHeaderIndex.Sequence] = 1;
    ints[PhysicsHeaderIndex.StepCount] = 1;
    floats[PhysicsHeaderIndex.Delta] = 1 / 60;
    transport.postMessage({ type: 'step', buffer });

    const result = await nextMessage('step-result');
    expect(result.type).toBe('step-result');
    if (result.type !== 'step-result') {
      throw new Error('Expected a step result');
    }
    const resultInts = new Int32Array(result.buffer);
    const resultFloats = new Float32Array(result.buffer);
    expect(resultInts[PhysicsHeaderIndex.ResultCount]).toBe(1);
    expect(
      resultFloats[PHYSICS_HEADER_WORDS + PhysicsOutputOffset.Handle],
    ).toBe(1);
    expect(
      resultFloats[PHYSICS_HEADER_WORDS + PhysicsOutputOffset.PositionY],
    ).toBeLessThan(1);

    transport.terminate();
  });
});
