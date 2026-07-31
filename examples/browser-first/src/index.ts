/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import assets from './assets.js';
import { BrowserFirstFeedbackSystem } from './feedback.js';
import { BrowserMouseLookSystem } from './mouselook.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  level: './scenes/browser-first.iwsdk.scene.json',
  xr: false,
  render: {
    near: 0.001,
    far: 200,
    camera: {
      position: [0, 1.6, 0],
      lookAt: [0, 1.55, -1],
    },
  },
  input: {
    canvasPointerEvents: true,
  },
  features: {
    grabbing: true,
    locomotion: {
      browserControls: true,
    },
    physics: true,
    spatialUI: true,
  },
}).then((world) => {
  world
    .registerSystem(BrowserFirstFeedbackSystem)
    .registerSystem(BrowserMouseLookSystem);
});
