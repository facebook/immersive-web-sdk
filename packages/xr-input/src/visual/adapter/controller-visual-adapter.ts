/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Group, PerspectiveCamera, Scene } from 'three';
import { loadInputProfile } from '../../gamepad/input-profiles.js';
import { XRAssetLoader } from '../../xr-input-manager.js';
import {
  VisualConstructor,
  VisualImplementation,
  XRInputVisualAdapter,
} from './base-visual-adapter.js';

export class XRControllerVisualAdapter extends XRInputVisualAdapter {
  public visual?: VisualImplementation;

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
    const inputConfig = loadInputProfile(inputSource);
    this.inputConfig = inputConfig;
    this.connectVisual();
  }

  disconnect(): void {
    super.disconnect();
    this.inputConfig = undefined;
    this.disconnectVisual();
  }

  update(_frame: XRFrame, delta: number): void {
    if (this._inputSource) {
      if (this.visual && this.gripSpace) {
        this.visual.model.position.copy(this.gripSpace.position);
        this.visual.model.quaternion.copy(this.gripSpace.quaternion);
        this.visual.update(delta);
      }
    }
  }

  toggleVisual(enabled: boolean): void {
    this.visualsEnabled = enabled;
    if (this.visual) {
      this.visual.toggle(enabled);
    }
  }
}
