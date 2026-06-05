/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { EntityCreator } from '../../src/level/level-entity-creator.js';
import { Object3D } from '../../src/runtime/three.js';

// The runtime barrel pulls in xr-input's cursor-visual.ts, which touches
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

function makeWorld() {
  const createTransformEntity = vi.fn(() => ({ addComponent: vi.fn() }));
  const world = {
    createTransformEntity,
    registerComponent: vi.fn(),
  };
  return { world, createTransformEntity };
}

describe('EntityCreator.createEntitiesFromObject3D', () => {
  it('processes children of a "level" metadata carrier under the level root', () => {
    const child1 = new Object3D();
    child1.name = 'Child1';
    const child2 = new Object3D();
    child2.name = 'Child2';

    const carrier = new Object3D();
    carrier.name = 'level';
    carrier.userData = { meta_spatial: { components: {} } };
    carrier.add(child1);
    carrier.add(child2);

    const nodes = [carrier, child1, child2];
    const { world, createTransformEntity } = makeWorld();
    const parentEntity = { addComponent: vi.fn() } as any;

    EntityCreator.createEntitiesFromObject3D(
      carrier,
      nodes,
      parentEntity,
      world as any,
    );

    // Regression: previously the carrier's children were orphaned (early
    // return) and never became ECS entities. They must each be created under
    // the same parentEntity (the level root). The carrier itself does NOT
    // create an entity (its components go onto parentEntity).
    expect(createTransformEntity).toHaveBeenCalledTimes(2);
    expect(createTransformEntity).toHaveBeenCalledWith(child1, parentEntity);
    expect(createTransformEntity).toHaveBeenCalledWith(child2, parentEntity);

    // The metadata-only carrier is detached from the scene graph.
    expect(carrier.parent).toBeNull();
  });

  it('creates a normal node as its own entity and recurses into its children', () => {
    const grandchild = new Object3D();
    grandchild.name = 'Grandchild';
    const node = new Object3D();
    node.name = 'Normal';
    node.add(grandchild);

    const nodes = [node, grandchild];
    const { world, createTransformEntity } = makeWorld();
    const parentEntity = { addComponent: vi.fn() } as any;

    EntityCreator.createEntitiesFromObject3D(
      node,
      nodes,
      parentEntity,
      world as any,
    );

    // Normal node -> its own entity (parented to parentEntity); grandchild ->
    // entity parented to the node's OWN entity (not parentEntity), proving the
    // recursion threads the freshly-created entity through as the parent.
    expect(createTransformEntity).toHaveBeenCalledTimes(2);
    expect(createTransformEntity).toHaveBeenNthCalledWith(
      1,
      node,
      parentEntity,
    );
    const nodeEntity = createTransformEntity.mock.results[0].value;
    expect(createTransformEntity).toHaveBeenNthCalledWith(
      2,
      grandchild,
      nodeEntity,
    );
    expect(nodeEntity).not.toBe(parentEntity);
  });

  it('ignores objects not present in the nodes list', () => {
    const stray = new Object3D();
    const { world, createTransformEntity } = makeWorld();

    EntityCreator.createEntitiesFromObject3D(
      stray,
      [],
      { addComponent: vi.fn() } as any,
      world as any,
    );

    expect(createTransformEntity).not.toHaveBeenCalled();
  });
});
