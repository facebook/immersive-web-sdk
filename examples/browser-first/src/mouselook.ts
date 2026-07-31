/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Mesh } from '@iwsdk/core';

const RADIANS_PER_PIXEL = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const RIGHT_BUTTON = 2;
const EYE_HEIGHT = 1.6;
const TPS_DISTANCE = 2.1;
const TPS_FOV = 70;
const TPS_TARGET_HEIGHT = 0.8;
const TPS_BASE_ELEVATION = (Math.PI * 8) / 45;
const TPS_MIN_ELEVATION = -Math.PI / 18;
const TPS_MAX_ELEVATION = (Math.PI * 4) / 9;

type ViewMode = 'fps' | 'tps';

export class BrowserMouseLookSystem extends createSystem({}) {
  private locked = false;
  private pitch = 0;
  private mode: ViewMode = 'fps';
  private firstPersonFov = 50;

  init(): void {
    this.firstPersonFov = this.camera.fov;
    this.setAvatarVisible(false);
    this.applyCameraPose();

    const canvas = this.renderer.domElement as HTMLCanvasElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== RIGHT_BUTTON) {
        return;
      }
      event.preventDefault();
      canvas.requestPointerLock();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== RIGHT_BUTTON || !this.locked) {
        return;
      }
      document.exitPointerLock();
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
      const nextPitch = this.pitch - event.movementY * RADIANS_PER_PIXEL;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, nextPitch));
      this.applyCameraPose();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);

    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      this.setAvatarVisible(false);
    });
  }

  toggleMode(): void {
    this.mode = this.mode === 'fps' ? 'tps' : 'fps';
    this.setAvatarVisible(this.mode === 'tps');
    this.applyCameraPose();
  }

  private setAvatarVisible(visible: boolean): void {
    this.world.requireSceneObject<Mesh>('player-avatar').visible = visible;
  }

  private applyCameraPose(): void {
    if (this.mode === 'fps') {
      this.camera.fov = this.firstPersonFov;
      this.camera.position.set(0, EYE_HEIGHT, 0);
      this.camera.rotation.set(this.pitch, 0, 0);
    } else {
      this.camera.fov = TPS_FOV;
      const elevation = Math.max(
        TPS_MIN_ELEVATION,
        Math.min(TPS_MAX_ELEVATION, TPS_BASE_ELEVATION - this.pitch),
      );
      this.camera.position.set(
        0,
        TPS_TARGET_HEIGHT + TPS_DISTANCE * Math.sin(elevation),
        TPS_DISTANCE * Math.cos(elevation),
      );
      this.camera.rotation.set(-elevation, 0, 0);
    }
    this.camera.updateProjectionMatrix();
  }
}
