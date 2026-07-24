/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from 'elics';
import { describe, expect, it, vi } from 'vitest';
// Import the system BEFORE the physics component modules. The system's module
// graph loads the ecs barrel first, so its `createSystem` call captures fully
// initialized PhysicsBody / PhysicsShape. Importing the component modules first
// would capture `undefined` components under the known init cycle (see the notes
// in ecs/world.ts). This order is also stable under import sorting.
import { PhysicsSystem } from '../../src/physics/physics-system.js';
import {
  DEFAULT_ANGULAR_DAMPING,
  DEFAULT_GRAVITY_FACTOR,
  DEFAULT_LINEAR_DAMPING,
  PhysicsBody,
  PhysicsState,
} from '../../src/physics/physicsBody.js';
import {
  PhysicsShape,
  PhysicsShapeType,
} from '../../src/physics/physicsShape.js';
import { Object3D, Quaternion, Vector3 } from '../../src/runtime/three.js';

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

const BODY_ID = 7;

/**
 * Minimal Havok stub: a per-body store for gravityFactor / linearDamping /
 * angularDamping plus the get/set bindings. The body's defaults mirror what
 * `createBody` pushes when the body is first created. Get and set calls are
 * counted so tests can assert the per-frame sync diffs against the shadow (no
 * engine reads) and only writes on an actual change.
 */
function createHavokStub() {
  const bodies = new Map<
    number,
    {
      angular: number;
      angularVelocity: [number, number, number];
      damping: number;
      gravity: number;
      linearVelocity: [number, number, number];
      transform: {
        position: [number, number, number];
        quaternion: [number, number, number, number];
      };
    }
  >([
    [
      BODY_ID,
      {
        angular: DEFAULT_ANGULAR_DAMPING,
        angularVelocity: [4, 5, 6],
        damping: DEFAULT_LINEAR_DAMPING,
        gravity: DEFAULT_GRAVITY_FACTOR,
        linearVelocity: [1, 2, 3],
        transform: {
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
        },
      },
    ],
  ]);
  const key = (id: [bigint]) => Number(id[0]);
  let getGravityCount = 0;
  let getDampingCount = 0;
  let getAngularCount = 0;
  let setGravityCount = 0;
  let setDampingCount = 0;
  let setAngularCount = 0;
  let setQTransformCount = 0;
  let setLinearVelocityCount = 0;
  let setAngularVelocityCount = 0;
  return {
    bodies,
    get getGravityCount() {
      return getGravityCount;
    },
    get getDampingCount() {
      return getDampingCount;
    },
    get getAngularCount() {
      return getAngularCount;
    },
    get setGravityCount() {
      return setGravityCount;
    },
    get setDampingCount() {
      return setDampingCount;
    },
    get setAngularCount() {
      return setAngularCount;
    },
    get setQTransformCount() {
      return setQTransformCount;
    },
    get setLinearVelocityCount() {
      return setLinearVelocityCount;
    },
    get setAngularVelocityCount() {
      return setAngularVelocityCount;
    },
    HP_Body_GetGravityFactor: (id: [bigint]) => {
      getGravityCount++;
      return [0, bodies.get(key(id))!.gravity];
    },
    HP_Body_SetGravityFactor: (id: [bigint], v: number) => {
      bodies.get(key(id))!.gravity = v;
      setGravityCount++;
    },
    HP_Body_GetLinearDamping: (id: [bigint]) => {
      getDampingCount++;
      return [0, bodies.get(key(id))!.damping];
    },
    HP_Body_SetLinearDamping: (id: [bigint], v: number) => {
      bodies.get(key(id))!.damping = v;
      setDampingCount++;
    },
    HP_Body_GetAngularDamping: (id: [bigint]) => {
      getAngularCount++;
      return [0, bodies.get(key(id))!.angular];
    },
    HP_Body_SetAngularDamping: (id: [bigint], v: number) => {
      bodies.get(key(id))!.angular = v;
      setAngularCount++;
    },
    HP_Body_SetQTransform: (
      id: [bigint],
      transform: [[number, number, number], [number, number, number, number]],
    ) => {
      bodies.get(key(id))!.transform = {
        position: [...transform[0]],
        quaternion: [...transform[1]],
      };
      setQTransformCount++;
    },
    HP_Body_SetLinearVelocity: (
      id: [bigint],
      velocity: [number, number, number],
    ) => {
      bodies.get(key(id))!.linearVelocity = [...velocity];
      setLinearVelocityCount++;
    },
    HP_Body_SetAngularVelocity: (
      id: [bigint],
      velocity: [number, number, number],
    ) => {
      bodies.get(key(id))!.angularVelocity = [...velocity];
      setAngularVelocityCount++;
    },
  };
}

