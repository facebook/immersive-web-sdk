/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector3 } from '../runtime/three.js';

/**
 * Vector3 whose x/y/z accessors read from and write to a target Float32Array.
 *
 * @remarks
 * - Used by {@link TransformSystem} to bind Object3D.position/scale directly to
 *   ECS component storage for zero‑copy updates.
 * - When no target is set, falls back to internal fields so it behaves like a
 *   normal `Vector3`.
 *
 * @category Scene
 */
export class SyncedVector3 extends Vector3 {
  private target: Float32Array | null = null;
  private targetOffset: number = 0;
  private __x: number = 0;
  private __y: number = 0;
  private __z: number = 0;

  constructor(x = 0, y = 0, z = 0) {
    super(x, y, z);
    // Preserve the values set by parent constructor before overriding properties
    this.__x = this.x;
    this.__y = this.y;
    this.__z = this.z;
    this.setupProperties();
  }

  private setupProperties() {
    // Override x, y, z properties to sync with target
    Object.defineProperty(this, 'x', {
      get: () => {
        if (this.target) {
          return this.target[this.targetOffset];
        }
        // Fallback to a private property when no target is set
        return this.__x;
      },
      set: (value: number) => {
        if (this.target) {
          this.target[this.targetOffset] = value;
        } else {
          this.__x = value;
        }
      },
      enumerable: true,
      configurable: true,
    });

    Object.defineProperty(this, 'y', {
      get: () => {
        if (this.target) {
          return this.target[this.targetOffset + 1];
        }
        return this.__y;
      },
      set: (value: number) => {
        if (this.target) {
          this.target[this.targetOffset + 1] = value;
        } else {
          this.__y = value;
        }
      },
      enumerable: true,
      configurable: true,
    });

    Object.defineProperty(this, 'z', {
      get: () => {
        if (this.target) {
          return this.target[this.targetOffset + 2];
        }
        return this.__z;
      },
      set: (value: number) => {
        if (this.target) {
          this.target[this.targetOffset + 2] = value;
        } else {
          this.__z = value;
        }
      },
      enumerable: true,
      configurable: true,
    });
  }

  /**
   * Bind this vector to a packed float array.
   * @param target Float32Array to read/write.
   * @param offset Starting index within the array (x at `offset`).
   */
  setTarget(target: Float32Array, offset = 0): this {
    this.target = target;
    this.targetOffset = offset;
    return this;
  }
}
