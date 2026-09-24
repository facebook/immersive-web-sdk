/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitMLAsset, VisibilityState, World } from '@iwsdk/core';

export function configureWelcomePanel(world: World, panel: UIKitMLAsset): void {
  const xrButton = panel.requireElementById('xr-button');
  xrButton.addEventListener('click', () => {
    world.launchXR();
  });

  const exitButton = panel.requireElementById('exit-button');
  exitButton.addEventListener('click', () => {
    world.exitXR();
  });
  world.visibilityState.subscribe((visibilityState) => {
    const is2D = visibilityState === VisibilityState.NonImmersive;
    xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
    exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
  });
}
