/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from 'elics';
import { describe, expect, it, vi } from 'vitest';
import { PhysicsSystem } from '../../src/physics/physics-system.js';
import {
  PHYSICS_HEADER_WORDS,
  PhysicsCommandFlag,
  PhysicsHeaderIndex,
  PhysicsInputOffset,
} from '../../src/physics/physics-worker-protocol.js';
import {
  DEFAULT_GRAVITY_FACTOR,
  PhysicsBody,
  PhysicsState,
} from '../../src/physics/physicsBody.js';
import { PhysicsManipulation } from '../../src/physics/physicsManipulation.js';
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

function setup({ withBody = true }: { withBody?: boolean } = {}) {
  const world = new World();
  const queries = Object.fromEntries(
    Object.entries((PhysicsSystem as any).queries).map(([name, query]) => [
      name,
      world.queryManager.registerQuery(query as any),
    ]),
  );
  const system = new PhysicsSystem({} as any, world.queryManager as any, 0);
  (system as any).queries = queries;
  (system as any).subscribeReactiveOverrides();

  const entity = world.createEntity();
  entity.object3D = new Object3D();
  entity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [1, 1, 1],
  });
  entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  if (withBody) {
    entity.setValue(PhysicsBody, '_engineBody', BODY_ID);
    PhysicsBody.data._engineGravityFactor[entity.index] = entity.getValue(
      PhysicsBody,
      'gravityFactor',
    )!;
    PhysicsBody.data._engineLinearDamping[entity.index] = entity.getValue(
      PhysicsBody,
      'linearDamping',
    )!;
    PhysicsBody.data._engineAngularDamping[entity.index] = entity.getValue(
      PhysicsBody,
      'angularDamping',
    )!;
  }

  return { world, system, entity, queries };
}

const sync = (system: PhysicsSystem) => (system as any).syncReactiveOverrides();

const pending = (system: PhysicsSystem) =>
  (system as any).pendingCommands.get(BODY_ID);

describe('PhysicsSystem worker-side reactive body parameters', () => {
  it('queues gravityFactor changes and value-to-value edits', () => {
    const { system, entity, queries } = setup();

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    expect((queries as any).gravityOverrides.entities.has(entity)).toBe(true);
    sync(system);
    expect(pending(system).flags & PhysicsCommandFlag.SetGravityFactor).toBe(
      PhysicsCommandFlag.SetGravityFactor,
    );
    expect(pending(system).gravityFactor).toBe(0);

    entity.setValue(PhysicsBody, 'gravityFactor', 2);
    sync(system);
    expect(pending(system).gravityFactor).toBe(2);
  });

  it('queues the engine default when an override disqualifies', () => {
    const { system, entity, queries } = setup();

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    sync(system);
    entity.setValue(PhysicsBody, 'gravityFactor', DEFAULT_GRAVITY_FACTOR);

    expect((queries as any).gravityOverrides.entities.has(entity)).toBe(false);
    expect(pending(system).gravityFactor).toBe(DEFAULT_GRAVITY_FACTOR);
  });

  it('queues linear and angular damping changes', () => {
    const { system, entity } = setup();

    entity.setValue(PhysicsBody, 'linearDamping', 0.5);
    entity.setValue(PhysicsBody, 'angularDamping', 0.25);
    sync(system);

    expect(pending(system).flags & PhysicsCommandFlag.SetLinearDamping).toBe(
      PhysicsCommandFlag.SetLinearDamping,
    );
    expect(pending(system).flags & PhysicsCommandFlag.SetAngularDamping).toBe(
      PhysicsCommandFlag.SetAngularDamping,
    );
    expect(pending(system).linearDamping).toBe(0.5);
    expect(pending(system).angularDamping).toBe(0.25);
  });

  it('diffs against the shadow and skips unchanged parameters', () => {
    const { system, entity } = setup();

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    sync(system);
    (system as any).releasePendingCommands();
    sync(system);

    expect((system as any).pendingCommands.size).toBe(0);
  });

  it('is a no-op until the worker body handle exists', () => {
    const { system, entity, queries } = setup({ withBody: false });

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    expect((queries as any).gravityOverrides.entities.has(entity)).toBe(true);
    sync(system);

    expect((system as any).pendingCommands.size).toBe(0);
  });

  it('does not queue a default reset while the body is being removed', () => {
    const { system, entity } = setup();

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    sync(system);
    (system as any).releasePendingCommands();
    entity.removeComponent(PhysicsShape);

    expect((system as any).pendingCommands.size).toBe(0);
  });
});

