/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem } from '@iwsdk/core';

const RADIANS_PER_PIXEL = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const RIGHT_BUTTON = 2;
const EYE_HEIGHT = 1.6;
const INITIAL_PLAYER_POSITION = [-4, 0, -6] as const;
const INITIAL_LOOK_AT = [0, 1.1, -1.8] as const;

export class BrowserMouseLookSystem extends createSystem({}) {
  private locked = false;
  private pitch = 0;

  init(): void {
    this.player.position.set(...INITIAL_PLAYER_POSITION);
    const lookDeltaX = INITIAL_LOOK_AT[0] - INITIAL_PLAYER_POSITION[0];
    const lookDeltaZ = INITIAL_LOOK_AT[2] - INITIAL_PLAYER_POSITION[2];
    this.player.rotation.y = Math.atan2(-lookDeltaX, -lookDeltaZ);
    this.pitch = Math.atan2(
      INITIAL_LOOK_AT[1] - EYE_HEIGHT,
      Math.hypot(lookDeltaX, lookDeltaZ),
    );
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.camera.rotation.set(this.pitch, 0, 0);

    const canvas = this.renderer.domElement as HTMLCanvasElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== RIGHT_BUTTON) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      canvas.requestPointerLock();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== RIGHT_BUTTON) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.locked) {
        document.exitPointerLock();
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const onPointerLockChange = () => {
      this.locked = document.pointerLockElement === canvas;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!this.locked) {
        return;
      }
      this.player.rotateY(-event.movementX * RADIANS_PER_PIXEL);
      this.pitch = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT, this.pitch - event.movementY * RADIANS_PER_PIXEL),
      );
      this.camera.rotation.set(this.pitch, 0, 0);
    };

    // Capture reserves RMB before canvas pointer forwarding reaches grabbing.
    canvas.addEventListener('pointerdown', onPointerDown, true);
    canvas.addEventListener('pointerup', onPointerUp, true);
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);

    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      canvas.removeEventListener('pointerup', onPointerUp, true);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    });
  }
}
