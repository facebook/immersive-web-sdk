/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from 'elics';
import { describe, expect, it, vi } from 'vitest';
import { Grabbed } from '../../src/grab/grabbed.js';
import { PhysicsSystem } from '../../src/physics/physics-system.js';
import {
  PHYSICS_HEADER_WORDS,
  PHYSICS_PROTOCOL_VERSION,
  PhysicsCommandFlag,
  PhysicsHeaderIndex,
  PhysicsOutputOffset,
  physicsExchangeByteLength,
} from '../../src/physics/physics-worker-protocol.js';
import { PhysicsBody, PhysicsState } from '../../src/physics/physicsBody.js';
import {
  PhysicsShape,
  PhysicsShapeType,
} from '../../src/physics/physicsShape.js';
import { Object3D, Quaternion, Vector3 } from '../../src/runtime/three.js';

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

const BODY_ID = 7;

function setup() {
  const world = new World();
  const queries = Object.fromEntries(
    Object.entries((PhysicsSystem as any).queries).map(([name, query]) => [
      name,
      world.queryManager.registerQuery(query as any),
    ]),
  );
  const system = new PhysicsSystem({} as any, world.queryManager as any, 0);
  (system as any).queries = queries;

  const entity = world.createEntity();
  entity.object3D = new Object3D();
  entity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [1, 1, 1],
  });
  entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  entity.setValue(PhysicsBody, '_engineBody', BODY_ID);
  (system as any).bodyEntities.set(BODY_ID, entity);
  (system as any).bodySnapshots.set(BODY_ID, {
    previousPosition: new Vector3(),
    currentPosition: new Vector3(),
    previousQuaternion: new Quaternion(),
    currentQuaternion: new Quaternion(),
  });

  return { system, entity };
}

function createResultBuffer(
  position: [number, number, number],
  quaternion: [number, number, number, number],
  sequence = 1,
): ArrayBuffer {
  const buffer = new ArrayBuffer(physicsExchangeByteLength(0, 1));
  const ints = new Int32Array(buffer);
  const floats = new Float32Array(buffer);
  ints[PhysicsHeaderIndex.Version] = PHYSICS_PROTOCOL_VERSION;
  ints[PhysicsHeaderIndex.Sequence] = sequence;
  ints[PhysicsHeaderIndex.ResultCount] = 1;
  const base = PHYSICS_HEADER_WORDS;
  floats[base + PhysicsOutputOffset.Handle] = BODY_ID;
  floats[base + PhysicsOutputOffset.PositionX] = position[0];
  floats[base + PhysicsOutputOffset.PositionY] = position[1];
  floats[base + PhysicsOutputOffset.PositionZ] = position[2];
  floats[base + PhysicsOutputOffset.QuaternionX] = quaternion[0];
  floats[base + PhysicsOutputOffset.QuaternionY] = quaternion[1];
  floats[base + PhysicsOutputOffset.QuaternionZ] = quaternion[2];
  floats[base + PhysicsOutputOffset.QuaternionW] = quaternion[3];
  return buffer;
}

function completedExchange(buffer: ArrayBuffer) {
  const ints = new Int32Array(buffer);
  return {
    buffer,
    ints,
    floats: new Float32Array(buffer),
    sequence: ints[PhysicsHeaderIndex.Sequence],
  };
}

function queueCompletedExchange(system: PhysicsSystem, buffer: ArrayBuffer) {
  (system as any).completedExchanges.push(completedExchange(buffer));
}

