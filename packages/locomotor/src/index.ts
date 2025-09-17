/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export {
  Locomotor,
  type LocomotorConfig,
  type PositionUpdate,
  type RaycastResult,
} from './core/locomotor.js';
export { EnvironmentType } from './types/environment-types.js';
export type { Environment } from './environment/environment-manager.js';
export { sampleParabolicCurve } from './physics/math-utils.js';
