/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity } from '../ecs/index.js';
import type { World } from '../ecs/index.js';
import { AudioSource as AudioComponent } from './audio.js';

/** Utility helpers to control {@link AudioSource} without touching Three audio.
 * @category Audio
 */
export class AudioUtils {
  /**
   * Play audio on an entity
   * @param entity - Entity with Audio component
   * @param fadeIn - Fade in duration in seconds
   */
  static play(entity: Entity, fadeIn = 0): void {
    const index = entity.index;
    // Check if entity has audio by checking if data exists
    if (AudioComponent.data.src[index] === undefined) {
      console.warn('Entity does not have Audio component');
      return;
    }

    AudioComponent.data._playRequested[index] = 1;
    AudioComponent.data._fadeIn[index] = fadeIn;
  }

  /**
   * Pause audio on an entity
   * @param entity - Entity with Audio component
   * @param fadeOut - Fade out duration in seconds
   */
  static pause(entity: Entity, fadeOut = 0): void {
    const index = entity.index;
    if (AudioComponent.data.src[index] === undefined) {
      console.warn('Entity does not have Audio component');
      return;
    }

    AudioComponent.data._pauseRequested[index] = 1;
    AudioComponent.data._fadeOut[index] = fadeOut;
  }

  /**
   * Stop audio on an entity
   * @param entity - Entity with Audio component
   */
  static stop(entity: Entity): void {
    const index = entity.index;
    if (AudioComponent.data.src[index] === undefined) {
      console.warn('Entity does not have Audio component');
      return;
    }

    AudioComponent.data._stopRequested[index] = 1;
  }

  /**
   * Check if audio is playing on an entity
   * @param entity - Entity with Audio component
   * @returns True if audio is playing
   */
  static isPlaying(entity: Entity): boolean {
    const index = entity.index;
    if (AudioComponent.data.src[index] === undefined) {
      return false;
    }

    return AudioComponent.data._isPlaying[index] === 1;
  }

  /**
   * Set volume on an entity's audio
   * @param entity - Entity with Audio component
   * @param volume - Volume level (0.0 to 1.0)
   */
  static setVolume(entity: Entity, volume: number): void {
    const index = entity.index;
    if (AudioComponent.data.src[index] === undefined) {
      console.warn('Entity does not have Audio component');
      return;
    }

    AudioComponent.data.volume[index] = Math.max(0, Math.min(1, volume));
  }

  /**
   * Get volume from an entity's audio
   * @param entity - Entity with Audio component
   * @returns Current volume level
   */
  static getVolume(entity: Entity): number {
    const index = entity.index;
    if (AudioComponent.data.src[index] === undefined) {
      return 0;
    }

    return AudioComponent.data.volume[index];
  }

  /**
   * Preload audio for an entity
   * @param entity - Entity with Audio component
   * @returns Promise that resolves when audio is loaded
   */
  static async preload(entity: Entity): Promise<void> {
    const index = entity.index;
    if (AudioComponent.data.src[index] === undefined) {
      throw new Error('Entity does not have Audio component');
    }

    // Wait for loading to complete
    return new Promise<void>((resolve) => {
      const checkLoaded = () => {
        if (AudioComponent.data._loaded[index]) {
          resolve();
        } else if (
          !AudioComponent.data._loading[index] &&
          !AudioComponent.data._loaded[index]
        ) {
          // Not loading and not loaded, might need to wait for system update
          setTimeout(checkLoaded, 16);
        } else {
          // Currently loading
          setTimeout(checkLoaded, 16);
        }
      };

      checkLoaded();
    });
  }

  /**
   * Create a one-shot audio entity that auto-removes after playing
   * @param world - World instance
   * @param src - Audio source path
   * @param options - Additional audio options
   * @returns Created entity
   */
  static createOneShot(
    world: World,
    src: string,
    options: {
      volume?: number;
      positional?: boolean;
      position?: { x: number; y: number; z: number };
    } = {},
  ): Entity {
    const entity = world.createEntity();

    entity.addComponent(AudioComponent, {
      src,
      volume: options.volume ?? 1.0,
      positional: options.positional ?? false,
      autoplay: true,
      loop: false,
    });

    if (options.positional && options.position) {
      // Would need Transform component
      // entity.addComponent(Transform, { position: options.position });
    }

    // Auto-remove entity when sound ends
    // This would be handled by the AudioSystem when detecting ended non-looping sounds

    return entity;
  }
}
