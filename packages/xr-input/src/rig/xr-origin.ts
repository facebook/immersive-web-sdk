/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Group, Matrix4 } from 'three';

/**
 * Source of the gaze pose stored in {@link XROrigin.eyeSpace}.
 *
 * - `tracked`: a pose sourced from the `XRInputSource` whose
 *   `targetRayMode` is `'gaze'`.
 * - `none`: no source, or no valid pose sampled this frame.
 */
export type GazeOrigin = 'tracked' | 'none';

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

  /** Latest valid gaze target-ray pose. Consult {@link gazeOrigin} before use. */
  public readonly eyeSpace: Group;

  /** Reports whether {@link XROrigin.eyeSpace} has a valid gaze pose this frame. */
  public gazeOrigin: GazeOrigin = 'none';

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
  private eyeMatrix = new Matrix4();

  constructor() {
    super();

    this.head = new Group();
    this.head.name = 'xr-origin-head';
    this.eyeSpace = new Group();
    this.eyeSpace.name = 'xr-origin-eye';
    this.add(
      this.head,
      this.eyeSpace,
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

  /**
   * Overwrite {@link XROrigin.eyeSpace} with a real eye-tracking pose and flip
   * {@link XROrigin.gazeOrigin} to `'tracked'`.
   *
   * @param transform Gaze target-ray transform, posed against the same
   * reference space {@link XROrigin.updateHead} uses — i.e. this group's space.
   */
  applyTrackedEyePose(transform: XRRigidTransform): void {
    this.eyeMatrix.fromArray(transform.matrix);
    this.eyeMatrix.decompose(
      this.eyeSpace.position,
      this.eyeSpace.quaternion,
      this.eyeSpace.scale,
    );
    this.gazeOrigin = 'tracked';
  }

  /**
   * Reset gaze to a known-unavailable state. Called when the session ends so
   * {@link XROrigin.gazeOrigin} doesn't report a stale tracked pose.
   */
  clearGaze(): void {
    this.gazeOrigin = 'none';
  }
}