describe('PhysicsSystem fixed-rate stepping', () => {
  it('defaults to worker execution like locomotion', () => {
    const { system } = setup();

    expect(system.config.useWorker.value).toBe(true);
  });

  it('degrades cleanly when workers are unavailable', () => {
    const { system } = setup();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('workers unavailable');
        }
      },
    );

    expect(() => system.init()).not.toThrow();
    expect((system as any).transport).toBeUndefined();

    vi.unstubAllGlobals();
    consoleError.mockRestore();
  });

  it('forwards runtime gravity changes through the active transport', () => {
    const { system } = setup();
    const postMessage = vi.fn();
    const terminate = vi.fn();
    vi.stubGlobal(
      'Worker',
      class {
        onmessage = null;
        onerror = null;
        onmessageerror = null;
        postMessage = postMessage;
        terminate = terminate;
      },
    );

    system.init();
    system.config.gravity.value = [0, -1.62, 0];

    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'set-gravity',
      gravity: [0, -1.62, 0],
    });
    (system as any).destroy();
    expect(terminate).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('submits 45 Hz worker steps from a 90 Hz render loop', () => {
    const { system } = setup();
    const posted: ArrayBuffer[] = [];
    (system as any).transport = {
      postMessage(message: { buffer: ArrayBuffer }, transfer: Transferable[]) {
        posted.push(structuredClone(message, { transfer }).buffer);
      },
    };
    (system as any).transportReady = true;
    (system as any).freeExchangeBuffers.push(
      new ArrayBuffer(physicsExchangeByteLength(0, 1)),
      new ArrayBuffer(physicsExchangeByteLength(0, 1)),
    );
    system.config.updateFrequency.value = 45;

    system.update(1 / 90);
    expect(posted).toHaveLength(0);
    system.update(1 / 90);
    expect(posted).toHaveLength(1);
    system.update(1 / 90);
    expect(posted).toHaveLength(1);
    system.update(1 / 90);
    expect(posted).toHaveLength(2);

    expect(new Float32Array(posted[0])[PhysicsHeaderIndex.Delta]).toBeCloseTo(
      1 / 45,
    );
  });

  it('batches high-frequency substeps into one transferable exchange', () => {
    const { system } = setup();
    const posted: ArrayBuffer[] = [];
    (system as any).transport = {
      postMessage(message: { buffer: ArrayBuffer }, transfer: Transferable[]) {
        posted.push(structuredClone(message, { transfer }).buffer);
      },
    };
    (system as any).transportReady = true;
    (system as any).freeExchangeBuffers.push(
      new ArrayBuffer(physicsExchangeByteLength(0, 1)),
    );
    system.config.updateFrequency.value = 240;

    system.update(1 / 60);

    expect(posted).toHaveLength(1);
    expect(new Int32Array(posted[0])[PhysicsHeaderIndex.StepCount]).toBe(4);
    expect((system as any).stepAccumulator).toBeCloseTo(0);
  });

  it('submits exactly one requested-delta tick for a debugger step', () => {
    const { system } = setup();
    const posted: ArrayBuffer[] = [];
    (system as any).transport = {
      postMessage(message: { buffer: ArrayBuffer }, transfer: Transferable[]) {
        posted.push(structuredClone(message, { transfer }).buffer);
      },
    };
    (system as any).transportReady = true;
    (system as any).freeExchangeBuffers.push(
      new ArrayBuffer(physicsExchangeByteLength(0, 1)),
    );
    (system as any).stepAccumulator = 1 / 120;

    system.prepareDebugFrame(1 / 72);
    system.update(1 / 72);

    expect(posted).toHaveLength(1);
    expect(new Int32Array(posted[0])[PhysicsHeaderIndex.StepCount]).toBe(1);
    expect(new Float32Array(posted[0])[PhysicsHeaderIndex.Delta]).toBeCloseTo(
      1 / 72,
    );
    expect((system as any).stepAccumulator).toBe(0);
  });

  it('submits a debugger step after an in-flight buffer is returned', async () => {
    const { system } = setup();
    let posted: ArrayBuffer | undefined;
    (system as any).transport = {
      postMessage(message: { buffer: ArrayBuffer }, transfer: Transferable[]) {
        posted = structuredClone(message, { transfer }).buffer;
      },
    };
    (system as any).transportReady = true;
    (system as any).inFlightExchangeCount = 1;
    system.prepareDebugFrame(1 / 72);

    const flushPromise = system.flushDebugFrame();
    await Promise.resolve();
    expect(posted).toBeUndefined();

    (system as any).handleTransportMessage({
      type: 'step-result',
      buffer: createResultBuffer([1, 0, 0], [0, 0, 0, 1]),
    });
    expect(posted).toBeDefined();
    expect(new Int32Array(posted!)[PhysicsHeaderIndex.StepCount]).toBe(1);
    expect(new Float32Array(posted!)[PhysicsHeaderIndex.Delta]).toBeCloseTo(
      1 / 72,
    );

    (system as any).handleTransportMessage({
      type: 'step-result',
      buffer: posted!,
    });
    await flushPromise;
  });

  it('flushes queued commands on pause without advancing the simulation', async () => {
    const { system } = setup();
    let posted: ArrayBuffer | undefined;
    (system as any).transport = {
      postMessage(message: { buffer: ArrayBuffer }, transfer: Transferable[]) {
        posted = structuredClone(message, { transfer }).buffer;
      },
    };
    (system as any).transportReady = true;
    (system as any).freeExchangeBuffers.push(
      new ArrayBuffer(physicsExchangeByteLength(1, 1)),
    );
    const command = (system as any).getPendingCommand(BODY_ID);
    command.flags = PhysicsCommandFlag.SetGravityFactor;
    command.gravityFactor = 0.5;

    const flushPromise = system.flushDebugFrame();
    await Promise.resolve();

    expect(posted).toBeDefined();
    expect(new Int32Array(posted!)[PhysicsHeaderIndex.StepCount]).toBe(0);
    (system as any).handleTransportMessage({
      type: 'step-result',
      buffer: posted!,
    });
    await flushPromise;
    expect((system as any).pendingCommands.size).toBe(0);
  });

  it('sizes results from the worker creation-time body state', () => {
    const { system, entity } = setup();
    let posted: ArrayBuffer | undefined;
    (system as any).transport = {
      postMessage(message: { buffer: ArrayBuffer }, transfer: Transferable[]) {
        posted = structuredClone(message, { transfer }).buffer;
      },
    };
    (system as any).freeExchangeBuffers.push(
      new ArrayBuffer(physicsExchangeByteLength(0, 0)),
    );
    entity.setValue(PhysicsBody, 'state', PhysicsState.Static);

    (system as any).sendExchange(1 / 60);

    expect(posted?.byteLength).toBe(physicsExchangeByteLength(0, 1));
  });

  it('stops submitting after a terminal worker error', () => {
    const { system } = setup();
    const terminate = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    (system as any).transport = { terminate };
    (system as any).transportReady = true;

    (system as any).handleTransportMessage({
      type: 'error',
      message: 'step failed',
    });

    expect(terminate).toHaveBeenCalledOnce();
    expect((system as any).transport).toBeUndefined();
    expect((system as any).transportReady).toBe(false);
    consoleError.mockRestore();
  });

  it('waits for in-flight work and exposes a settled debugger transform', async () => {
    const { system, entity } = setup();
    const result = createResultBuffer([10, 0, 0], [0, 0, 0, 1]);
    (system as any).inFlightExchangeCount = 1;

    let flushed = false;
    const flushPromise = system.flushDebugFrame().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);

    (system as any).handleTransportMessage({
      type: 'step-result',
      buffer: result,
    });
    await flushPromise;

    expect(entity.object3D!.position.x).toBe(10);
    const snapshot = (system as any).bodySnapshots.get(BODY_ID);
    expect(snapshot.previousPosition.x).toBe(10);
    expect(snapshot.currentPosition.x).toBe(10);
  });
});

