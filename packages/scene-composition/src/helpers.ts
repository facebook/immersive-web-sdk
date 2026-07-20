/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  SceneAlignOptions,
  SceneAlignment,
  SceneAxis,
  SceneAsset,
  SceneDocument,
  SceneNode,
  ScenePlaceOn,
  SceneSnapOptions,
  SceneScale,
  SceneTransform,
  Vec3,
} from './types.js';
import { findNode, findNodeLocation } from './utils.js';

const AXIS_TO_INDEX: Record<SceneAxis, 0 | 1 | 2> = {
  x: 0,
  y: 1,
  z: 2,
};
const INDEX_TO_AXIS: SceneAxis[] = ['x', 'y', 'z'];
const IDENTITY_LINEAR_MATRIX: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function resolveLookAtYawDeg(position: Vec3, target: Vec3): number {
  const dx = target[0] - position[0];
  const dz = target[2] - position[2];
  const radians = Math.atan2(dx, dz);
  return normalizeDegrees((radians * 180) / Math.PI);
}

export function resolveLookAtTransform(
  node: SceneNode,
  target: Vec3,
): SceneTransform {
  const transform = node.transform ?? {};
  const position = transform.position ?? [0, 0, 0];
  const rotation = transform.rotationDeg ?? [0, 0, 0];
  const nextTransform: SceneTransform = {
    ...transform,
    rotationDeg: [
      rotation[0],
      resolveLookAtYawDeg(position, target),
      rotation[2],
    ],
  };
  delete nextTransform.lookAt;

  return nextTransform;
}

export function resolveLookAtTransformInDocument(
  document: SceneDocument,
  nodeId: string,
  target: Vec3,
): SceneTransform {
  const location = findRequiredNodeLocation(document, nodeId);
  const parentWorldTransform = getParentWorldTransform(document, nodeId);
  return resolveLookAtTransform(
    location.node,
    worldPointToLocal(target, parentWorldTransform),
  );
}

export function snapPositionToGrid(
  position: Vec3,
  options: SceneSnapOptions = {},
): Vec3 {
  const gridSize = scaleToVec3(options.gridSize);
  const origin = options.origin ?? [0, 0, 0];
  const axes = new Set<SceneAxis>(options.axes ?? INDEX_TO_AXIS);

  validatePositiveVec3(gridSize, 'gridSize');

  return position.map((value, index) => {
    const axis = INDEX_TO_AXIS[index];
    if (!axes.has(axis)) {
      return value;
    }

    const snapped =
      origin[index] +
      Math.round((value - origin[index]) / gridSize[index]) * gridSize[index];
    return roundHelperNumber(snapped);
  }) as Vec3;
}

export function resolveSnapTransform(
  node: SceneNode,
  options: SceneSnapOptions = {},
): SceneTransform {
  const transform = node.transform ?? {};
  return {
    ...transform,
    position: snapPositionToGrid(transform.position ?? [0, 0, 0], options),
  };
}

export function resolveAlignTransforms(
  document: SceneDocument,
  nodeIds: string[],
  options: SceneAlignOptions,
): Record<string, SceneTransform> {
  if (nodeIds.length === 0) {
    throw new Error('At least one node id is required for alignment');
  }

  const axisIndex = AXIS_TO_INDEX[options.axis];
  const edge = options.edge ?? 'center';
  const targetEdge = options.targetEdge ?? edge;
  const targetValue =
    options.targetValue ??
    getAlignmentTargetMetric(document, nodeIds[0], options.targetNodeId, {
      axisIndex,
      edge: targetEdge,
    });

  return Object.fromEntries(
    nodeIds.map((nodeId) => {
      const location = findRequiredNodeLocation(document, nodeId);
      const bounds = getNodeWorldBounds(document, nodeId);
      const currentMetric = getBoundsMetric(bounds, axisIndex, edge);
      const nodeWorldTransform = getNodeWorldTransform(document, nodeId);
      const parentWorldTransform = getParentWorldTransform(document, nodeId);
      const nextWorldPosition: Vec3 = [...nodeWorldTransform.position];
      nextWorldPosition[axisIndex] = roundHelperNumber(
        nextWorldPosition[axisIndex] + targetValue - currentMetric,
      );
      const position = worldPointToLocal(
        nextWorldPosition,
        parentWorldTransform,
      );

      return [
        nodeId,
        {
          ...(location.node.transform ?? {}),
          position,
        },
      ];
    }),
  );
}

