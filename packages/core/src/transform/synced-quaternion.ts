/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Quaternion } from '../runtime/three.js';

/**
 * Quaternion whose internal `_x/_y/_z/_w` are backed by a Float32Array.
 *
 * @remarks
 * - Three.js quaternion math reads/writes the internal fields; by replacing
 *   those with array‑backed accessors, all operations become zero‑copy against
 *   the ECS component buffer.
 * - When no target is set, it behaves like a normal `Quaternion`.
 *
 * @category Scene
 */
export class SyncedQuaternion extends Quaternion {
  private target: Float32Array | null = null;
  private targetOffset: number = 0;
  private __x: number = 0;
  private __y: number = 0;
  private __z: number = 0;
  private __w: number = 1;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    super(x, y, z, w);
    // Preserve the values set by parent constructor before overriding properties
    this.__x = (this as any)._x;
    this.__y = (this as any)._y;
    this.__z = (this as any)._z;
    this.__w = (this as any)._w;
    this.setupProperties();
  }

  private setupProperties() {
    // Override the internal _x, _y, _z, _w properties to sync with target
    // This approach leverages the existing Three.js getter/setter architecture
    // All Three.js methods will automatically sync because they use these internal properties

    Object.defineProperty(this, '_x', {
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

    Object.defineProperty(this, '_y', {
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

    Object.defineProperty(this, '_z', {
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

    Object.defineProperty(this, '_w', {
      get: () => {
        if (this.target) {
          return this.target[this.targetOffset + 3];
        }
        return this.__w;
      },
      set: (value: number) => {
        if (this.target) {
          this.target[this.targetOffset + 3] = value;
        } else {
          this.__w = value;
        }
      },
      enumerable: true,
      configurable: true,
    });
  }

  /**
   * Bind this quaternion to a packed float array.
   * @param target Float32Array to read/write (xyzw at consecutive indices).
   * @param offset Starting index within the array (x at `offset`).
   */
  setTarget(target: Float32Array, offset = 0): this {
    this.target = target;
    this.targetOffset = offset;
    return this;
  }
}
