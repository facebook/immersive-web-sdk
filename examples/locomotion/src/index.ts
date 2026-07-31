/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SessionMode, UIKitMLAsset, World } from '@iwsdk/core';
import assets from './assets.js';
import components from './components.js';
import { ElevatorSystem } from './elevator.js';
import { configureWelcomePanel, SettingsSystem } from './panel.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  components,
  level: './scenes/locomotion.iwsdk.scene.json',
  render: {
    near: 0.001,
    far: 300,
  },
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: {
      handTracking: { required: true },
    },
  },
  features: {
    grabbing: true,
    locomotion: true,
    spatialUI: true,
  },
}).then((world) => {
  world.camera.position.set(-4, 1.5, -6);
  world.camera.rotateY(-Math.PI * 0.75);

  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
  world.registerSystem(SettingsSystem).registerSystem(ElevatorSystem);
});
