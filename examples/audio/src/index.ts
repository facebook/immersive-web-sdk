/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SessionMode, World } from '@iwsdk/core';
import * as horizonKit from '@pmndrs/uikit-horizon';
import { LogInIcon, RectangleGogglesIcon } from '@pmndrs/uikit-lucide';
import assets from './assets.js';
import components from './components.js';
import { SettingsSystem } from './panel.js';
import { SpinSystem } from './spin.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  components,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: {
      handTracking: { required: true },
    },
  },
  level: './scenes/audio.iwsdk.scene.json',
  features: {
    locomotion: true,
    spatialUI: { kits: [horizonKit, { LogInIcon, RectangleGogglesIcon }] },
  },
}).then((world) => {
  const { camera } = world;
  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

  world.registerSystem(SettingsSystem).registerSystem(SpinSystem);
});
