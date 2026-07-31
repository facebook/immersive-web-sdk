/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SessionMode, UIKitMLAsset, World } from '@iwsdk/core';
import assets from './assets.js';
import { configureWelcomePanel } from './panel.js';
import { RaycastPlantSystem } from './raycast-plant.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  level: './scenes/environment-raycast.iwsdk.scene.json',
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    offer: 'always',
    features: {
      handTracking: true,
      anchors: false,
      hitTest: { required: true },
      planeDetection: false,
      meshDetection: false,
      layers: true,
    },
  },
  features: {
    locomotion: false,
    grabbing: false,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: true,
  },
}).then((world) => {
  world.camera.position.set(0, 1, 0.5);

  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
  world.registerSystem(RaycastPlantSystem);
});
