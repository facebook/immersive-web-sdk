/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AudioSource,
  AudioUtils,
  createSystem,
  Grabbed,
  GrabSystem,
  Hovered,
  Mesh,
  MeshStandardMaterial,
  OneHandGrabbable,
  PhysicsSystem,
  Pressed,
  RayInteractable,
  UIKitMLAsset,
} from '@iwsdk/core';
import { BrowserMouseLookSystem } from './mouselook.js';

const BALL_COLOR_IDLE = 0xa78bfa;
const BALL_COLOR_GRABBED = 0xfacc15;
const RAY_COLOR_IDLE = 0xffffff;
const RAY_COLOR_HOVERED = 0x38bdf8;
const RAY_COLOR_PRESSED = 0x2563eb;

interface ResetPoseMetadata {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export class BrowserFirstFeedbackSystem extends createSystem({
  rayTargets: { required: [RayInteractable] },
  oneHandGrabTargets: { required: [OneHandGrabbable] },
  pressedAudio: { required: [AudioSource, Pressed] },
}) {
  init(): void {
    this.queries.pressedAudio.subscribe('qualify', (entity) => {
      AudioUtils.play(entity);
    });

    const panel = this.world.requireSceneObject<UIKitMLAsset>('welcome-panel');
    const resetButton = panel.requireElementById('reset-button');
    const toggleViewButton = panel.requireElementById('toggle-view-button');
    const resetBall = () => this.resetBall();
    const toggleView = () => {
      this.world.getSystem(BrowserMouseLookSystem)?.toggleMode();
    };

    resetButton.addEventListener('click', resetBall);
    toggleViewButton.addEventListener('click', toggleView);
    this.cleanupFuncs.push(() => {
      resetButton.removeEventListener('click', resetBall);
      toggleViewButton.removeEventListener('click', toggleView);
    });
  }

  update(): void {
    this.queries.rayTargets.entities.forEach((entity) => {
      const material = (entity.object3D as Mesh | undefined)?.material as
        | MeshStandardMaterial
        | undefined;
      if (!material?.color) {
        return;
      }

      if (entity.hasComponent(Pressed)) {
        material.color.set(RAY_COLOR_PRESSED);
      } else if (entity.hasComponent(Hovered)) {
        material.color.set(RAY_COLOR_HOVERED);
      } else {
        material.color.set(RAY_COLOR_IDLE);
      }
    });

    this.queries.oneHandGrabTargets.entities.forEach((entity) => {
      const material = (entity.object3D as Mesh | undefined)?.material as
        | MeshStandardMaterial
        | undefined;
      if (!material?.color) {
        return;
      }

      material.color.set(
        entity.hasComponent(Grabbed) ? BALL_COLOR_GRABBED : BALL_COLOR_IDLE,
      );
    });
  }

  private resetBall(): void {
    const ball = this.world.requireSceneEntity('physics-ball');
    const resetPose = ball.object3D?.userData.iwsdkSceneMetadata?.[
      'browser-first.resetPose'
    ] as ResetPoseMetadata | undefined;
    if (!resetPose) {
      throw new Error('Scene node "physics-ball" is missing its reset pose');
    }

    this.world.getSystem(GrabSystem)?.forceRelease(ball);
    this.world.getSystem(PhysicsSystem)?.setBodyTransform(ball, resetPose);
  }
}
