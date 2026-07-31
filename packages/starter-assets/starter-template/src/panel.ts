/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  UIKitMLAsset,
  VisibilityState,
  UIKit,
} from '@iwsdk/core';

export class PanelSystem extends createSystem({}) {
  init() {
    const panel = this.world.requireSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = panel.requireElementById('xr-button') as UIKit.Text;
    const onClick = () => {
      if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
        this.world.launchXR();
      } else {
        this.world.exitXR();
      }
    };
    xrButton.addEventListener('click', onClick);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', onClick),
      this.world.visibilityState.subscribe((visibilityState) => {
        xrButton.setProperties({
          text:
            visibilityState === VisibilityState.NonImmersive
              ? 'Enter XR'
              : 'Exit to Browser',
        });
      }),
    );
  }
}
