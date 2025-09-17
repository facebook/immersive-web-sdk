/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, createSystem, Types } from '@iwsdk/core';

export const Elevator = createComponent('Elevator', {
  deltaY: { type: Types.Float32, default: 4 },
  speed: { type: Types.Float32, default: 0.5 },
});

export class ElevatorSystem extends createSystem({
  elevator: { required: [Elevator] },
}) {
  update(_delta, time) {
    this.queries.elevator.entities.forEach((entity) => {
      const speed = entity.getValue(Elevator, 'speed');
      const deltaY = entity.getValue(Elevator, 'deltaY');
      entity.object3D.position.y = Math.sin(time * speed) * deltaY;
    });
  }
}
