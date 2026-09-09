/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
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
 */
export class CameraSystem extends createSystem({
  cameras: { required: [CameraSource] },
}) {
  private readonly operationIds = new WeakMap<Entity, number>();

  init() {
    const stopIfDocumentHidden = () => {
      if (document.visibilityState === 'hidden') {
        this.stopAllCameras();
      }
    };
    const hasDocumentVisibility =
      typeof document !== 'undefined' &&
      typeof document.addEventListener === 'function';
    if (hasDocumentVisibility) {
      document.addEventListener('visibilitychange', stopIfDocumentHidden);
    }

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.Hidden) {
          this.stopAllCameras();
        }
      }),
      this.queries.cameras.subscribe('disqualify', (entity) => {
        this.stopCamera(entity);
      }),
      () => {
        if (hasDocumentVisibility) {
          document.removeEventListener(
            'visibilitychange',
            stopIfDocumentHidden,
          );
        }
        this.stopAllCameras();
      },
    );
  }

  update() {
    // CameraSource uses browser media APIs and works outside immersive XR.
    const documentHidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (
      documentHidden ||
      this.world.visibilityState.value === VisibilityState.Hidden
    ) {
      return;
    }

    for (const entity of this.queries.cameras.entities) {
      const state = entity.getValue(CameraSource, 'state') as CameraStateType;

      // Error is terminal until callers explicitly set the source inactive.
      if (state === CameraState.Inactive) {
        this.startCamera(entity);
      }
    }
  }

  /**
   * Start camera stream for an entity
   * Async operation - sets state to Starting, then Active when complete
   * Users should check state or null-check texture/videoElement before using
   *
   * Checks an operation generation after each async operation so a restarted
   * camera cannot be overwritten by an older request that resolves later.
   */
  private async startCamera(entity: Entity) {
    const operationId = this.beginOperation(entity);
    this.releaseCameraResources(entity);

    // Set state to Starting to prevent duplicate attempts
    entity.setValue(CameraSource, 'state', CameraState.Starting);
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let texture: VideoTexture | null = null;

    try {
      let deviceId = entity.getValue(CameraSource, 'deviceId') as string;

      // Auto-select camera if no deviceId provided
      if (!deviceId) {
        const devices = await CameraUtils.getDevices();

        if (!this.isCurrentStart(entity, operationId)) {
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
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: width as number | undefined },
          height: { ideal: height as number | undefined },
          frameRate: { ideal: frameRate as number | undefined },
        },
      });

      if (!this.isCurrentStart(entity, operationId)) {
        // Aborted - clean up the stream we just created
        this.cleanupCameraResources(stream, null, null);
        return;
      }

      // Create video element
      const createdVideo = document.createElement('video');
      video = createdVideo;
      createdVideo.setAttribute('playsinline', '');
      createdVideo.setAttribute('autoplay', '');
      createdVideo.muted = true;
      createdVideo.srcObject = stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          createdVideo.removeEventListener('canplay', onCanPlay);
          createdVideo.removeEventListener('error', onError);
          resolve();
        };

        const onError = (error: Event) => {
          createdVideo.removeEventListener('canplay', onCanPlay);
          createdVideo.removeEventListener('error', onError);
          reject(error);
        };

        createdVideo.addEventListener('canplay', onCanPlay);
        createdVideo.addEventListener('error', onError);
      });

      if (!this.isCurrentStart(entity, operationId)) {
        // Aborted - clean up everything
        this.cleanupCameraResources(stream, video, null);
        return;
      }

      // Start playback
      await createdVideo.play();

      // Create VideoTexture
      texture = new VideoTexture(createdVideo);
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;

      if (!this.isCurrentStart(entity, operationId)) {
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
      this.cleanupCameraResources(stream, video, texture);
      if (this.isCurrentStart(entity, operationId)) {
        console.error('Failed to start camera:', error);
        entity.setValue(CameraSource, 'stream', null);
        entity.setValue(CameraSource, 'videoElement', null);
        entity.setValue(CameraSource, 'texture', null);
        entity.setValue(CameraSource, 'state', CameraState.Error);
      }
    }
  }

  /**
   * Stop camera stream for an entity
   */
  private stopCamera(entity: Entity) {
    this.beginOperation(entity);
    this.releaseCameraResources(entity);
    entity.setValue(CameraSource, 'state', CameraState.Inactive);
  }

  private releaseCameraResources(entity: Entity): void {
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
  }

  private stopAllCameras(): void {
    for (const entity of this.queries.cameras.entities) {
      this.stopCamera(entity);
    }
  }

  private beginOperation(entity: Entity): number {
    const operationId = (this.operationIds.get(entity) ?? 0) + 1;
    this.operationIds.set(entity, operationId);
    return operationId;
  }

  private isCurrentStart(entity: Entity, operationId: number): boolean {
    return (
      this.operationIds.get(entity) === operationId &&
      entity.getValue(CameraSource, 'state') === CameraState.Starting
    );
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