describe('PhysicsSystem.setBodyTransform', () => {
  it('queues a transform, mirrors Object3D, and clears velocity by default', () => {
    const { system, entity } = setup();
    const position = new Vector3(1, 2, 3);
    const quaternion = new Quaternion(0, 0.70710678, 0, 0.70710678);
    entity.getVectorView(PhysicsBody, '_linearVelocity').set([1, 2, 3]);
    entity.getVectorView(PhysicsBody, '_angularVelocity').set([4, 5, 6]);

    system.setBodyTransform(entity, { position, quaternion });

    const command = pending(system);
    expect(command.flags & PhysicsCommandFlag.SetTransform).toBe(
      PhysicsCommandFlag.SetTransform,
    );
    expect(command.flags & PhysicsCommandFlag.ResetLinearVelocity).toBe(
      PhysicsCommandFlag.ResetLinearVelocity,
    );
    expect(command.flags & PhysicsCommandFlag.ResetAngularVelocity).toBe(
      PhysicsCommandFlag.ResetAngularVelocity,
    );
    expect(command.position).toEqual([1, 2, 3]);
    expect(entity.object3D!.position.toArray()).toEqual([1, 2, 3]);
    expect(
      Array.from(entity.getVectorView(PhysicsBody, '_linearVelocity')),
    ).toEqual([0, 0, 0]);
    expect(
      Array.from(entity.getVectorView(PhysicsBody, '_angularVelocity')),
    ).toEqual([0, 0, 0]);
  });

  it('can preserve existing velocities', () => {
    const { system, entity } = setup();

    system.setBodyTransform(
      entity,
      { position: [2, 3, 4], quaternion: [0, 0, 0, 1] },
      { resetVelocity: false },
    );

    const command = pending(system);
    expect(command.flags).toBe(PhysicsCommandFlag.SetTransform);
    expect(command.position).toEqual([2, 3, 4]);
  });

  it('is a no-op until the worker body handle exists', () => {
    const { system, entity } = setup({ withBody: false });

    system.setBodyTransform(entity, {
      position: new Vector3(1, 2, 3),
      quaternion: new Quaternion(),
    });

    expect((system as any).pendingCommands.size).toBe(0);
  });
});

describe('PhysicsSystem transferable command encoding', () => {
  it('re-qualifies pending manipulations when a worker body is created', () => {
    const { system, entity, queries } = setup({ withBody: false });
    entity.addComponent(PhysicsManipulation, {
      linearVelocity: [1, 2, 3],
    });
    expect((queries as any).manipluatedEntities.entities.has(entity)).toBe(
      false,
    );
    (system as any).transport = { postMessage: vi.fn() };

    (system as any).ensureBody(entity);

    expect((queries as any).manipluatedEntities.entities.has(entity)).toBe(
      true,
    );
    (system as any).queueManipulations(1 / 60);
    const handle = entity.getValue(PhysicsBody, '_engineBody');
    const command = (system as any).pendingCommands.get(handle);
    expect(command.flags & PhysicsCommandFlag.SetLinearVelocity).toBe(
      PhysicsCommandFlag.SetLinearVelocity,
    );
    expect(command.linearVelocity).toEqual([1, 2, 3]);
    expect(entity.hasComponent(PhysicsManipulation)).toBe(false);
  });

  it('does not retry a body that the worker rejected every frame', () => {
    const { system, entity } = setup();
    const postMessage = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    (system as any).transport = { postMessage };
    (system as any).bodyEntities.set(BODY_ID, entity);

    (system as any).handleTransportMessage({
      type: 'error',
      handle: BODY_ID,
      message: 'invalid shape',
    });
    (system as any).ensureBody(entity);

    expect(postMessage).not.toHaveBeenCalled();
    expect(entity.getValue(PhysicsBody, '_engineBody')).toBe(0);
    consoleError.mockRestore();
  });

  it('serializes queued changes into a transferred exchange buffer', () => {
    const { system, entity } = setup();
    let posted: any;
    const worker = {
      postMessage(message: any, transfer: Transferable[]) {
        posted = structuredClone(message, { transfer });
      },
    };
    (system as any).transport = worker;
    (system as any).transportReady = true;
    (system as any).bodyEntities.set(BODY_ID, entity);
    (system as any).freeExchangeBuffers.push(new ArrayBuffer(4096));

    entity.setValue(PhysicsBody, 'gravityFactor', 0.5);
    sync(system);
    (system as any).sendExchange(1 / 90);

    const ints = new Int32Array(posted.buffer);
    const floats = new Float32Array(posted.buffer);
    const base = PHYSICS_HEADER_WORDS;
    expect(ints[PhysicsHeaderIndex.CommandCount]).toBe(1);
    expect(floats[base + PhysicsInputOffset.Handle]).toBe(BODY_ID);
    expect(
      floats[base + PhysicsInputOffset.Flags] &
        PhysicsCommandFlag.SetGravityFactor,
    ).toBe(PhysicsCommandFlag.SetGravityFactor);
    expect(floats[base + PhysicsInputOffset.GravityFactor]).toBe(0.5);
    expect((system as any).pendingCommands.size).toBe(0);
    expect((system as any).inFlightExchangeCount).toBe(1);
  });
});
