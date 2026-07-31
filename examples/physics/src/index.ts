/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SessionMode, UIKitMLAsset, World } from '@iwsdk/core';
import assets from './assets.js';
import { configureWelcomePanel } from './panel.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: { handTracking: true },
  },
  level: './scenes/physics.iwsdk.scene.json',
  features: {
    grabbing: true,
    locomotion: true,
    physics: true,
    spatialUI: true,
  },
}).then((world) => {
  world.camera.position.set(5, 2, 5);
  world.camera.rotateY(Math.PI / 4);

  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
});
