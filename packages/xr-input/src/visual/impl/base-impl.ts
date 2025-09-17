/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Group, Object3D, PerspectiveCamera, Scene } from 'three';
import { InputLayout } from '../../gamepad/input-profiles.js';
import { XRInputVisualAdapter } from '../adapter/base-visual-adapter.js';
import { XRControllerVisualAdapter } from '../adapter/controller-visual-adapter.js';
import { XRHandVisualAdapter } from '../adapter/hand-visual-adapter.js';

export interface VisualImplementation {
  model: Group;
  xrInput?: XRInputVisualAdapter;
  init: () => void;
  connect: (inputSource: XRInputSource, enabled: boolean) => void;
  disconnect: () => void;
  toggle: (enabled: boolean) => void;
  update: (delta: number) => void;
}

export interface VisualConstructor<T extends VisualImplementation> {
  new (
    scene: Scene,
    camera: PerspectiveCamera,
    gltfScene: Group,
    layout: InputLayout,
  ): T;
  assetProfileId?: string;
  assetKeyPrefix: string;
  assetPath?: string;
}

export interface HandPose {
  [jointName: string]: number[];
}

export class BaseControllerVisual implements VisualImplementation {
  protected gamepad?: Gamepad;
  protected enabled = true;
  public xrInput?: XRControllerVisualAdapter;

  constructor(
    protected scene: Scene,
    protected camera: PerspectiveCamera,
    public model: Group,
    protected layout: InputLayout,
  ) {}

  init() {}

  connect(inputSource: XRInputSource, enabled: boolean) {
    this.toggle(enabled);
    this.gamepad = inputSource.gamepad;
  }

  disconnect() {
    this.gamepad = undefined;
  }

  toggle(enabled: boolean) {
    if (this.enabled !== enabled) {
      this.model.visible = enabled;
      this.enabled = enabled;
    }
  }

  update(_delta: number) {}
}

export class BaseHandVisual implements VisualImplementation {
  protected joints: (Object3D | undefined)[] = [];
  protected enabled = true;
  public xrInput?: XRHandVisualAdapter;

  constructor(
    protected scene: Scene,
    protected camera: PerspectiveCamera,
    public model: Group,
    protected layout: InputLayout,
  ) {}

  init() {}

  connect(inputSource: XRInputSource, enabled: boolean) {
    this.toggle(enabled);
    const hand = inputSource.hand!;
    hand.forEach((jointSpace) => {
      const jointName = jointSpace.jointName;
      this.joints.push(this.model.getObjectByName(jointName));
    });
  }

  disconnect() {
    this.joints.length = 0;
  }

  toggle(enabled: boolean) {
    if (this.enabled !== enabled) {
      this.model.visible = enabled;
      this.enabled = enabled;
    }
  }

  update() {
    const jointTransforms = this.xrInput?.jointTransforms;
    if (this.enabled && jointTransforms) {
      this.joints.forEach((bone, index) => {
        if (bone) {
          bone.matrix.fromArray(jointTransforms, index * 16);
          bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
        }
      });
    }
  }
}
