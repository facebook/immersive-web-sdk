/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AudioUtils, createSystem, Pressed, Vector3 } from '@iwsdk/core';
import { Robot } from './robot-component.js';

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
      const spinnerObject = entity.object3D!;
      this.player.head.updateWorldMatrix(true, false);
      spinnerObject.updateWorldMatrix(true, false);
      const headMatrix = this.player.head.matrixWorld.elements;
      const spinnerMatrix = spinnerObject.matrixWorld.elements;
      this.lookAtTarget.set(headMatrix[12], headMatrix[13], headMatrix[14]);
      this.vec3.set(spinnerMatrix[12], spinnerMatrix[13], spinnerMatrix[14]);
      this.lookAtTarget.y = this.vec3.y;
      spinnerObject.lookAt(this.lookAtTarget);
    });
  }
}
