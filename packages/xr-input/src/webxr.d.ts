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
