/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function reusableFloat32View(
  current: Float32Array | undefined,
  buffer: ArrayBufferLike,
): Float32Array {
  return current?.buffer === buffer ? current : new Float32Array(buffer);
}