/**
 * A real elics World wired with the system's reactive queries, a mocked Havok,
 * and one box entity. Using the actual query manager means `setValue` drives the
 * value predicates exactly as it does at runtime.
 */
function setup({ withBody = true }: { withBody?: boolean } = {}) {
  const world = new World();
  const gravityOverrides = world.queryManager.registerQuery(
    (PhysicsSystem as any).queries.gravityOverrides,
  );
  const linearDampingOverrides = world.queryManager.registerQuery(
    (PhysicsSystem as any).queries.linearDampingOverrides,
  );
  const angularDampingOverrides = world.queryManager.registerQuery(
    (PhysicsSystem as any).queries.angularDampingOverrides,
  );

  const havok = createHavokStub();
  const system = new PhysicsSystem({} as any, world.queryManager as any, 0);
  (system as any).queries = {
    gravityOverrides,
    linearDampingOverrides,
    angularDampingOverrides,
  };
  (system as any).havok = havok;
  (system as any).havokWorld = 1;
  (system as any).subscribeReactiveOverrides();

  const entity = world.createEntity();
  entity.object3D = new Object3D();
  entity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [1, 1, 1],
  });
  entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  if (withBody) {
    // Simulate the body the update loop would have created, including createBody
    // seeding the reactive shadows with the values it pushed at creation.
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

  return {
    world,
    system,
    havok,
    entity,
    gravityOverrides,
    linearDampingOverrides,
    angularDampingOverrides,
  };
}

const sync = (system: PhysicsSystem) => (system as any).syncReactiveOverrides();

describe('PhysicsSystem reactive gravityFactor / linearDamping (T270859059)', () => {
  it('pushes a post-creation gravityFactor edit to the live body', () => {
    const { system, havok, entity, gravityOverrides } = setup();

    // Default factor: not an override, engine holds the default.
    expect(gravityOverrides.entities.has(entity)).toBe(false);
    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(DEFAULT_GRAVITY_FACTOR);

    // Mutating the component qualifies the entity (the value predicate fires on
    // setValue); the next sync floats the body.
    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    expect(gravityOverrides.entities.has(entity)).toBe(true);
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(0);
  });

  it('applies value->value changes that never cross the default', () => {
    // This is the gap a pure qualify/disqualify subscriber would miss: 0 -> 2
    // both satisfy `gravityFactor != default`, so the entity stays in the set
    // and qualify does NOT re-fire. The per-frame diff is what keeps it synced.
    const { system, havok, entity, gravityOverrides } = setup();

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(0);

    entity.setValue(PhysicsBody, 'gravityFactor', 2);
    expect(gravityOverrides.entities.has(entity)).toBe(true); // never left the set
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(2);
  });

  it('restores the engine default when gravityFactor returns to the default', () => {
    const { system, havok, entity, gravityOverrides } = setup();

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(0);

    // Returning to the default disqualifies the entity; the disqualify handler
    // resets the engine in the same tick (no further sync needed).
    entity.setValue(PhysicsBody, 'gravityFactor', DEFAULT_GRAVITY_FACTOR);
    expect(gravityOverrides.entities.has(entity)).toBe(false);
    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(DEFAULT_GRAVITY_FACTOR);
  });

  it('pushes linearDamping changes and restores its default', () => {
    const { system, havok, entity, linearDampingOverrides } = setup();

    entity.setValue(PhysicsBody, 'linearDamping', 0.5);
    expect(linearDampingOverrides.entities.has(entity)).toBe(true);
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.damping).toBe(0.5);

    // value -> value (both representable exactly in Float32)
    entity.setValue(PhysicsBody, 'linearDamping', 0.25);
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.damping).toBe(0.25);

    // back to default -> reset via disqualify
    entity.setValue(PhysicsBody, 'linearDamping', DEFAULT_LINEAR_DAMPING);
    expect(linearDampingOverrides.entities.has(entity)).toBe(false);
    expect(havok.bodies.get(BODY_ID)!.damping).toBe(DEFAULT_LINEAR_DAMPING);
  });

  it('pushes angularDamping changes and restores its default', () => {
    const { system, havok, entity, angularDampingOverrides } = setup();

    entity.setValue(PhysicsBody, 'angularDamping', 0.5);
    expect(angularDampingOverrides.entities.has(entity)).toBe(true);
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.angular).toBe(0.5);

    // value -> value (both representable exactly in Float32)
    entity.setValue(PhysicsBody, 'angularDamping', 0.25);
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.angular).toBe(0.25);

    // back to default -> reset via disqualify
    entity.setValue(PhysicsBody, 'angularDamping', DEFAULT_ANGULAR_DAMPING);
    expect(angularDampingOverrides.entities.has(entity)).toBe(false);
    expect(havok.bodies.get(BODY_ID)!.angular).toBe(DEFAULT_ANGULAR_DAMPING);
  });

  it('diffs against the shadow and skips redundant pushes', () => {
    const { system, havok, entity } = setup();

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    sync(system);
    sync(system);
    sync(system);

    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(0);
    expect(havok.setGravityCount).toBe(1); // only the first sync wrote
  });

  it('never reads back from the engine on the per-frame sync (perf)', () => {
    const { system, havok, entity } = setup();

    // Several frames with both an unchanged and a changed field.
    sync(system);
    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    sync(system);
    entity.setValue(PhysicsBody, 'gravityFactor', 2);
    sync(system);
    entity.setValue(PhysicsBody, 'linearDamping', 0.5);
    sync(system);
    entity.setValue(PhysicsBody, 'angularDamping', 0.5);
    sync(system);
    sync(system);

    // The sync diffs against the component shadow, so it must never call the
    // Havok getters — that per-frame WASM round-trip was the cost being removed.
    expect(havok.getGravityCount).toBe(0);
    expect(havok.getDampingCount).toBe(0);
    expect(havok.getAngularCount).toBe(0);
  });

  it('does not write to a body that is being released (removal, not a reset)', () => {
    const { system, havok, entity } = setup();

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    sync(system);
    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(0);

    // Removing the shape releases the body AND disqualifies the override query.
    // The reset must be skipped: the engine value is left untouched rather than
    // written to a dead body.
    const writesBefore = havok.setGravityCount;
    expect(() => entity.removeComponent(PhysicsShape)).not.toThrow();
    expect(havok.bodies.get(BODY_ID)!.gravity).toBe(0);
    expect(havok.setGravityCount).toBe(writesBefore);
  });

  it('is a no-op until the engine body exists', () => {
    const { system, havok, entity, gravityOverrides } = setup({
      withBody: false,
    });

    entity.setValue(PhysicsBody, 'gravityFactor', 0);
    expect(gravityOverrides.entities.has(entity)).toBe(true); // queued for sync

    // No `_engineBody` yet: the sync must not touch Havok (body 0 is unknown).
    expect(() => sync(system)).not.toThrow();
    expect(havok.setGravityCount).toBe(0);
  });
});

