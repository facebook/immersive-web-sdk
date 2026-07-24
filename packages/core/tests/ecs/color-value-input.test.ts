/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from 'elics';
import { describe, expect, it } from 'vitest';
import { createComponent, Types } from '../../src/ecs/component.js';
import '../../src/ecs/entity.js';
import { Color } from '../../src/runtime/three.js';

const ColorInputTest = createComponent('ColorInputTest', {
  tint: { type: Types.Color, default: [0, 0, 0, 1] },
});

const VectorInputTest = createComponent('VectorInputTest', {
  position: { type: Types.Vec3, default: [0, 0, 0] },
});

function createColorEntity() {
  return new World().createEntity().addComponent(ColorInputTest);
}

function expectTint(
  entity: ReturnType<typeof createColorEntity>,
  expected: [number, number, number, number],
) {
  const tint = Array.from(entity.getVectorView(ColorInputTest, 'tint'));

  for (let i = 0; i < expected.length; i++) {
    expect(tint[i]).toBeCloseTo(expected[i], 6);
  }
}

describe('Types.Color setValue input coercion', () => {
  it('coerces numeric hex input to normalized RGBA', () => {
    const entity = createColorEntity();

    entity.setValue(ColorInputTest, 'tint', 0xff0000);

    expectTint(entity, [1, 0, 0, 1]);
  });

  it('rejects numeric hex input outside the RGB range', () => {
    const entity = createColorEntity();

    expect(() => entity.setValue(ColorInputTest, 'tint', 0xff0000ff)).toThrow(
      'Use #RRGGBBAA strings when alpha is needed.',
    );
  });

  it('coerces #RRGGBB and #RRGGBBAA strings to normalized RGBA', () => {
    const entity = createColorEntity();

    entity.setValue(ColorInputTest, 'tint', '#00ff80');
    expectTint(entity, [0, 1, 128 / 255, 1]);

    entity.setValue(ColorInputTest, 'tint', '#33669980');
    expectTint(entity, [51 / 255, 102 / 255, 153 / 255, 128 / 255]);
  });

  it('coerces THREE.Color input and appends opaque alpha', () => {
    const entity = createColorEntity();

    entity.setValue(ColorInputTest, 'tint', new Color(0.25, 0.5, 0.75));

    expectTint(entity, [0.25, 0.5, 0.75, 1]);
  });

  it('appends alpha for RGB arrays and preserves RGBA arrays', () => {
    const entity = createColorEntity();

    entity.setValue(ColorInputTest, 'tint', [0.1, 0.2, 0.3]);
    expectTint(entity, [0.1, 0.2, 0.3, 1]);

    entity.setValue(ColorInputTest, 'tint', [0.4, 0.5, 0.6, 0.7]);
    expectTint(entity, [0.4, 0.5, 0.6, 0.7]);
  });

  it('rejects non-finite RGB array entries', () => {
    const entity = createColorEntity();

    expect(() =>
      entity.setValue(ColorInputTest, 'tint', [0.1, Number.NaN, 0.3]),
    ).toThrow('Color array entries must be finite numbers.');
  });

  it('keeps non-color vector setValue behavior unchanged', () => {
    const entity = new World().createEntity().addComponent(VectorInputTest);

    expect(() =>
      entity.setValue(VectorInputTest, 'position', [1, 2, 3]),
    ).toThrow('Array/vector types must be written via getVectorView');
  });
});
