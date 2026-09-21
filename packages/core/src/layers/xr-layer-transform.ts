/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Matrix4, Object3D, Quaternion, Vector3 } from '../runtime/index.js';

const originInverse = new Matrix4();
const relativeMatrix = new Matrix4();

const ORTHOGONAL_EPSILON = 0.0001;

function isFiniteVector3(vector: Vector3): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

function hasSupportedBasis(matrix: Matrix4): boolean {
  const elements = matrix.elements;
  if (!elements.every(Number.isFinite)) {
    return false;
  }

  const xx = elements[0] ** 2 + elements[1] ** 2 + elements[2] ** 2;
  const yy = elements[4] ** 2 + elements[5] ** 2 + elements[6] ** 2;
  const zz = elements[8] ** 2 + elements[9] ** 2 + elements[10] ** 2;
  if (xx === 0 || yy === 0 || zz === 0) {
    return false;
  }

  const xy =
    (elements[0] * elements[4] +
      elements[1] * elements[5] +
      elements[2] * elements[6]) /
    Math.sqrt(xx * yy);
  const xz =
    (elements[0] * elements[8] +
      elements[1] * elements[9] +
      elements[2] * elements[10]) /
    Math.sqrt(xx * zz);
  const yz =
    (elements[4] * elements[8] +
      elements[5] * elements[9] +
      elements[6] * elements[10]) /
    Math.sqrt(yy * zz);

  return (
    Number.isFinite(matrix.determinant()) &&
    Math.abs(xy) <= ORTHOGONAL_EPSILON &&
    Math.abs(xz) <= ORTHOGONAL_EPSILON &&
    Math.abs(yz) <= ORTHOGONAL_EPSILON
  );
}

export function resolveLayerReferencePose(
  object: Object3D,
  xrOrigin: Object3D,
  position: Vector3,
  quaternion: Quaternion,
  resolvedScale: Vector3,
  resolvedMatrix?: Matrix4,
): boolean {
  xrOrigin.updateWorldMatrix(true, false);
  object.updateWorldMatrix(true, false);
  originInverse.copy(xrOrigin.matrixWorld).invert();
  relativeMatrix.multiplyMatrices(originInverse, object.matrixWorld);
  resolvedMatrix?.copy(relativeMatrix);

  // XRRigidTransform can represent translation and rotation only. Layer
  // dimensions account for axis-aligned scale, but a sheared transform cannot
  // be reproduced by a native composition layer.
  if (!hasSupportedBasis(relativeMatrix)) {
    return false;
  }

  relativeMatrix.decompose(position, quaternion, resolvedScale);
  return (
    isFiniteVector3(position) &&
    Number.isFinite(quaternion.x) &&
    Number.isFinite(quaternion.y) &&
    Number.isFinite(quaternion.z) &&
    Number.isFinite(quaternion.w) &&
    isFiniteVector3(resolvedScale)
  );
}

export function resolveQuadLayerDimensions(
  width: number,
  height: number,
  resolvedScale: Vector3,
): { width: number; height: number } | null {
  const resolvedWidth = width * resolvedScale.x;
  const resolvedHeight = height * resolvedScale.y;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !isFiniteVector3(resolvedScale) ||
    width <= 0 ||
    height <= 0 ||
    resolvedScale.x <= 0 ||
    resolvedScale.y <= 0 ||
    resolvedScale.z <= 0 ||
    !Number.isFinite(resolvedWidth) ||
    !Number.isFinite(resolvedHeight)
  ) {
    return null;
  }
  return {
    width: resolvedWidth,
    height: resolvedHeight,
  };
}

export function resolveCylinderLayerDimensions(
  radius: number,
  aspectRatio: number,
  resolvedScale: Vector3,
): { radius: number; aspectRatio: number } | null {
  const resolvedRadius = radius * resolvedScale.x;
  const resolvedAspectRatio = aspectRatio * (resolvedScale.x / resolvedScale.y);
  if (
    !Number.isFinite(radius) ||
    !Number.isFinite(aspectRatio) ||
    !isFiniteVector3(resolvedScale) ||
    radius <= 0 ||
    aspectRatio <= 0 ||
    resolvedScale.x <= 0 ||
    resolvedScale.y <= 0 ||
    resolvedScale.z <= 0 ||
    Math.abs(resolvedScale.x - resolvedScale.z) >
      0.0001 * Math.max(resolvedScale.x, resolvedScale.z) ||
    !Number.isFinite(resolvedRadius) ||
    !Number.isFinite(resolvedAspectRatio)
  ) {
    return null;
  }
  return {
    radius: resolvedRadius,
    aspectRatio: resolvedAspectRatio,
  };
}

export function isValidCylinderLayerAngle(centralAngle: number): boolean {
  return (
    Number.isFinite(centralAngle) &&
    centralAngle > 0 &&
    centralAngle <= Math.PI * 2
  );
}
