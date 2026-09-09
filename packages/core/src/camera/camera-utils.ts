/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity } from '../ecs/entity.js';
import { CameraSource } from './camera-source.js';
import {
  CameraFacing,
  CameraState,
  type CameraDeviceInfo,
  type CameraFacingType,
} from './types.js';

/**
 * CameraUtils - Static utilities for camera discovery and selection
 * Handles permission requests and device enumeration with caching
 */
export class CameraUtils {
  private static cachedDevices: CameraDeviceInfo[] | null = null;

  /**
   * Get available camera devices
   *
   * On first call or if refresh=true:
   * - Requests camera permission (if not granted)
   * - Enumerates all video input devices
   * - Caches results for subsequent calls
   *
   * On subsequent calls with refresh=false:
   * - Returns cached results immediately
   *
   * @param refresh - Force re-enumeration (useful for hot-plugged devices)
   * @returns Array of available camera devices
   */
  static async getDevices(refresh = false): Promise<CameraDeviceInfo[]> {
    // Return cache if available and not forcing refresh
    if (this.cachedDevices && !refresh) {
      return this.cachedDevices;
    }

    try {
      // Request permission by getting a temporary stream
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      // Immediately stop the stream - we just needed permission
      tempStream.getTracks().forEach((track) => track.stop());

      // Enumerate all video devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      // Map to our interface with facing detection
      this.cachedDevices = videoDevices.map((device) => {
        const label = device.label.toLowerCase();
        let facing: CameraFacingType = CameraFacing.Unknown;

        if (
          label.includes('back') ||
          label.includes('environment') ||
          label.includes('rear')
        ) {
          facing = CameraFacing.Back;
        } else if (
          label.includes('front') ||
          label.includes('user') ||
          label.includes('face')
        ) {
          facing = CameraFacing.Front;
        }

        return {
          deviceId: device.deviceId,
          label: device.label,
          facing,
        };
      });

      return this.cachedDevices;
    } catch (error) {
      console.error('Failed to enumerate camera devices:', error);
      throw error;
    }
  }

  /**
   * Find camera by facing direction from device list
   */
  static findByFacing(
    devices: CameraDeviceInfo[],
    facing: CameraFacingType,
  ): CameraDeviceInfo | null {
    return devices.find((d) => d.facing === facing) || null;
  }

  /**
   * Check if camera permission is granted (doesn't request)
   */
  static async hasPermission(): Promise<boolean> {
    try {
      const result = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      return result.state === 'granted';
    } catch {
      // Permissions API not supported
      return false;
    }
  }

  /**
   * Restart a camera source after changing its configuration or handling an
   * error. CameraSystem releases the previous resources before starting again.
   */
  static restart(entity: Entity): void {
    entity.setValue(CameraSource, 'state', CameraState.Inactive);
  }

  /**
   * Capture current video frame as a canvas
   * Returns canvas at full video resolution, ready for processing
   *
   * @param entity - Entity with CameraSource component
   * @returns HTMLCanvasElement or null if camera not ready
   *
   * @example
   * // Simple texture creation
   * const canvas = CameraUtils.captureFrame(cameraEntity);
   * if (canvas) {
   *   const texture = new CanvasTexture(canvas);
   * }
   *
   * @example
   * // With post-processing
   * const canvas = CameraUtils.captureFrame(cameraEntity);
   * if (canvas) {
   *   const ctx = canvas.getContext('2d');
   *   ctx.filter = 'blur(2px)';
   *   const texture = new CanvasTexture(canvas);
   * }
   */
  static captureFrame(entity: Entity): HTMLCanvasElement | null {
    // Get video element from CameraSource component
    const videoElement = entity.getValue(
      CameraSource,
      'videoElement',
    ) as HTMLVideoElement | null;

    if (!videoElement) {
      return null;
    }

    // Validate video has valid dimensions
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }

    // Create canvas at video resolution
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    // Draw current video frame to canvas
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
    if (!ctx) {
      return null;
    }

    ctx.drawImage(videoElement, 0, 0);

    return canvas;
  }
}
