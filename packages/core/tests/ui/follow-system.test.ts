/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from 'elics';
import { describe, expect, it } from 'vitest';
import { Object3D } from '../../src/runtime/index.js';
import { FollowBehavior, Follower, FollowSystem } from '../../src/ui/follow.js';

function setup() {
  const world = new World();
  const queries = Object.fromEntries(
    Object.entries((FollowSystem as any).queries).map(([name, query]) => [
      name,
      world.queryManager.registerQuery(query as any),
    ]),
  );
  const system = new FollowSystem({} as any, world.queryManager as any, 0);
  (system as any).queries = queries;

  const target = new Object3D();
  target.position.set(2, 1.6, 4);
  target.rotation.x = Math.PI / 3;

  const parent = new Object3D();
  const object = new Object3D();
  parent.add(object);

  const entity = world.createEntity();
  entity.object3D = object;
  entity.addComponent(Follower, {
    target,
    offsetPosition: [0, -0.25, -0.8],
    behavior: FollowBehavior.PivotY,
  });

  return { entity, object, system };
}

describe('FollowSystem', () => {
  it('preserves PivotY vertical offsets while filtering target pitch', () => {
    const { entity, object, system } = setup();

    system.update(1);

    expect(object.position.x).toBeCloseTo(2);
    expect(object.position.y).toBeCloseTo(1.35);
    expect(object.position.z).toBeCloseTo(3.2);
    expect(entity.getVectorView(Follower, '_followTarget')[1]).toBeCloseTo(
      1.35,
    );
  });
});