export function resolvePlaceOnTransform(
  document: SceneDocument,
  nodeId: string,
  placeOn: string | ScenePlaceOn,
): SceneTransform {
  const location = findRequiredNodeLocation(document, nodeId);
  const node = location.node;
  const targetId = typeof placeOn === 'string' ? placeOn : placeOn.target;
  const clearance = typeof placeOn === 'string' ? 0 : (placeOn.clearance ?? 0);
  const align =
    typeof placeOn === 'string' ? 'center' : (placeOn.align ?? 'center');

  const nodeBounds = findRequiredAsset(document, node.asset, node.id).bounds;
  const target = findRequiredNode(document, targetId);
  const targetBounds = findRequiredAsset(
    document,
    target.asset,
    target.id,
  ).bounds;

  if (nodeBounds == null) {
    throw new Error(`Node "${node.id}" asset is missing bounds metadata`);
  }

  if (targetBounds == null) {
    throw new Error(`Target "${target.id}" asset is missing bounds metadata`);
  }

  const nodeWorldTransform = getNodeWorldTransform(document, nodeId);
  const nodeParentWorldTransform = getParentWorldTransform(document, nodeId);
  const targetWorldTransform = getNodeWorldTransform(document, targetId);
  const nodeWorldBounds = getNodeWorldBounds(document, nodeId);
  const targetWorldBounds = getNodeWorldBounds(document, targetId);
  const targetTop = targetWorldBounds.max[1];
  const nodeBottomOffset =
    nodeWorldBounds.min[1] - nodeWorldTransform.position[1];
  const nextWorldPosition: Vec3 = [
    align === 'center'
      ? targetWorldTransform.position[0]
      : nodeWorldTransform.position[0],
    targetTop - nodeBottomOffset + clearance,
    align === 'center'
      ? targetWorldTransform.position[2]
      : nodeWorldTransform.position[2],
  ];
  const nextPosition = worldPointToLocal(
    nextWorldPosition,
    nodeParentWorldTransform,
  );
  const nextTransform: SceneTransform = {
    ...(node.transform ?? {}),
    position: nextPosition,
  };
  delete nextTransform.placeOn;

  return nextTransform;
}

export function resolveReparentTransform(
  document: SceneDocument,
  nodeId: string,
  parentId: string | null,
): SceneTransform {
  const location = findRequiredNodeLocation(document, nodeId);
  if (location.parent?.id === parentId) {
    return location.node.transform ?? {};
  }

  const nodeWorldTransform = getNodeWorldTransform(document, nodeId);
  const nextParentWorldTransform =
    parentId == null
      ? identityWorldTransform()
      : getNodeWorldTransform(document, parentId);
  const nextLocalLinear = multiplyMat3(
    invertMat3(nextParentWorldTransform.linear),
    nodeWorldTransform.linear,
  );
  const decomposedTransform = decomposeLinearTransform(nextLocalLinear);
  return compactTransform({
    ...(location.node.transform ?? {}),
    position: worldPointToLocal(
      nodeWorldTransform.position,
      nextParentWorldTransform,
    ),
    rotationDeg: decomposedTransform.rotationDeg,
    scale: vec3ToSceneScale(decomposedTransform.scale),
  });
}

