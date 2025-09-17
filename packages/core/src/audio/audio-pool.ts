/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Audio as AmbientAudio,
  AudioListener,
  Group,
  Object3D,
  PositionalAudio,
} from '../runtime/index.js';

/**
 * Runtime bookkeeping for a playing audio instance used by {@link AudioSystem}.
 * @category Audio
 */
export interface AudioInstance<T extends AmbientAudio | PositionalAudio> {
  audio: T;
  startTime: number;
  fadeStartTime?: number;
  fadeStartVolume?: number;
  fadeDuration?: number;
  isFadingOut?: boolean;
  isFadingIn?: boolean;
  pausedBySessionEnd?: boolean;
}

/**
 * Fixed-size pool of Three.js `Audio`/`PositionalAudio` objects.
 *
 * @remarks
 * - Pre-allocates a number of audio nodes under a hidden `Group` attached to the parent.
 * - Minimizes GC churn by reusing nodes across playbacks.
 * - Used internally by {@link AudioSystem}, but exposed for advanced scenarios.
 *
 * @category Audio
 */
export class AudioPool<T extends AmbientAudio | PositionalAudio> {
  private container: Group;
  private available: T[] = [];
  private allInstances: T[] = [];

  /**
   * Create a pool.
   * @param listener AudioListener to attach to each instance.
   * @param size Number of instances to pre‑allocate.
   * @param positional When true, creates `PositionalAudio`; otherwise ambient `Audio`.
   * @param parent Group/Object3D to attach internal container to.
   */
  constructor(
    listener: AudioListener,
    size: number,
    positional: boolean,
    parent: Object3D,
  ) {
    this.container = new Group();
    parent.add(this.container);

    // Pre-create audio instances
    for (let i = 0; i < size; i++) {
      const audio = positional
        ? new PositionalAudio(listener)
        : new AmbientAudio(listener);

      this.container.add(audio);
      this.available.push(audio as T);
      this.allInstances.push(audio as T);
    }
  }

  /** Acquire an available audio node or `null` if exhausted. */
  acquire(): T | null {
    if (this.available.length === 0) {
      return null;
    }

    const audio = this.available.pop()!;
    return audio;
  }

  /** Stop, reset volume, and return an audio node to the pool. */
  release(audio: T): void {
    // Stop the audio if it's still playing
    if (audio.isPlaying) {
      audio.stop();
    }

    // Reset audio state
    audio.setVolume(1.0);

    // Return to available pool
    if (!this.available.includes(audio)) {
      this.available.push(audio);
    }
  }

  /** Stop and return all nodes to the available pool. */
  releaseAll(): void {
    // Stop all instances and return them to the pool
    for (const audio of this.allInstances) {
      if (audio.isPlaying) {
        audio.stop();
      }
      audio.setVolume(1.0);
    }

    this.available = [...this.allInstances];
  }

  /** Disconnect and dispose all nodes and the container. */
  dispose(): void {
    // Clean up all audio instances
    for (const audio of this.allInstances) {
      if (audio.isPlaying) {
        audio.stop();
      }
      audio.disconnect();
    }

    // Remove from parent
    this.container.removeFromParent();
    this.container.clear();

    this.available = [];
    this.allInstances = [];
  }

  /** Number of nodes currently checked out. */
  getActiveCount(): number {
    return this.allInstances.length - this.available.length;
  }

  /** Total nodes in the pool. */
  getTotalCount(): number {
    return this.allInstances.length;
  }

  /** Return all nodes (checked out and available). */
  getAllInstances(): T[] {
    return this.allInstances;
  }
}
