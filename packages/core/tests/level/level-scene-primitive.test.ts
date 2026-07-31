/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createScenePrimitiveObject,
  disposeScenePrimitiveObject,
} from '../../src/level/level-scene-primitive.js';
import {
  BackSide,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
} from '../../src/runtime/index.js';

describe('scene primitive factory', () => {
  it('creates sphere, cylinder, cone, and plane geometry with declared dimensions', () => {
    const material = new MeshBasicMaterial();
    const sphere = createScenePrimitiveObject(
      {
        geometry: { radius: 1.25, segments: 18, type: 'sphere' },
        material: 'test',
        type: 'primitive',
      },
      material,
    );
    const cylinder = createScenePrimitiveObject(
      {
        geometry: {
          height: 3,
          radiusBottom: 0.75,
          radiusTop: 0.25,
          segments: 10,
          type: 'cylinder',
        },
        material: 'test',
        type: 'primitive',
      },
      material,
    );
    const cone = createScenePrimitiveObject(
      {
        geometry: { height: 2.5, radius: 0.8, segments: 14, type: 'cone' },
        material: 'test',
        type: 'primitive',
      },
      material,
    );
    const plane = createScenePrimitiveObject(
      {
        geometry: { size: [6, 4], type: 'plane' },
        material: 'test',
        type: 'primitive',
      },
      material,
    );

    expect(sphere.geometry).toMatchObject({
      parameters: {
        heightSegments: 9,
        radius: 1.25,
        widthSegments: 18,
      },
      type: 'SphereGeometry',
    });
    expect(cylinder.geometry).toMatchObject({
      parameters: {
        height: 3,
        radialSegments: 10,
        radiusBottom: 0.75,
        radiusTop: 0.25,
      },
      type: 'CylinderGeometry',
    });
    expect(cone.geometry).toMatchObject({
      parameters: {
        height: 2.5,
        radialSegments: 14,
        radius: 0.8,
      },
      type: 'ConeGeometry',
    });
    expect(plane.geometry).toMatchObject({
      parameters: { height: 4, width: 6 },
      type: 'PlaneGeometry',
    });
    expect(sphere.castShadow).toBe(false);
    expect(sphere.receiveShadow).toBe(false);
  });

  it('preserves explicit shadow opt-ins', () => {
    const box = createScenePrimitiveObject(
      {
        castShadow: true,
        geometry: { size: [1, 1, 1], type: 'box' },
        material: 'test',
        receiveShadow: true,
        type: 'primitive',
      },
      new MeshBasicMaterial(),
    );

    expect(box.castShadow).toBe(true);
    expect(box.receiveShadow).toBe(true);
  });

  it('creates transparent sided basic materials', () => {
    const plane = createScenePrimitiveObject(
      {
        geometry: { size: [2, 1], type: 'plane' },
        material: 'transparent',
        type: 'primitive',
      },
      {
        baseColor: '#abcdef',
        id: 'transparent',
        model: 'basic',
        opacity: 0.25,
        side: 'back',
      },
    );

    expect(plane.material).toBeInstanceOf(MeshBasicMaterial);
    const material = plane.material as MeshBasicMaterial;
    expect(material.color.getHexString()).toBe('abcdef');
    expect(material.opacity).toBe(0.25);
    expect(material.side).toBe(BackSide);
    expect(material.transparent).toBe(true);
  });

  it('disposes only resources owned directly by a primitive mesh', () => {
    const primitive = createScenePrimitiveObject(
      {
        geometry: { size: [1, 1, 1], type: 'box' },
        material: 'owned',
        type: 'primitive',
      },
      { id: 'owned', model: 'basic' },
    );
    const childGeometry = new BoxGeometry(0.5, 0.5, 0.5);
    const childMaterial = new MeshBasicMaterial();
    const child = new Mesh(childGeometry, childMaterial);
    primitive.add(child);

    const primitiveGeometryDispose = vi.spyOn(primitive.geometry, 'dispose');
    const primitiveMaterialDispose = vi.spyOn(
      primitive.material as MeshBasicMaterial,
      'dispose',
    );
    const childGeometryDispose = vi.spyOn(childGeometry, 'dispose');
    const childMaterialDispose = vi.spyOn(childMaterial, 'dispose');

    disposeScenePrimitiveObject(primitive);
    disposeScenePrimitiveObject(primitive);
    disposeScenePrimitiveObject(child);

    expect(primitiveGeometryDispose).toHaveBeenCalledTimes(1);
    expect(primitiveMaterialDispose).toHaveBeenCalledTimes(1);
    expect(childGeometryDispose).not.toHaveBeenCalled();
    expect(childMaterialDispose).not.toHaveBeenCalled();
    expect(primitive.userData.iwsdkOwnsPrimitiveResources).toBeUndefined();
  });
});