function findRequiredNodeLocation(document: SceneDocument, nodeId: string) {
  const location = findNodeLocation(document.nodes, nodeId);
  if (location == null) {
    throw new Error(`Unknown scene node "${nodeId}"`);
  }

  return location;
}

interface ResolvedWorldTransform {
  linear: Mat3;
  position: Vec3;
}

type Mat3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function getParentWorldTransform(
  document: SceneDocument,
  nodeId: string,
): ResolvedWorldTransform {
  const path = getRequiredNodePath(document.nodes, nodeId);
  return combineNodeWorldTransforms(path.slice(0, -1));
}

function getNodeWorldTransform(
  document: SceneDocument,
  nodeId: string,
): ResolvedWorldTransform {
  return combineNodeWorldTransforms(
    getRequiredNodePath(document.nodes, nodeId),
  );
}

function getRequiredNodePath(nodes: SceneNode[], nodeId: string): SceneNode[] {
  const path = getNodePath(nodes, nodeId);
  if (path == null) {
    throw new Error(`Unknown scene node "${nodeId}"`);
  }

  return path;
}

function getNodePath(
  nodes: SceneNode[],
  nodeId: string,
  ancestors: SceneNode[] = [],
): SceneNode[] | undefined {
  for (const node of nodes) {
    const path = [...ancestors, node];
    if (node.id === nodeId) {
      return path;
    }

    const childPath = getNodePath(node.children ?? [], nodeId, path);
    if (childPath != null) {
      return childPath;
    }
  }

  return undefined;
}

function combineNodeWorldTransforms(
  nodes: SceneNode[],
): ResolvedWorldTransform {
  return nodes.reduce<ResolvedWorldTransform>((worldTransform, node) => {
    const position = node.transform?.position ?? [0, 0, 0];
    const scale = scaleToVec3(node.transform?.scale);
    const rotationDeg = node.transform?.rotationDeg ?? [0, 0, 0];
    const localLinear = composeLinearTransform(rotationDeg, scale);
    return {
      linear: multiplyMat3(worldTransform.linear, localLinear),
      position: addVec3(
        worldTransform.position,
        transformVec3(worldTransform.linear, position),
      ),
    };
  }, identityWorldTransform());
}

function worldPointToLocal(
  point: Vec3,
  parentWorldTransform: ResolvedWorldTransform,
): Vec3 {
  return roundHelperVec3(
    transformVec3(
      invertMat3(parentWorldTransform.linear),
      subtractVec3(point, parentWorldTransform.position),
    ),
  );
}

function identityWorldTransform(): ResolvedWorldTransform {
  return {
    linear: IDENTITY_LINEAR_MATRIX,
    position: [0, 0, 0],
  };
}

function composeLinearTransform(rotationDeg: Vec3, scale: Vec3): Mat3 {
  const rotation = eulerDegToMatrix(rotationDeg);
  return [
    rotation[0] * scale[0],
    rotation[1] * scale[1],
    rotation[2] * scale[2],
    rotation[3] * scale[0],
    rotation[4] * scale[1],
    rotation[5] * scale[2],
    rotation[6] * scale[0],
    rotation[7] * scale[1],
    rotation[8] * scale[2],
  ];
}

function eulerDegToMatrix(rotationDeg: Vec3): Mat3 {
  const x = degreesToRadians(rotationDeg[0]);
  const y = degreesToRadians(rotationDeg[1]);
  const z = degreesToRadians(rotationDeg[2]);
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);

  return [
    c * e,
    -c * f,
    d,
    a * f + b * e * d,
    a * e - b * f * d,
    -b * c,
    b * f - a * e * d,
    b * e + a * f * d,
    a * c,
  ];
}

