/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

interface QuadLayerInitInput {
  transform: XRRigidTransform;
  width: number;
  height: number;
  space: XRSpace;
  pixelWidth: number;
  pixelHeight: number;
}

export function createQuadLayerInit({
  transform,
  width,
  height,
  space,
  pixelWidth,
  pixelHeight,
}: QuadLayerInitInput): XRQuadLayerInit & { clearOnAccess: false } {
  return {
    transform,
    width,
    height,
    space,
    viewPixelWidth: pixelWidth,
    viewPixelHeight: pixelHeight,
    clearOnAccess: false,
  };
}
