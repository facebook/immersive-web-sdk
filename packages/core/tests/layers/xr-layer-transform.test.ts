/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  isValidCylinderLayerAngle,
  resolveCylinderLayerDimensions,
  resolveLayerReferencePose,
  resolveQuadLayerDimensions,
} from '../../src/layers/xr-layer-transform.js';
import {
  Object3D,
  Quaternion,
  Scene,
  Vector3,
} from '../../src/runtime/index.js';

describe('resolveLayerReferencePose', () => {
  it('expresses scene content relative to a translated and turned XR origin', () => {
    const scene = new Scene();
    const xrOrigin = new Object3D();
    xrOrigin.position.set(2, 0, 3);
    xrOrigin.rotation.y = Math.PI / 2;
    scene.add(xrOrigin);

    const layer = new Object3D();
    layer.position.set(2, 1, 2);
    layer.rotation.y = Math.PI / 2;
    layer.scale.set(2, 3, 4);
    scene.add(layer);

    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    resolveLayerReferencePose(layer, xrOrigin, position, quaternion, scale);

    expect(position.x).toBeCloseTo(1);
    expect(position.y).toBeCloseTo(1);
    expect(position.z).toBeCloseTo(0);
    expect(quaternion.angleTo(new Quaternion())).toBeCloseTo(0);
    expect(scale.toArray()).toEqual([2, 3, 4]);
  });

  it('updates when locomotion moves the XR origin while the layer stays still', () => {
    const scene = new Scene();
    const xrOrigin = new Object3D();
    const layer = new Object3D();
    layer.position.set(0, 1, -3);
    scene.add(xrOrigin, layer);

    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    resolveLayerReferencePose(layer, xrOrigin, position, quaternion, scale);
    expect(position.toArray()).toEqual([0, 1, -3]);

    xrOrigin.position.set(1, 0, -1);
    xrOrigin.rotation.y = Math.PI / 2;
    resolveLayerReferencePose(layer, xrOrigin, position, quaternion, scale);

    expect(position.x).toBeCloseTo(2);
    expect(position.y).toBeCloseTo(1);
    expect(position.z).toBeCloseTo(-1);
    expect(
      quaternion.angleTo(
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2),
      ),
    ).toBeCloseTo(0);
  });

  it('rejects shear produced by rotation beneath a non-uniform parent scale', () => {
    const scene = new Scene();
    const xrOrigin = new Object3D();
    const scaledParent = new Object3D();
    scaledParent.scale.set(2, 1, 1);
    const layer = new Object3D();
    layer.rotation.y = Math.PI / 4;
    scaledParent.add(layer);
    scene.add(xrOrigin, scaledParent);

    expect(
      resolveLayerReferencePose(
        layer,
        xrOrigin,
        new Vector3(),
        new Quaternion(),
        new Vector3(),
      ),
    ).toBe(false);
  });
});

describe('native layer dimensions', () => {
  it('applies authored quad scale to full dimensions', () => {
    expect(resolveQuadLayerDimensions(2, 3, new Vector3(1.5, 0.5, 2))).toEqual({
      width: 3,
      height: 1.5,
    });
  });

  it('applies uniform radial and vertical cylinder scale', () => {
    expect(
      resolveCylinderLayerDimensions(2, 2, new Vector3(1.5, 0.75, 1.5)),
    ).toEqual({ radius: 3, aspectRatio: 4 });
  });

  it('rejects reflected and non-uniform radial scale', () => {
    expect(resolveQuadLayerDimensions(1, 1, new Vector3(-1, 1, 1))).toBeNull();
    expect(
      resolveCylinderLayerDimensions(1, 1, new Vector3(1, 1, 1.2)),
    ).toBeNull();
  });

  it('rejects non-finite and non-positive authored dimensions', () => {
    expect(
      resolveQuadLayerDimensions(Number.NaN, 1, new Vector3(1, 1, 1)),
    ).toBeNull();
    expect(
      resolveCylinderLayerDimensions(1, 0, new Vector3(1, 1, 1)),
    ).toBeNull();
  });

  it('accepts only finite WebXR cylinder angles in the valid range', () => {
    expect(isValidCylinderLayerAngle(Math.PI)).toBe(true);
    expect(isValidCylinderLayerAngle(0)).toBe(false);
    expect(isValidCylinderLayerAngle(Math.PI * 2 + 0.001)).toBe(false);
    expect(isValidCylinderLayerAngle(Number.NaN)).toBe(false);
  });
});
