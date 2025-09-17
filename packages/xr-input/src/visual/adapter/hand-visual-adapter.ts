/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Group, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { InputLayout } from '../../gamepad/input-profiles.js';
import { XRAssetLoader } from '../../xr-input-manager.js';
import {
  HandPose,
  InputConfig,
  VisualConstructor,
  VisualImplementation,
  XRInputVisualAdapter,
} from './base-visual-adapter.js';

const PINCH_COOLDOWN = 0.2;

export const defaultHandLayout: InputLayout = {
  selectComponentId: 'pinch',
  components: {
    pinch: {
      type: 'button',
      gamepadIndices: {
        button: 0,
      },
      rootNodeName: '',
      visualResponses: {},
    },
    swipeleft: {
      type: 'button',
      gamepadIndices: {
        button: 5,
      },
      rootNodeName: '',
      visualResponses: {},
    },
    swiperight: {
      type: 'button',
      gamepadIndices: {
        button: 6,
      },
      rootNodeName: '',
      visualResponses: {},
    },
    swipeup: {
      type: 'button',
      gamepadIndices: {
        button: 7,
      },
      rootNodeName: '',
      visualResponses: {},
    },
    swipedown: {
      type: 'button',
      gamepadIndices: {
        button: 8,
      },
      rootNodeName: '',
      visualResponses: {},
    },
    confirm: {
      type: 'button',
      gamepadIndices: {
        button: 9,
      },
      rootNodeName: '',
      visualResponses: {},
    },
  },
  rootNodeName: '',
  gamepadMapping: 'xr-standard',
  assetPath: '',
};

export class XRHandVisualAdapter extends XRInputVisualAdapter {
  public jointSpaces: XRJointSpace[] = [];
  public jointTransforms?: Float32Array;
  private indexTip?: XRSpace;
  private thumbTip?: XRSpace;
  private pinchThreshold = 0.008;
  private pinchCooldown = 0;
  private pinchData = { prev: false, curr: false };
  private vec3 = new Vector3();
  private mat4 = new Matrix4();
  private pendingCapture?: {
    refSpace: XRSpace;
    resolve: (value: HandPose) => void;
    reject: () => void;
  };
  private gripXRSpace: XRSpace | undefined;

  constructor(
    playerSpace: Group,
    handedness: XRHandedness,
    visualsEnabled: boolean,
    visualClass: VisualConstructor<VisualImplementation>,
    scene: Scene,
    camera: PerspectiveCamera,
    assetLoader: XRAssetLoader,
  ) {
    super(
      playerSpace,
      handedness,
      visualsEnabled,
      visualClass,
      scene,
      camera,
      assetLoader,
    );
  }

  connect(inputSource: XRInputSource) {
    super.connect(inputSource);
    const hand = inputSource.hand!;
    this.gripXRSpace = inputSource.gripSpace || inputSource.targetRaySpace;

    hand.forEach((jointSpace) => {
      if (jointSpace.jointName === 'index-finger-tip') {
        this.indexTip = jointSpace;
      } else if (jointSpace.jointName === 'thumb-tip') {
        this.thumbTip = jointSpace;
      }
      this.jointSpaces.push(jointSpace);
    });

    this.jointTransforms = new Float32Array(hand.size * 16);
    this.inputConfig = {
      inputSource,
      layout: defaultHandLayout,
    } as InputConfig;
    this.connectVisual();
  }

  disconnect(): void {
    super.disconnect();
    this.jointTransforms = undefined;
    this.jointSpaces.length = 0;
    this.indexTip = undefined;
    this.thumbTip = undefined;
    this.disconnectVisual();
  }

  update(frame: XRFrame, delta: number) {
    if (this._inputSource && this.jointTransforms) {
      const success =
        frame.fillPoses?.(
          this.jointSpaces,
          this.gripXRSpace!,
          this.jointTransforms,
        ) ?? false;
      if (success) {
        this.updatePinch(frame, delta);
        if (this.visual && this.gripSpace) {
          this.visual.model.position.copy(this.gripSpace.position);
          this.visual.model.quaternion.copy(this.gripSpace.quaternion);
          this.visual.update(delta);
        }

        if (this.pendingCapture) {
          const { refSpace, resolve, reject } = this.pendingCapture;
          const jointTransforms = new Float32Array(this.jointTransforms.length);
          const success =
            frame.fillPoses?.(this.jointSpaces, refSpace, jointTransforms) ??
            false;
          if (success) {
            const pose: HandPose = {};
            this.jointSpaces.forEach((jointSpace, index) => {
              pose[jointSpace.jointName] = this.mat4
                .fromArray(jointTransforms, index * 16)
                .toArray();
            });
            resolve(pose);
          } else {
            reject();
          }
          this.pendingCapture = undefined;
        }
      }
    }
  }

  private updatePinch(frame: XRFrame, delta: number) {
    this.pinchData.prev = this.pinchData.curr;

    if (this.pinchCooldown > 0) {
      this.pinchData.curr = true;
      this.pinchCooldown -= delta;
      return;
    }

    if (this.indexTip && this.thumbTip) {
      const pose = frame.getPose(this.indexTip, this.thumbTip);
      if (pose) {
        this.vec3.copy(pose.transform.position);
        const pinching = this.vec3.length() < this.pinchThreshold;
        if (pinching) {
          this.pinchCooldown = PINCH_COOLDOWN;
        }
        this.pinchData.curr = pinching;
      }
    }
  }

  toggleVisual(enabled: boolean): void {
    this.visualsEnabled = enabled;
    if (this.visual) {
      this.visual.toggle(enabled);
    }
  }

  // getSelectStart() {
  // 	return this.pinchData.curr && !this.pinchData.prev;
  // }

  // getSelectEnd() {
  // 	return !this.pinchData.curr && this.pinchData.prev;
  // }

  // getSelecting() {
  // 	return this.pinchData.curr;
  // }

  capturePose(refSpace: XRSpace) {
    return new Promise<HandPose>((resolve, reject) => {
      this.pendingCapture = {
        refSpace,
        resolve,
        reject,
      };
    });
  }
}
