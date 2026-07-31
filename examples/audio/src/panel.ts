/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, UIKitMLAsset, VisibilityState } from '@iwsdk/core';

export class SettingsSystem extends createSystem({}) {
  init() {
    const panel = this.world.requireSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = panel.requireElementById('xr-button');
    const launchXR = () => this.world.launchXR();
    xrButton.addEventListener('click', launchXR);

    const exitButton = panel.requireElementById('exit-button');
    const exitXR = () => this.world.exitXR();
    exitButton.addEventListener('click', exitXR);

    const unsubscribe = this.world.visibilityState.subscribe(
      (visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      },
    );
    this.cleanupFuncs.push(() => {
      xrButton.removeEventListener('click', launchXR);
      exitButton.removeEventListener('click', exitXR);
      unsubscribe();
    });
  }
}
