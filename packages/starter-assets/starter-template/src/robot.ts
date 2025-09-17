/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AudioUtils,
  createComponent,
  createSystem,
  Pressed,
  Vector3,
} from '@iwsdk/core';

export const Robot = createComponent('Robot', {});

export class RobotSystem extends createSystem({
  robot: { required: [Robot] },
  robotClicked: { required: [Robot, Pressed] },
}) {
  private lookAtTarget!: Vector3;
  private vec3!: Vector3;

  init() {
    this.lookAtTarget = new Vector3();
    this.vec3 = new Vector3();
    this.queries.robotClicked.subscribe('qualify', (entity) => {
      AudioUtils.play(entity);
    });
  }

  update() {
    this.queries.robot.entities.forEach((entity) => {
      this.player.head.getWorldPosition(this.lookAtTarget);
      const spinnerObject = entity.object3D!;
      spinnerObject.getWorldPosition(this.vec3);
      this.lookAtTarget.y = this.vec3.y;
      spinnerObject.lookAt(this.lookAtTarget);
    });
  }
}
