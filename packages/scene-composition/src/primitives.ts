/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { SceneBounds, SceneGeometry, SceneNode } from './types.js';

export const DEFAULT_SCENE_PRIMITIVE_SEGMENTS = 24;
export const MIN_SCENE_PRIMITIVE_SEGMENTS = 3;
export const MAX_SCENE_PRIMITIVE_SEGMENTS = 64;

export function getScenePrimitiveBounds(primitive: SceneGeometry): SceneBounds {
  switch (primitive.type) {
    case 'box': {
      const [width, height, depth] = primitive.size;
      return centeredBounds(width / 2, height / 2, depth / 2);
    }
    case 'sphere':
      return centeredBounds(
        primitive.radius,
        primitive.radius,
        primitive.radius,
      );
    case 'cylinder': {
      const radius =
        'radius' in primitive
          ? primitive.radius
          : Math.max(primitive.radiusTop, primitive.radiusBottom);
      return centeredBounds(radius, primitive.height / 2, radius);
    }
    case 'cone':
      return centeredBounds(
        primitive.radius,
        primitive.height / 2,
        primitive.radius,
      );
    case 'plane': {
      const [width, height] = primitive.size;
      return centeredBounds(width / 2, height / 2, 0);
    }
    case 'capsule':
      return centeredBounds(
        primitive.radius,
        primitive.length / 2 + primitive.radius,
        primitive.radius,
      );
    case 'extrude': {
      const xs = primitive.points.map((point) => point[0]);
      const ys = primitive.points.map((point) => point[1]);
      return {
        min: [Math.min(...xs), Math.min(...ys), -primitive.depth / 2],
        max: [Math.max(...xs), Math.max(...ys), primitive.depth / 2],
      };
    }
    case 'tube': {
      const radius = primitive.radius;
      return {
        min: [
          Math.min(...primitive.points.map((point) => point[0])) - radius,
          Math.min(...primitive.points.map((point) => point[1])) - radius,
          Math.min(...primitive.points.map((point) => point[2])) - radius,
        ],
        max: [
          Math.max(...primitive.points.map((point) => point[0])) + radius,
          Math.max(...primitive.points.map((point) => point[1])) + radius,
          Math.max(...primitive.points.map((point) => point[2])) + radius,
        ],
      };
    }
    case 'lathe': {
      const radius = Math.max(
        ...primitive.profile.map((point) => Math.abs(point[0])),
      );
      return {
        min: [
          radius === 0 ? 0 : -radius,
          Math.min(...primitive.profile.map((point) => point[1])),
          radius === 0 ? 0 : -radius,
        ],
        max: [
          radius,
          Math.max(...primitive.profile.map((point) => point[1])),
          radius,
        ],
      };
    }
    case 'torus': {
      const outerRadius = primitive.radius + primitive.tube;
      return centeredBounds(outerRadius, primitive.tube, outerRadius);
    }
    case 'roundedBox': {
      const [width, height, depth] = primitive.size;
      return centeredBounds(width / 2, height / 2, depth / 2);
    }
  }
}

export function getSceneNodeLocalBounds(
  _node: SceneNode,
  assetBounds?: SceneBounds,
): SceneBounds | undefined {
  return assetBounds;
}

function centeredBounds(x: number, y: number, z: number): SceneBounds {
  return {
    max: [x, y, z],
    min: [
      negateWithoutNegativeZero(x),
      negateWithoutNegativeZero(y),
      negateWithoutNegativeZero(z),
    ],
  };
}

function negateWithoutNegativeZero(value: number): number {
  return value === 0 ? 0 : -value;
}
