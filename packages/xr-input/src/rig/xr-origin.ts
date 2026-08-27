/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Group, Matrix4 } from 'three';

export class XROrigin extends Group {
  /** Viewer pose relative to this origin, updated from XRFrame.getViewerPose. */
  public readonly head: Group;

  /**
   * Primary target-ray poses copied from XRInputSource.targetRaySpace.
   * Local -Z is the pointing direction used by WebXR ray interactions.
   */
  public readonly raySpaces = {
    left: new Group(),
    right: new Group(),
  };

  /**
   * Primary controller grip poses copied from XRInputSource.gripSpace.
   * Attach held objects as children and tune their local transform for the
   * model; grip orientation is device/profile-defined and can differ from the
   * target ray. Sources without a gripSpace fall back to the ray pose.
   */
  public readonly gripSpaces = {
    left: new Group(),
    right: new Group(),
  };

  /** Target-ray poses for additional same-handed input sources. */
  public readonly secondaryRaySpaces = {
    left: new Group(),
    right: new Group(),
  };

  /** Grip poses for additional same-handed input sources. */
  public readonly secondaryGripSpaces = {
    left: new Group(),
    right: new Group(),
  };

  /**
   * Spaces representing the index finger tip positions for each hand.
   * Used by TouchPointer for poke interactions.
   * Updated from hand tracking joint data when hands are active.
   * Falls back to raySpaces when controllers are used.
   */
  public readonly indexTipSpaces = {
    left: new Group(),
    right: new Group(),
  };

  private headsetMatrix = new Matrix4();

  constructor() {
    super();

    this.head = new Group();
    this.head.name = 'xr-origin-head';
    this.add(
      this.head,
      this.raySpaces.left,
      this.raySpaces.right,
      this.gripSpaces.left,
      this.gripSpaces.right,
      this.indexTipSpaces.left,
      this.indexTipSpaces.right,
    );
  }

  updateHead(frame: XRFrame, referenceSpace: XRReferenceSpace): void {
    const pose = frame.getViewerPose(referenceSpace);
    if (pose) {
      this.headsetMatrix.fromArray(pose.transform.matrix);
      this.headsetMatrix.decompose(
        this.head.position,
        this.head.quaternion,
        this.head.scale,
      );
    }
  }
}