describe('PhysicsSystem render interpolation', () => {
  it('interpolates position and rotation between worker snapshots', () => {
    const { system, entity } = setup();
    queueCompletedExchange(
      system,
      createResultBuffer([10, 0, 0], [0, 1, 0, 0]),
    );

    (system as any).applyCompletedExchange();
    (system as any).renderInterpolatedTransforms(0.5);

    expect(entity.object3D!.position.x).toBeCloseTo(5);
    expect(Math.abs(entity.object3D!.quaternion.y)).toBeCloseTo(Math.SQRT1_2);
    expect(Math.abs(entity.object3D!.quaternion.w)).toBeCloseTo(Math.SQRT1_2);
  });

  it('keeps the intermediate state when two completed steps arrive together', () => {
    const { system, entity } = setup();
    queueCompletedExchange(
      system,
      createResultBuffer([10, 0, 0], [0, 0, 0, 1], 1),
    );
    queueCompletedExchange(
      system,
      createResultBuffer([20, 0, 0], [0, 0, 0, 1], 2),
    );

    (system as any).applyCompletedExchange();
    (system as any).renderInterpolatedTransforms(0.5);

    expect(entity.object3D!.position.x).toBe(15);
  });

  it('applies the newest snapshot directly when interpolation is disabled', () => {
    const { system, entity } = setup();
    (system as any).transport = {};
    system.config.interpolation.value = false;
    queueCompletedExchange(
      system,
      createResultBuffer([10, 0, 0], [0, 0, 0, 1]),
    );

    system.update(0);

    expect(entity.object3D!.position.x).toBe(10);
  });

  it('resets both snapshots when a body is teleported', () => {
    const { system, entity } = setup();
    const snapshot = (system as any).bodySnapshots.get(BODY_ID);
    snapshot.currentPosition.set(10, 0, 0);

    system.setBodyTransform(entity, {
      position: [20, 0, 0],
      quaternion: [0, 0, 0, 1],
    });
    (system as any).renderInterpolatedTransforms(0.5);

    expect(entity.object3D!.position.x).toBe(20);
    expect(snapshot.previousPosition.x).toBe(20);
    expect(snapshot.currentPosition.x).toBe(20);
  });

  it('ignores worker results submitted before a teleport', () => {
    const { system, entity } = setup();
    const posted: ArrayBuffer[] = [];
    (system as any).transport = {
      postMessage(message: { buffer: ArrayBuffer }, transfer: Transferable[]) {
        posted.push(structuredClone(message, { transfer }).buffer);
      },
    };
    (system as any).freeExchangeBuffers.push(
      new ArrayBuffer(physicsExchangeByteLength(1, 1)),
    );

    system.setBodyTransform(entity, {
      position: [20, 0, 0],
      quaternion: [0, 0, 0, 1],
    });
    const teleportSequence = (system as any).nextSequence;
    queueCompletedExchange(
      system,
      createResultBuffer([5, 0, 0], [0, 0, 0, 1], teleportSequence - 1),
    );
    system.update(0);
    expect(entity.object3D!.position.x).toBe(20);

    (system as any).sendExchange(1 / 60);
    (system as any).applyExchangeBuffer(
      completedExchange(
        createResultBuffer([19, 0, 0], [0, 0, 0, 1], teleportSequence),
      ),
    );
    (system as any).renderInterpolatedTransforms(1);
    expect(entity.object3D!.position.x).toBe(19);
  });

  it('snaps to a batched catch-up result instead of interpolating across it', () => {
    const { system, entity } = setup();
    const buffer = createResultBuffer([10, 0, 0], [0, 0, 0, 1]);
    new Int32Array(buffer)[PhysicsHeaderIndex.StepCount] = 4;

    (system as any).applyExchangeBuffer(completedExchange(buffer));
    (system as any).renderInterpolatedTransforms(0.5);

    expect(entity.object3D!.position.x).toBe(10);
  });

  it('keeps a grabbed object authoritative and seeds release interpolation', () => {
    const { system, entity } = setup();
    (system as any).transport = {};
    entity.addComponent(Grabbed);
    entity.object3D!.position.set(3, 4, 5);

    system.update(0);
    const snapshot = (system as any).bodySnapshots.get(BODY_ID);
    expect(snapshot.previousPosition.toArray()).toEqual([3, 4, 5]);
    expect(snapshot.currentPosition.toArray()).toEqual([3, 4, 5]);

    entity.removeComponent(Grabbed);
    (system as any).renderInterpolatedTransforms(0);
    expect(entity.object3D!.position.toArray()).toEqual([3, 4, 5]);
  });
});
