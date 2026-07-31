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
    features: {
      handTracking: { required: true },
    },
  },
  level: './scenes/grab.iwsdk.scene.json',
  features: {
    grabbing: { useHandPinchForGrab: true },
    locomotion: true,
    spatialUI: true,
  },
}).then((world) => {
  const { camera } = world;
  camera.position.set(0, 1.3, 0);

  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
});
