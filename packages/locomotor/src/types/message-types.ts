/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export enum MessageType {
  Init = 0,
  Config = 1,
  Slide = 2,
  Teleport = 3,
  ParabolicRaycast = 4,
  PositionUpdate = 5,
  RaycastUpdate = 6,
  AddEnvironment = 7,
  RemoveEnvironment = 8,
  UpdateKinematicEnvironment = 9,
  Jump = 10,
}
