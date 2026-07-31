/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { signal } from '@preact/signals-core';
import { World } from 'elics';
import { describe, expect, it, vi } from 'vitest';
import {
  DepthOccludable,
  OcclusionShadersMode,
} from '../../src/depth/depth-occludable.js';
import { DepthSensingSystem } from '../../src/depth/depth-sensing-system.js';
import type { Entity } from '../../src/ecs/entity.js';
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from '../../src/runtime/three.js';

describe('DepthSensingSystem late registration', () => {
  it('initializes DepthOccludable entities that qualified before system registration', () => {
    const world = createDepthWorld();
    world.registerComponent(DepthOccludable);

    const material = new MeshBasicMaterial();
    const entity = world.createEntity() as Entity;
    entity.object3D = new Mesh(new BoxGeometry(1, 1, 1), material);
    entity.addComponent(DepthOccludable, {
      mode: OcclusionShadersMode.MinMaxSoftOcclusion,
    });

    expect(material.transparent).toBe(false);

    world.registerSystem(DepthSensingSystem);

    const system = world.getSystem(DepthSensingSystem)!;
    expect(material.transparent).toBe(true);
    expect((system as any).entityShaderMap.has(entity)).toBe(true);
    expect((system as any).minMaxEntityCount).toBe(1);

    world.unregisterSystem(DepthSensingSystem);
  });
});

function createDepthWorld(): World {
  const world = new World() as World & Record<string, any>;
  const xr = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getSession: vi.fn(() => null),
    getFrame: vi.fn(() => null),
  };
  world.camera = new PerspectiveCamera();
  world.globals = {};
  world.input = {};
  world.player = new Object3D();
  world.playerEntity = {};
  world.playerHeadEntity = {};
  world.renderer = { xr };
  world.scene = new Scene();
  world.session = undefined;
  world.visibilityState = signal('non-immersive');
  return world;
}
