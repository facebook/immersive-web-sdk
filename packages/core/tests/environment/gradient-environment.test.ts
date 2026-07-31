/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  createGradientMaterial,
  GRADIENT_SHADER,
} from '../../src/environment/gradient-environment.js';
import { BackSide } from '../../src/runtime/index.js';

describe('gradient environment background', () => {
  it('renders as a translation-free sky at clip-space depth', () => {
    expect(GRADIENT_SHADER.vertexShader).toContain('mat3(viewMatrix)');
    expect(GRADIENT_SHADER.vertexShader).toContain('clipPosition.xyww');
    expect(GRADIENT_SHADER.vertexShader).not.toContain('modelViewMatrix');

    const material = createGradientMaterial(
      0x112233,
      0x445566,
      0x778899,
      1,
      BackSide,
    );
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    material.dispose();
  });
});
