/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

declare global {
  interface XRSession {
    trackedSources?: XRInputSourceArray;
    initiateRoomCapture?: () => Promise<undefined>;
  }

  interface XRFrame {
    readonly detectedPlanes?: XRPlaneSet;
    readonly detectedMeshes?: XRMeshSet;
    fillPoses?: (
      space: ArrayLike<XRSpace>,
      baseSpace: XRSpace,
      transforms: Float32Array,
    ) => boolean;
    fillJointRadii?: (
      space: ArrayLike<XRSpace>,
      radii: Float32Array,
    ) => boolean;
  }

  interface XRSystem {
    offerSession?: (
      mode: XRSessionMode,
      options?: XRSessionInit,
    ) => Promise<XRSession>;
  }
}

export {};
