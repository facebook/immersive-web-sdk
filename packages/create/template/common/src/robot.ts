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
  private lookAtTarget = new Vector3();
  private robotPosition = new Vector3();

  init(): void {
    this.queries.robotClicked.subscribe('qualify', (entity) => {
      AudioUtils.play(entity);
    });
  }

  update(): void {
    this.queries.robot.entities.forEach((entity) => {
      const robot = entity.object3D;
      if (robot == null) {
        return;
      }
      this.player.head.updateWorldMatrix(true, false);
      robot.updateWorldMatrix(true, false);
      this.lookAtTarget.setFromMatrixPosition(this.player.head.matrixWorld);
      this.robotPosition.setFromMatrixPosition(robot.matrixWorld);
      this.lookAtTarget.y = this.robotPosition.y;
      robot.lookAt(this.lookAtTarget);
    });
  }
}
