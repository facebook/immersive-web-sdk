/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { type AssetManifest, AssetType } from '@iwsdk/core';

const assets = {
  'environment-desk': {
    name: 'Environment Desk',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
  },
  robot: {
    name: 'Robot',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/robot/robot.gltf',
  },
  song: {
    priority: 'background',
    type: AssetType.Audio,
    url: './audio/beepboop.mp3',
  },
  switchSound: {
    priority: 'background',
    type: AssetType.Audio,
    url: './audio/switch.mp3',
  },
  webxrLogo: {
    priority: 'critical',
    type: AssetType.Texture,
    url: './textures/webxr.jpg',
  },
} satisfies AssetManifest;

export default assets;