describe('PhysicsSystem.setBodyTransform', () => {
  it('sets the Havok transform, mirrors Object3D, and clears velocity by default', () => {
    const { system, havok, entity } = setup();
    const position = new Vector3(1, 2, 3);
    const quaternion = new Quaternion(0, 0.70710678, 0, 0.70710678);
    entity.getVectorView(PhysicsBody, '_linearVelocity').set([1, 2, 3]);
    entity.getVectorView(PhysicsBody, '_angularVelocity').set([4, 5, 6]);

    system.setBodyTransform(entity, { position, quaternion });

    const body = havok.bodies.get(BODY_ID)!;
    expect(havok.setQTransformCount).toBe(1);
    expect(body.transform.position).toEqual([1, 2, 3]);
    expect(body.transform.quaternion).toEqual([
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    ]);
    expect(entity.object3D!.position.toArray()).toEqual([1, 2, 3]);
    expect(entity.object3D!.quaternion.toArray()).toEqual([
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    ]);

    expect(havok.setLinearVelocityCount).toBe(1);
    expect(havok.setAngularVelocityCount).toBe(1);
    expect(body.linearVelocity).toEqual([0, 0, 0]);
    expect(body.angularVelocity).toEqual([0, 0, 0]);
    expect(
      Array.from(entity.getVectorView(PhysicsBody, '_linearVelocity')),
    ).toEqual([0, 0, 0]);
    expect(
      Array.from(entity.getVectorView(PhysicsBody, '_angularVelocity')),
    ).toEqual([0, 0, 0]);
  });

  it('can preserve existing velocities', () => {
    const { system, havok, entity } = setup();

    system.setBodyTransform(
      entity,
      {
        position: [2, 3, 4],
        quaternion: [0, 0, 0, 1],
      },
      { resetVelocity: false },
    );

    const body = havok.bodies.get(BODY_ID)!;
    expect(havok.setQTransformCount).toBe(1);
    expect(body.transform.position).toEqual([2, 3, 4]);
    expect(body.linearVelocity).toEqual([1, 2, 3]);
    expect(body.angularVelocity).toEqual([4, 5, 6]);
    expect(havok.setLinearVelocityCount).toBe(0);
    expect(havok.setAngularVelocityCount).toBe(0);
  });

  it('is a no-op until the engine body exists', () => {
    const { system, havok, entity } = setup({ withBody: false });

    system.setBodyTransform(entity, {
      position: new Vector3(1, 2, 3),
      quaternion: new Quaternion(),
    });

    expect(havok.setQTransformCount).toBe(0);
    expect(havok.setLinearVelocityCount).toBe(0);
    expect(havok.setAngularVelocityCount).toBe(0);
  });
});
