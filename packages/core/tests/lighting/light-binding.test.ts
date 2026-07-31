/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  LightBinding,
  lightSpecFromComponentValue,
} from '../../src/lighting/index.js';
import { Object3D, Scene, Vector3 } from '../../src/runtime/index.js';

const shadow = {
  castShadow: true,
  shadowBias: -0.0001,
  shadowCameraFar: 40,
  shadowCameraNear: 0.2,
  shadowMapSize: 1024,
  shadowNormalBias: 0.01,
  shadowRadius: 2,
};

describe('LightBinding', () => {
  it('aims directional and spot lights along scale-neutral local -Z', () => {
    const scene = new Scene();
    const parent = new Object3D();
    parent.position.set(2, 3, 4);
    parent.rotation.set(0.25, 0.65, -0.15);
    parent.scale.set(2, 3, 0.5);
    scene.add(parent);
    scene.updateMatrixWorld(true);

    const binding = new LightBinding(parent, scene, {
      color: [1, 0.8, 0.6, 1],
      intensity: 2,
      kind: 'directional',
      shadowCameraSize: 12,
      ...shadow,
    });
    binding.syncTransform();

    const lightPosition = binding.light.getWorldPosition(new Vector3());
    const targetPosition = binding.target!.getWorldPosition(new Vector3());
    const actualDirection = targetPosition.sub(lightPosition).normalize();
    const expectedDirection = new Vector3(0, 0, -1)
      .applyQuaternion(
        parent.getWorldQuaternion(binding.light.quaternion.clone()),
      )
      .normalize();
    const worldScale = binding.light.getWorldScale(new Vector3());

    expect(actualDirection.distanceTo(expectedDirection)).toBeLessThan(1e-6);
    expect(worldScale.toArray()).toEqual(
      expect.arrayContaining([
        expect.closeTo(1, 5),
        expect.closeTo(1, 5),
        expect.closeTo(1, 5),
      ]),
    );
    expect(binding.target?.parent).toBe(scene);
    expect(binding.light.color.getHexString()).toBe('ffcc99');
    expect((binding.light as any).shadow.camera).toMatchObject({
      bottom: -6,
      far: 40,
      left: -6,
      near: 0.2,
      right: 6,
      top: 6,
    });
  });

  it('creates every light kind and keeps rect-area lights target-free', () => {
    const scene = new Scene();
    const parent = new Object3D();
    scene.add(parent);
    const specs = [
      { color: [1, 1, 1, 1], intensity: 1, kind: 'ambient' },
      {
        groundColor: [0.1, 0.1, 0.1, 1],
        intensity: 1,
        kind: 'hemisphere',
        skyColor: [1, 1, 1, 1],
      },
      {
        color: [1, 1, 1, 1],
        decay: 2,
        distance: 5,
        intensity: 20,
        kind: 'point',
        ...shadow,
      },
      {
        angleDeg: 35,
        color: [1, 1, 1, 1],
        decay: 2,
        distance: 8,
        intensity: 30,
        kind: 'spot',
        penumbra: 0.4,
        ...shadow,
      },
      {
        color: [1, 1, 1, 1],
        height: 2,
        intensity: 4,
        kind: 'rect-area',
        width: 3,
      },
    ] as const;
    const bindings = specs.map((spec) => new LightBinding(parent, scene, spec));

    expect(bindings.map((binding) => binding.light.type)).toEqual([
      'AmbientLight',
      'HemisphereLight',
      'PointLight',
      'SpotLight',
      'RectAreaLight',
    ]);
    expect(bindings[4].target).toBeUndefined();
    expect(bindings[4].light as any).toMatchObject({ height: 2, width: 3 });

    for (const binding of bindings) {
      binding.dispose();
      expect(binding.light.parent).toBeNull();
      expect(binding.target?.parent ?? null).toBeNull();
    }
  });

  it('maps serialized component values and schema defaults to light specs', () => {
    expect(
      lightSpecFromComponentValue('com.iwsdk.components.SpotLight', {
        angleDeg: 42,
        color: [1, 0.5, 0.25, 1],
        intensity: 120,
      }),
    ).toMatchObject({
      angleDeg: 42,
      castShadow: false,
      color: [1, 0.5, 0.25, 1],
      decay: 2,
      distance: 0,
      intensity: 120,
      kind: 'spot',
      penumbra: 0,
      shadowMapSize: 1024,
    });
    expect(lightSpecFromComponentValue('NotALight', {})).toBeUndefined();
  });
});
