/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, createSystem, Types } from '@iwsdk/core';

const AXES = {
  X: 'X',
  Y: 'Y',
  Z: 'Z',
};

export const Spinner = createComponent('Spinner', {
  speed: { type: Types.Float32, default: 1.0 },
  axis: { type: Types.Enum, enum: AXES, default: AXES.Y },
});

export class SpinSystem extends createSystem({
  spinner: { required: [Spinner] },
}) {
  update(delta) {
    this.queries.spinner.entities.forEach((entity) => {
      const speed = entity.getValue(Spinner, 'speed');
      const axis = entity.getValue(Spinner, 'axis');

      // Apply rotation based on axis and speed
      const rotationAmount = delta * speed;
      switch (axis) {
        case 'X':
          entity.object3D.rotateX(rotationAmount);
          break;
        case 'Y':
          entity.object3D.rotateY(rotationAmount);
          break;
        case 'Z':
          entity.object3D.rotateZ(rotationAmount);
          break;
      }
    });
  }
}
