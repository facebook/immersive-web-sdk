/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

declare global {
  interface XRSession {
    trackedSources?: XRInputSourceArray;
  }

  interface XRFrame {
    // Optional polyfilled APIs used by hand visual adapter
    fillPoses?: (
      space: ArrayLike<XRSpace>,
      baseSpace: XRSpace,
      transforms: Float32Array,
    ) => boolean;
  }
}

export {};