function multiplyMat3(first: Mat3, second: Mat3): Mat3 {
  return [
    first[0] * second[0] + first[1] * second[3] + first[2] * second[6],
    first[0] * second[1] + first[1] * second[4] + first[2] * second[7],
    first[0] * second[2] + first[1] * second[5] + first[2] * second[8],
    first[3] * second[0] + first[4] * second[3] + first[5] * second[6],
    first[3] * second[1] + first[4] * second[4] + first[5] * second[7],
    first[3] * second[2] + first[4] * second[5] + first[5] * second[8],
    first[6] * second[0] + first[7] * second[3] + first[8] * second[6],
    first[6] * second[1] + first[7] * second[4] + first[8] * second[7],
    first[6] * second[2] + first[7] * second[5] + first[8] * second[8],
  ];
}

function invertMat3(matrix: Mat3): Mat3 {
  const a00 = matrix[0];
  const a01 = matrix[1];
  const a02 = matrix[2];
  const a10 = matrix[3];
  const a11 = matrix[4];
  const a12 = matrix[5];
  const a20 = matrix[6];
  const a21 = matrix[7];
  const a22 = matrix[8];
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  let determinant = a00 * b01 + a01 * b11 + a02 * b21;

  if (Math.abs(determinant) < 1e-12) {
    throw new Error(
      'Cannot convert world transform through a zero-scale parent',
    );
  }

  determinant = 1 / determinant;
  return [
    b01 * determinant,
    (-a22 * a01 + a02 * a21) * determinant,
    (a12 * a01 - a02 * a11) * determinant,
    b11 * determinant,
    (a22 * a00 - a02 * a20) * determinant,
    (-a12 * a00 + a02 * a10) * determinant,
    b21 * determinant,
    (-a21 * a00 + a01 * a20) * determinant,
    (a11 * a00 - a01 * a10) * determinant,
  ];
}

