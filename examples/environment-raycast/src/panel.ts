/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKit, UIKitMLAsset, VisibilityState, World } from '@iwsdk/core';

export function configureWelcomePanel(world: World, panel: UIKitMLAsset): void {
  const xrButton = panel.requireElementById<UIKit.Text>('xr-button');
  xrButton.addEventListener('click', () => {
    if (world.visibilityState.value === VisibilityState.NonImmersive) {
      world.launchXR();
    } else {
      world.exitXR();
    }
  });
  world.visibilityState.subscribe((visibilityState) => {
    xrButton.setProperties({
      text:
        visibilityState === VisibilityState.NonImmersive
          ? 'Enter XR'
          : 'Exit to Browser',
    });
  });
}
