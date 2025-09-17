/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, SessionMode, World } from '@iwsdk/core';

const assets = {
  switchSound: {
    url: '/audio/switch.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
  webxrLogo: {
    url: '/textures/webxr.jpg',
    type: AssetType.Texture,
    priority: 'critical',
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
  camera.position.set(0, 1.3, 0);
});
