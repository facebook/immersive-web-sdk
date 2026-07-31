/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SessionMode, UIKitMLAsset, World } from '@iwsdk/core';
import assets from './assets.js';
import components from './components.js';
import { configureWelcomePanel } from './panel.js';
import { RobotSystem } from './robot.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  components,
  level: './scenes/poke.iwsdk.scene.json',
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: { useWorker: true },
    grabbing: true,
    physics: false,
    sceneUnderstanding: false,
    spatialUI: true,
  },
}).then((world) => {
  world.camera.position.set(-4, 1.5, -6);
  world.camera.rotateY(-Math.PI * 0.75);

  const panel = world.requireSceneObject<UIKitMLAsset>('welcome-panel');
  configureWelcomePanel(
    world,
    panel,
    world.requireSceneEntity('welcome-panel'),
  );
  world.registerSystem(RobotSystem);
});
