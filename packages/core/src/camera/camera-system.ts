/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem } from '../ecs/system.js';
import { Entity } from '../ecs/entity.js';
import { VisibilityState } from '../ecs/world.js';
import { LinearFilter, VideoTexture } from '../runtime/three.js';
import { CameraSource } from './camera-source.js';
import { CameraUtils } from './camera-utils.js';
import {
  CameraFacing,
  CameraState,
  type CameraFacingType,
  type CameraStateType,
} from './types.js';

/**
 * CameraSystem - Manages camera stream lifecycle for CameraSource components
 * Automatically starts streams when the world is visible, including browser
 * non-immersive mode and immersive XR sessions.
 *
 * System is stateless - all state is stored in CameraSource components
 */
export class CameraSystem extends createSystem({
  cameras: { required: [CameraSource] },
}) {
  init() {
    // Stop all cameras only when the page/session is hidden. Register the
    // unsubscribe so the callback (and its closure over `this`) is released on
    // system teardown rather than leaking.
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.Hidden) {
          for (const entity of this.queries.cameras.entities) {
            this.stopCamera(entity);
          }
        }
      }),
    );
  }

  update() {
    // CameraSource uses browser media APIs and works outside immersive XR.
    if (this.world.visibilityState.value === VisibilityState.Hidden) {
      return;
    }

    for (const entity of this.queries.cameras.entities) {
      const state = entity.getValue(CameraSource, 'state') as CameraStateType;

      // Start camera if inactive (not started or errored)
      if (state === CameraState.Inactive || state === CameraState.Error) {
        this.startCamera(entity);
      }
    }
  }

  /**
   * Start camera stream for an entity
   * Async operation - sets state to Starting, then Active when complete
   * Users should check state or null-check texture/videoElement before using
   *
   * Checks state after each async operation to abort if stopCamera was called
   */
  private async startCamera(entity: Entity) {
    // Set state to Starting to prevent duplicate attempts
    entity.setValue(CameraSource, 'state', CameraState.Starting);

    try {
      let deviceId = entity.getValue(CameraSource, 'deviceId') as string;

      // Auto-select camera if no deviceId provided
      if (!deviceId) {
        const devices = await CameraUtils.getDevices();

        // Check if we should abort (stopCamera was called during async operation)
        const currentState = entity.getValue(
          CameraSource,
          'state',
        ) as CameraStateType;
        if (currentState !== CameraState.Starting) {
          return; // Aborted
        }

        const facing = entity.getValue(
          CameraSource,
          'facing',
        ) as CameraFacingType;

        if (facing === CameraFacing.Unknown) {
          // Unknown = any camera is fine, use first available
          if (devices.length > 0) {
            deviceId = devices[0].deviceId;
            entity.setValue(CameraSource, 'deviceId', deviceId);
          } else {
            console.error('No cameras available');
            entity.setValue(CameraSource, 'state', CameraState.Error);
            return;
          }
        } else {
          // Specific facing requested - must match or fail
          const selected = CameraUtils.findByFacing(devices, facing);

          if (selected) {
            deviceId = selected.deviceId;
            entity.setValue(CameraSource, 'deviceId', deviceId);
          } else {
            const facingStr = facing === CameraFacing.Back ? 'back' : 'front';
            console.error(
              `No ${facingStr}-facing camera available (found ${devices.length} camera(s))`,
            );
            entity.setValue(CameraSource, 'state', CameraState.Error);
            return;
          }
        }
      }

      // Get stream constraints
      const width = entity.getValue(CameraSource, 'width');
      const height = entity.getValue(CameraSource, 'height');
      const frameRate = entity.getValue(CameraSource, 'frameRate');

      // Request camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: width as number | undefined },
          height: { ideal: height as number | undefined },
          frameRate: { ideal: frameRate as number | undefined },
        },
      });

      // Check if we should abort after getting stream
      const currentState = entity.getValue(
        CameraSource,
        'state',
      ) as CameraStateType;
      if (currentState !== CameraState.Starting) {
        // Aborted - clean up the stream we just created
        this.cleanupCameraResources(stream, null, null);
        return;
      }

      // Create video element
      const video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.muted = true;
      video.srcObject = stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          resolve();
        };

        const onError = (error: Event) => {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          reject(error);
        };

        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('error', onError);
      });

      // Check if we should abort after video ready
      const finalState = entity.getValue(
        CameraSource,
        'state',
      ) as CameraStateType;
      if (finalState !== CameraState.Starting) {
        // Aborted - clean up everything
        this.cleanupCameraResources(stream, video, null);
        return;
      }

      // Start playback
      await video.play();

      // Create VideoTexture
      const texture = new VideoTexture(video);
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;

      // Final check before committing - ensure state is still Starting
      const committingState = entity.getValue(
        CameraSource,
        'state',
      ) as CameraStateType;
      if (committingState !== CameraState.Starting) {
        // Aborted at the last moment - clean up everything
        this.cleanupCameraResources(stream, video, texture);
        return;
      }

      // Commit all resources atomically
      entity.setValue(CameraSource, 'stream', stream);
      entity.setValue(CameraSource, 'videoElement', video);
      entity.setValue(CameraSource, 'texture', texture);
      entity.setValue(CameraSource, 'state', CameraState.Active);
    } catch (error) {
      console.error('Failed to start camera:', error);

      // Clean up any partial state
      const stream = entity.getValue(
        CameraSource,
        'stream',
      ) as MediaStream | null;
      const video = entity.getValue(
        CameraSource,
        'videoElement',
      ) as HTMLVideoElement | null;
      const texture = entity.getValue(
        CameraSource,
        'texture',
      ) as VideoTexture | null;

      this.cleanupCameraResources(stream, video, texture);

      entity.setValue(CameraSource, 'stream', null);
      entity.setValue(CameraSource, 'videoElement', null);
      entity.setValue(CameraSource, 'texture', null);
      entity.setValue(CameraSource, 'state', CameraState.Error);
    }
  }

  /**
   * Stop camera stream for an entity
   */
  private stopCamera(entity: Entity) {
    const stream = entity.getValue(
      CameraSource,
      'stream',
    ) as MediaStream | null;
    const video = entity.getValue(
      CameraSource,
      'videoElement',
    ) as HTMLVideoElement | null;
    const texture = entity.getValue(
      CameraSource,
      'texture',
    ) as VideoTexture | null;

    this.cleanupCameraResources(stream, video, texture);

    // Clear component values and set state to Inactive
    entity.setValue(CameraSource, 'stream', null);
    entity.setValue(CameraSource, 'videoElement', null);
    entity.setValue(CameraSource, 'texture', null);
    entity.setValue(CameraSource, 'state', CameraState.Inactive);
  }

  /**
   * Clean up camera resources (stream, video element, texture)
   */
  private cleanupCameraResources(
    stream: MediaStream | null,
    video: HTMLVideoElement | null,
    texture: VideoTexture | null,
  ) {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (texture) {
      texture.dispose();
    }
  }
}
