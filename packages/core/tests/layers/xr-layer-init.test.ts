/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import { createQuadLayerInit } from '../../src/layers/xr-layer-init.js';

describe('createQuadLayerInit', () => {
  it('preserves the component dimensions as full layer dimensions', () => {
    const transform = {} as XRRigidTransform;
    const space = {} as XRSpace;

    expect(
      createQuadLayerInit({
        transform,
        width: 1.4,
        height: 0.8,
        space,
        pixelWidth: 1400,
        pixelHeight: 800,
      }),
    ).toEqual({
      transform,
      width: 1.4,
      height: 0.8,
      space,
      viewPixelWidth: 1400,
      viewPixelHeight: 800,
      clearOnAccess: false,
    });
  });
});
