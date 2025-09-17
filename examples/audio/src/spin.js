/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createComponent,
  createSystem,
  Vector3,
  Pressed,
  AudioUtils,
} from '@iwsdk/core';

export const Spinner = createComponent('Spinner', {});

export class SpinSystem extends createSystem({
  spinner: { required: [Spinner] },
  pressedSpinner: { required: [Spinner, Pressed] },
}) {
  init() {
    this.lookAtTarget = new Vector3();
    this.vec3 = new Vector3();

    this.queries.pressedSpinner.subscribe('qualify', (entity) => {
      AudioUtils.play(entity);
    });
  }

  update() {
    this.queries.spinner.entities.forEach((entity) => {
      this.player.head.getWorldPosition(this.lookAtTarget);
      const spinnerObject = entity.object3D;
      spinnerObject.getWorldPosition(this.vec3);
      this.lookAtTarget.y = this.vec3.y;
      spinnerObject.lookAt(this.lookAtTarget);
    });
  }
}
