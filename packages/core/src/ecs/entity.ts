/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { PointerEventsMap } from '@pmndrs/pointer-events';
import { Entity as ElicsEntity } from 'elics';
import type { Object3D, Object3DEventMap } from '../runtime/index.js';

/** Options for {@link Entity.dispose}. @category ECS */
export interface EntityDisposeOptions {
  /**
   * Whether to dispose GPU resources attached to this entity's Object3D tree.
   *
   * @defaultValue true
   */
  disposeResources?: boolean;
}

declare module 'elics' {
  interface Entity {
    object3D?: Object3D<Object3DEventMap & PointerEventsMap>;
    /** @internal Flag to indicate GPU resources should be disposed on destroy */
    _disposeResources?: boolean;
    /**
     * Destroy the entity and dispose of its GPU resources (geometry, materials, textures).
     *
     * @remarks
     * Use this instead of `destroy()` when you want to fully clean up GPU memory.
     * Use with caution when resources may be shared across multiple entities.
     *
     * @example
     * ```ts
     * // Remove entity and free GPU resources
     * entity.dispose();
     *
     * // Remove entity while preserving shared geometry/materials
     * entity.dispose({ disposeResources: false });
     * ```
     */
    dispose(options?: EntityDisposeOptions): void;
  }
}

// Add dispose method to Entity prototype
ElicsEntity.prototype.dispose = function (
  this: ElicsEntity,
  options?: EntityDisposeOptions,
) {
  if (options?.disposeResources !== false) {
    (this as any)._disposeResources = true;
  }
  this.destroy();
};

export { Entity } from 'elics';
/** Sentinel value used for "no parent" in Transform.parent. @category ECS */
export const NullEntity = -1;