function transformVec3(matrix: Mat3, vector: Vec3): Vec3 {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

function decomposeLinearTransform(linear: Mat3): {
  rotationDeg: Vec3;
  scale: Vec3;
} {
  const scale: Vec3 = [
    vectorLength([linear[0], linear[3], linear[6]]),
    vectorLength([linear[1], linear[4], linear[7]]),
    vectorLength([linear[2], linear[5], linear[8]]),
  ];

  if (scale.some((value) => Math.abs(value) < 1e-12)) {
    throw new Error(
      'Cannot convert world transform through a zero-scale parent',
    );
  }

  const rotation: Mat3 = [
    linear[0] / scale[0],
    linear[1] / scale[1],
    linear[2] / scale[2],
    linear[3] / scale[0],
    linear[4] / scale[1],
    linear[5] / scale[2],
    linear[6] / scale[0],
    linear[7] / scale[1],
    linear[8] / scale[2],
  ];

  return {
    rotationDeg: matrixToEulerDeg(rotation),
    scale: roundHelperVec3(scale),
  };
}

function matrixToEulerDeg(matrix: Mat3): Vec3 {
  const y = Math.asin(clamp(matrix[2], -1, 1));
  let x;
  let z;
  if (Math.abs(matrix[2]) < 0.9999999) {
    x = Math.atan2(-matrix[5], matrix[8]);
    z = Math.atan2(-matrix[1], matrix[0]);
  } else {
    x = Math.atan2(matrix[7], matrix[4]);
    z = 0;
  }

  return roundHelperVec3([
    radiansToDegrees(x),
    radiansToDegrees(y),
    radiansToDegrees(z),
  ]);
}

function vectorLength(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function addVec3(first: Vec3, second: Vec3): Vec3 {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
}

function subtractVec3(first: Vec3, second: Vec3): Vec3 {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function vec3ToSceneScale(scale: Vec3): SceneScale {
  return scale.every((value) => value === scale[0]) ? scale[0] : scale;
}

function getAlignmentTargetMetric(
  document: SceneDocument,
  fallbackNodeId: string,
  targetNodeId: string | undefined,
  options: { axisIndex: 0 | 1 | 2; edge: SceneAlignment },
) {
  const nodeId = targetNodeId ?? fallbackNodeId;
  findRequiredNode(document, nodeId);
  const bounds = getNodeWorldBounds(document, nodeId);
  return getBoundsMetric(bounds, options.axisIndex, options.edge);
}

function getNodeWorldBounds(document: SceneDocument, nodeId: string) {
  const node = findRequiredNode(document, nodeId);
  const worldTransform = getNodeWorldTransform(document, nodeId);
  if (node.asset == null) {
    return {
      min: worldTransform.position,
      max: worldTransform.position,
    };
  }

  const asset = findAsset(document, node.asset);
  if (asset?.bounds == null) {
    return {
      min: worldTransform.position,
      max: worldTransform.position,
    };
  }

  const corners = boundsCorners(asset.bounds);
  const worldCorners = corners.map((corner) =>
    addVec3(
      worldTransform.position,
      transformVec3(worldTransform.linear, corner),
    ),
  );
  return boundsFromPoints(worldCorners);
}

function boundsCorners(bounds: { min: Vec3; max: Vec3 }): Vec3[] {
  return [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
  ];
}

function boundsFromPoints(points: Vec3[]) {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let index = 0; index < 3; index += 1) {
      min[index] = Math.min(min[index], point[index]);
      max[index] = Math.max(max[index], point[index]);
    }
  }
  return {
    max: roundHelperVec3(max),
    min: roundHelperVec3(min),
  };
}

function getBoundsMetric(
  bounds: { min: Vec3; max: Vec3 },
  axisIndex: 0 | 1 | 2,
  edge: SceneAlignment,
) {
  switch (edge) {
    case 'min':
      return bounds.min[axisIndex];
    case 'center':
      return (bounds.min[axisIndex] + bounds.max[axisIndex]) / 2;
    case 'max':
      return bounds.max[axisIndex];
  }
}

function findRequiredNode(document: SceneDocument, nodeId: string) {
  const node = findNode(document.nodes, nodeId);
  if (node == null) {
    throw new Error(`Unknown node "${nodeId}"`);
  }

  return node;
}

function findAsset(
  document: SceneDocument,
  assetId: string,
): SceneAsset | undefined {
  return (document.assets ?? []).find((entry) => entry.id === assetId);
}

function findRequiredAsset(
  document: SceneDocument,
  assetId: string | undefined,
  nodeId: string,
): SceneAsset {
  if (assetId == null) {
    throw new Error(`Node "${nodeId}" has no asset`);
  }

  const asset = (document.assets ?? []).find((entry) => entry.id === assetId);
  if (asset == null) {
    throw new Error(`Unknown asset "${assetId}" for node "${nodeId}"`);
  }

  return asset;
}

function scaleToVec3(scale: SceneScale | undefined): Vec3 {
  if (scale == null) {
    return [1, 1, 1];
  }

  return typeof scale === 'number' ? [scale, scale, scale] : scale;
}

function validatePositiveVec3(value: Vec3, fieldName: string) {
  for (const entry of value) {
    if (!Number.isFinite(entry) || entry <= 0) {
      throw new Error(`${fieldName} values must be finite numbers above 0`);
    }
  }
}

function normalizeDegrees(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function roundHelperNumber(value: number) {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundHelperVec3(value: Vec3): Vec3 {
  return value.map(roundHelperNumber) as Vec3;
}

function compactTransform(transform: SceneTransform): SceneTransform {
  const nextTransform: SceneTransform = { ...transform };
  if (
    nextTransform.position != null &&
    nextTransform.position.every((value) => value === 0)
  ) {
    delete nextTransform.position;
  }
  if (
    nextTransform.rotationDeg != null &&
    nextTransform.rotationDeg.every((value) => value === 0)
  ) {
    delete nextTransform.rotationDeg;
  }
  const scale = scaleToVec3(nextTransform.scale);
  if (scale.every((value) => value === 1)) {
    delete nextTransform.scale;
  }
  return nextTransform;
}
