/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { World } from '../../src/ecs/world.js';
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
} from '../../src/runtime/three.js';

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

describe('Entity.dispose', () => {
  it('preserves shared resources when disposeResources is false', () => {
    const world = new World();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    const first = world.createTransformEntity(new Mesh(geometry, material));
    const second = world.createTransformEntity(new Mesh(geometry, material));

    first.dispose({ disposeResources: false });

    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(first.object3D).toBeUndefined();
    expect(second.object3D).toBeDefined();
    expect((second.object3D as Mesh).geometry).toBe(geometry);
    expect((second.object3D as Mesh).material).toBe(material);
  });

  it('disposes Object3D resources by default', () => {
    const world = new World();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const entity = world.createTransformEntity(new Mesh(geometry, material));

    entity.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(entity.object3D).toBeUndefined();
  });
});
