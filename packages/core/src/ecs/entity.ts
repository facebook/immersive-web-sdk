/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { PointerEventsMap } from '@pmndrs/pointer-events';
import type { Object3D, Object3DEventMap } from '../runtime/index.js';

declare module 'elics' {
  interface Entity {
    object3D?: Object3D<Object3DEventMap & PointerEventsMap>;
  }
}

export { Entity } from 'elics';
/** Sentinel value used for “no parent” in Transform.parent. @category ECS */
export const NullEntity = -1;
