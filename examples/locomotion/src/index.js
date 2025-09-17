/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, SessionMode, World } from '@iwsdk/core';

import { SettingsSystem } from './panel.js';
import { ElevatorSystem } from './elevator.js';

const assets = {
  switchSound: {
    url: '/audio/switch.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
};

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    requiredFeatures: ['hand-tracking'],
  },
  level: '/glxf/Composition.glxf',
  features: {
    enableGrabbing: true,
    enableLocomotion: true,
  },
}).then((world) => {
  const { camera } = world;
  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

  world.registerSystem(SettingsSystem).registerSystem(ElevatorSystem);
});
